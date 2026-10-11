import {
	DRAWER_DEFAULT_CLOSE_THRESHOLD,
	DRAWER_DRAG_ACTIVATION_PX,
	DRAWER_VELOCITY_THRESHOLD,
	canUseBodyFix,
	createTouchScrollGuard,
	getCloseDirectionSign,
	isDrawerNoDragTarget,
	isIOSBrowser,
	isVerticalDrawer,
	lockDocumentOverscroll,
	lockDocumentScroll,
	restoreDocumentOverscroll,
	restoreDocumentScroll,
} from '@guillemservera/drawer-core'
import type { DrawerDirection } from '@guillemservera/drawer-core'
import './style.css'

// Safari scrolls the page behind `overflow: hidden`; pin the body instead (same fix as vue-drawer).
let bodyPins = 0
let pinned: { x: number, y: number, position: string, top: string, left: string, right: string } | null = null

function pinBody() {
	if (bodyPins++ || !canUseBodyFix()) return
	const { position, top, left, right } = document.body.style
	pinned = { x: window.scrollX, y: window.scrollY, position, top, left, right }
	Object.assign(document.body.style, { position: 'fixed', top: `${-pinned.y}px`, left: `${-pinned.x}px`, right: '0px' })
}

function unpinBody() {
	if (--bodyPins || !pinned) return
	const { x, y, ...style } = pinned
	pinned = null
	Object.assign(document.body.style, style)
	// `instant` overrides a consumer's `scroll-behavior: smooth`.
	window.scrollTo({ left: x, top: y, behavior: 'instant' })
}

const Base = (globalThis.HTMLElement ?? class {}) as typeof HTMLElement

export class AstroDrawer extends Base {
	static observedAttributes = ['open', 'dismissible']

	#dialog: HTMLDialogElement | null = null
	#listeners: AbortController | null = null
	#unguard: (() => void) | null = null
	#locked = false
	#closeId = 0
	#drag: { x: number, y: number, t: number, active: boolean } | null = null

	// Like vue's `dismissible` prop: true unless set to "false".
	get #dismissible() {
		return this.getAttribute('dismissible') !== 'false'
	}

	get #direction(): DrawerDirection {
		const value = this.getAttribute('direction')
		return value === 'top' || value === 'left' || value === 'right' ? value : 'bottom'
	}

	/** Pointer travel since the drag start: `[toward the closing edge, across it]`. */
	#delta(event: PointerEvent, drag: { x: number, y: number }) {
		const dx = event.clientX - drag.x
		const dy = event.clientY - drag.y
		const sign = getCloseDirectionSign(this.#direction)
		return isVerticalDrawer(this.#direction) ? [dy * sign, dx] : [dx * sign, dy]
	}

	get open() {
		return this.hasAttribute('open')
	}

	set open(value: boolean) {
		this.toggleAttribute('open', value)
	}

	show() {
		this.open = true
	}

	close() {
		this.open = false
	}

	connectedCallback() {
		const dialog = this.querySelector('dialog')
		if (!dialog) return
		this.#dialog = dialog
		this.#listeners = new AbortController()
		const on = <K extends keyof HTMLElementEventMap>(type: K, listener: (event: HTMLElementEventMap[K]) => void) =>
			dialog.addEventListener(type, listener, { signal: this.#listeners!.signal })

		on('cancel', (event) => {
			event.preventDefault()
			if (this.#dismissible) this.close()
		})
		// Any native close (our animated close, unpreventable Escape, form[method=dialog]) ends here.
		on('close', () => {
			this.#closeId++
			this.#unlock()
			this.#drag = null
			dialog.style.transition = dialog.style.transform = '' // a native close can land mid-drag
			delete this.dataset.state
			this.removeAttribute('open')
			this.dispatchEvent(new CustomEvent('close'))
		})
		// The ::backdrop hit-tests as the dialog itself, so tell them apart by geometry.
		const onBackdrop = (event: MouseEvent) => {
			if (event.target !== dialog) return false
			const rect = dialog.getBoundingClientRect()
			const { clientX: x, clientY: y } = event
			return x < rect.left || x > rect.right || y < rect.top || y > rect.bottom
		}
		on('click', (event) => {
			// `[data-drawer-close]` is an explicit close (vue's DrawerClose), so it ignores `dismissible` but honors a prevented click.
			if (onBackdrop(event) ? this.#dismissible : !event.defaultPrevented && (event.target as Element).closest('[data-drawer-close]')) this.close()
		})
		on('pointerdown', (event) => {
			if (event.button || !this.#dismissible || onBackdrop(event) || isDrawerNoDragTarget(event.target)) return
			// Off the handle, an ancestor scrolled away from the closing edge owns the gesture: dragging toward that edge scrolls it back first.
			const target = event.target as Element
			const vertical = isVerticalDrawer(this.#direction)
			const toEnd = getCloseDirectionSign(this.#direction) < 0
			for (let el: Element | null = target.closest('[data-drawer-handle]') ? null : target; el && el !== this; el = el.parentElement) {
				// shortcut: RTL scrollers report a negative scrollLeft, so left/right drawers misread them; handle RTL if needed.
				const scrolled = vertical ? el.scrollTop : el.scrollLeft
				// Bottom/right: scrolled at all. Top/left: a real scroller (ellipsized labels overflow too) not yet at its end.
				if (toEnd
					? (vertical ? el.scrollHeight - el.clientHeight : el.scrollWidth - el.clientWidth) - scrolled > 1 && /auto|scroll/.test(getComputedStyle(el)[vertical ? 'overflowY' : 'overflowX'])
					: scrolled > 0) return
			}
			this.#drag = { x: event.clientX, y: event.clientY, t: event.timeStamp, active: false }
		})
		on('pointermove', (event) => {
			const drag = this.#drag
			if (!drag) return
			const [d, across] = this.#delta(event, drag)
			if (!drag.active) {
				if (Math.abs(d) < DRAWER_DRAG_ACTIVATION_PX) return
				if (d < 0 || Math.abs(across) > d) {
					this.#drag = null
					return
				}
				drag.active = true
				dialog.setPointerCapture?.(event.pointerId)
				dialog.style.transition = 'none'
			}
			const direction = this.#direction
			dialog.style.transform = `translate${isVerticalDrawer(direction) ? 'Y' : 'X'}(${Math.max(d, 0) * getCloseDirectionSign(direction)}px)`
		})
		const release = (event: PointerEvent) => {
			const drag = this.#drag
			this.#drag = null
			if (!drag?.active) return
			const [d] = this.#delta(event, drag)
			// Clearing inline styles lets the CSS transition run from the dragged position.
			dialog.style.transition = dialog.style.transform = ''
			const fast = d / Math.max(event.timeStamp - drag.t, 1) > DRAWER_VELOCITY_THRESHOLD
			const size = isVerticalDrawer(this.#direction) ? dialog.offsetHeight : dialog.offsetWidth
			if (event.type === 'pointerup' && (fast || d > size * DRAWER_DEFAULT_CLOSE_THRESHOLD)) this.close()
		}
		on('pointerup', release)
		on('pointercancel', release)

		this.#sync()
	}

	disconnectedCallback() {
		this.#listeners?.abort()
		this.#closeId++
		this.#unlock()
		this.#dialog?.close()
		delete this.dataset.state
	}

	attributeChangedCallback() {
		this.#sync()
	}

	async #sync() {
		const dialog = this.#dialog
		if (!dialog || !this.isConnected) return
		// Chromium/WebKit force-close a modal after repeated Escapes even when `cancel` is prevented; `closedby="none"` stops that.
		// shortcut: engines without `closedby` keep only the prevented `cancel`, so a repeated Escape can still close; re-open on `close` if they matter.
		if (this.#dismissible) dialog.removeAttribute('closedby')
		else dialog.setAttribute('closedby', 'none')

		if (this.open) {
			this.#closeId++
			if (!dialog.open) {
				dialog.showModal()
				this.#lock()
				// Touch drags on a scroll container become native scrolls, so only non-scrolling sheets block panning on the drag axis.
				// Sidebars always keep vertical panning: they scroll across their drag axis.
				// shortcut: measured once per open, content that grows while open keeps the old value; use a ResizeObserver if that matters.
				dialog.style.touchAction = !isVerticalDrawer(this.#direction) ? 'pan-y' : dialog.scrollHeight > dialog.clientHeight ? '' : 'none'
				dialog.getBoundingClientRect() // commit the closed transform so the open transition runs
			}
			this.dataset.state = 'open'
			return
		}

		if (!dialog.open) return
		const closeId = ++this.#closeId
		delete this.dataset.state
		// No running transition (reduced motion, zero duration, no style.css) resolves immediately.
		const transitions = dialog.getAnimations?.({ subtree: true }).filter(a => (a.effect as KeyframeEffect | null)?.target === dialog) ?? []
		await Promise.allSettled(transitions.map(a => a.finished))
		if (closeId === this.#closeId) dialog.close()
	}

	#lock() {
		if (this.#locked) return
		this.#locked = true
		lockDocumentScroll()
		lockDocumentOverscroll()
		pinBody()
		if (isIOSBrowser()) this.#unguard = createTouchScrollGuard(() => this.#dialog)
	}

	#unlock() {
		if (!this.#locked) return
		this.#locked = false
		this.#unguard?.()
		this.#unguard = null
		unpinBody()
		restoreDocumentOverscroll()
		restoreDocumentScroll()
	}
}

declare global {
	interface HTMLElementTagNameMap {
		'astro-drawer': AstroDrawer
	}
}

if (typeof customElements !== 'undefined' && !customElements.get('astro-drawer')) {
	customElements.define('astro-drawer', AstroDrawer)
	// Declarative trigger: <button data-drawer-open="#my-drawer">.
	document.addEventListener('click', (event) => {
		const selector = (event.target as Element).closest?.('[data-drawer-open]')?.getAttribute('data-drawer-open')
		const drawer = selector && document.querySelector(selector)
		if (drawer instanceof AstroDrawer) drawer.show()
	})
}
