import {
	DRAWER_DEFAULT_CLOSE_THRESHOLD,
	DRAWER_DRAG_ACTIVATION_PX,
	DRAWER_VELOCITY_THRESHOLD,
	canUseBodyFix,
	createTouchScrollGuard,
	isDrawerNoDragTarget,
	isIOSBrowser,
	lockDocumentOverscroll,
	lockDocumentScroll,
	restoreDocumentOverscroll,
	restoreDocumentScroll,
} from '@guillemservera/drawer-core'
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
	static observedAttributes = ['open']

	#dialog: HTMLDialogElement | null = null
	#listeners: AbortController | null = null
	#unguard: (() => void) | null = null
	#locked = false
	#closeId = 0
	#drag: { x: number, y: number, t: number, active: boolean } | null = null

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
			this.close()
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
			if (onBackdrop(event)) this.close()
		})
		on('pointerdown', (event) => {
			if (event.button || onBackdrop(event) || isDrawerNoDragTarget(event.target)) return
			// Off the handle, a scrolled ancestor owns the gesture: dragging down scrolls it back first.
			const target = event.target as Element
			for (let el: Element | null = target.closest('[data-drawer-handle]') ? null : target; el && el !== this; el = el.parentElement) {
				if (el.scrollTop > 0) return
			}
			this.#drag = { x: event.clientX, y: event.clientY, t: event.timeStamp, active: false }
		})
		on('pointermove', (event) => {
			const drag = this.#drag
			if (!drag) return
			const dy = event.clientY - drag.y
			if (!drag.active) {
				if (Math.abs(dy) < DRAWER_DRAG_ACTIVATION_PX) return
				if (dy < 0 || Math.abs(event.clientX - drag.x) > dy) {
					this.#drag = null
					return
				}
				drag.active = true
				dialog.setPointerCapture?.(event.pointerId)
				dialog.style.transition = 'none'
			}
			dialog.style.transform = `translateY(${Math.max(dy, 0)}px)`
		})
		const release = (event: PointerEvent) => {
			const drag = this.#drag
			this.#drag = null
			if (!drag?.active) return
			const dy = event.clientY - drag.y
			// Clearing inline styles lets the CSS transition run from the dragged position.
			dialog.style.transition = dialog.style.transform = ''
			const fast = dy / Math.max(event.timeStamp - drag.t, 1) > DRAWER_VELOCITY_THRESHOLD
			if (event.type === 'pointerup' && (fast || dy > dialog.offsetHeight * DRAWER_DEFAULT_CLOSE_THRESHOLD)) this.close()
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

		if (this.open) {
			this.#closeId++
			if (!dialog.open) {
				dialog.showModal()
				this.#lock()
				// Touch drags on a scroll container become native scrolls, so only non-scrolling sheets block panning.
				// shortcut: measured once per open, content that grows while open keeps the old value; use a ResizeObserver if that matters.
				dialog.style.touchAction = dialog.scrollHeight > dialog.clientHeight ? '' : 'none'
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
