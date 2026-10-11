import {
	DRAWER_DEFAULT_CLOSE_THRESHOLD,
	DRAWER_DRAG_ACTIVATION_PX,
	DRAWER_NESTED_PARENT_DISPLACEMENT,
	DRAWER_VELOCITY_THRESHOLD,
	canUseBodyFix,
	createTouchScrollGuard,
	getActiveSnapPointIndex,
	getCloseDirectionSign,
	getOverlayOpacityForOffset,
	getSnapPointOffsets,
	isDrawerNoDragTarget,
	isIOSBrowser,
	isVerticalDrawer,
	lockDocumentOverscroll,
	lockDocumentScroll,
	restoreDocumentOverscroll,
	restoreDocumentScroll,
	resolveSnapPointTarget,
} from '@guillemservera/drawer-core'
import type { DrawerDirection, DrawerSnapPoint } from '@guillemservera/drawer-core'
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

// Vue's snap point values: a number is a fraction of the viewport, a string ("160px", "18rem") a length.
const parseSnapPoint = (value: string) => Number.isNaN(+value) ? value.trim() : +value

interface Snaps { points: DrawerSnapPoint[], size: number, offsets: number[], index: number }

const Base = (globalThis.HTMLElement ?? class {}) as typeof HTMLElement

export class AstroDrawer extends Base {
	static observedAttributes = ['open', 'dismissible', 'active-snap-point']

	#dialog: HTMLDialogElement | null = null
	#listeners: AbortController | null = null
	#unguard: (() => void) | null = null
	#locked = false
	#closeId = 0
	#drag: ({ x: number, y: number, t: number, active: boolean } & Snaps) | null = null
	// Remembered on open: a removed nested drawer no longer has a parentElement to find it by.
	#parentDialog: HTMLDialogElement | null = null

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

	/** Snap points resolved like vue's: offsets from fully open toward the closing edge, measured on the viewport; `index` is -1 without them. */
	#snaps(): Snaps {
		// shortcut: bottom and right only; a viewport-sized top/left sheet rests showing its far end, not its content. Lay content out from that end to support them.
		const points = getCloseDirectionSign(this.#direction) < 0 ? [] : (this.getAttribute('snap-points') ?? '').split(',').filter(value => value.trim()).map(parseSnapPoint)
		const active = this.getAttribute('active-snap-point')
		const size = isVerticalDrawer(this.#direction) ? innerHeight : innerWidth
		return { points, size, offsets: getSnapPointOffsets(size, points), index: getActiveSnapPointIndex(points, active === null ? active : parseSnapPoint(active)) }
	}

	#translate(offset: number) {
		return `translate${isVerticalDrawer(this.#direction) ? 'Y' : 'X'}(${offset * getCloseDirectionSign(this.#direction)}px)`
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
		// A nested drawer's events bubble through this dialog: they belong to the nested drawer only.
		const on = <K extends keyof HTMLElementEventMap>(type: K, listener: (event: HTMLElementEventMap[K]) => void) =>
			dialog.addEventListener(type, event => (event.target as Element).closest('astro-drawer') === this && listener(event), { signal: this.#listeners!.signal })

		on('cancel', (event) => {
			event.preventDefault()
			if (this.#dismissible) this.close()
		})
		// Any native close (our animated close, unpreventable Escape, form[method=dialog]) ends here.
		on('close', () => {
			this.#closeId++
			this.#unlock()
			this.#nest(false)
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
			const snaps = this.#snaps()
			// Like vue, a non-dismissible drawer still drags between its snap points.
			if (event.button || !this.#dismissible && !snaps.points.length || onBackdrop(event) || isDrawerNoDragTarget(event.target)) return
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
			this.#drag = { x: event.clientX, y: event.clientY, t: event.timeStamp, active: false, ...snaps }
		})
		// The dragged offset: between the last snap point and the first (or off-screen when dismissible), else anywhere toward the closing edge.
		const offsetOf = ({ offsets, index }: Snaps, d: number) =>
			Math.min(Math.max((offsets[index] ?? 0) + d, offsets.at(-1) ?? 0), this.#dismissible ? Infinity : offsets[0]!)
		on('pointermove', (event) => {
			const drag = this.#drag
			if (!drag) return
			const [d, across] = this.#delta(event, drag)
			if (!drag.active) {
				if (Math.abs(d) < DRAWER_DRAG_ACTIVATION_PX) return
				// Toward the open edge only expands to a higher snap point.
				if (Math.abs(across) > Math.abs(d) || d < 0 && drag.index >= drag.offsets.length - 1) {
					this.#drag = null
					return
				}
				drag.active = true
				// Like vue: a mouse drag selects text, and pressing on a selection starts a native drag that cancels the next gesture.
				getSelection()?.removeAllRanges()
				dialog.setPointerCapture?.(event.pointerId)
				dialog.style.transition = 'none'
			}
			// shortcut: the backdrop does not fade along with the drag like vue's, only between resting snap points; drive its opacity from here if that matters.
			// shortcut: a scaled parent does not follow this drag back up like vue's; interpolate its `scale` from here if that matters.
			dialog.style.transform = this.#translate(offsetOf(drag, d))
		})
		const release = (event: PointerEvent) => {
			const drag = this.#drag
			this.#drag = null
			if (!drag?.active) return
			const [d] = this.#delta(event, drag)
			// Clearing inline styles lets the CSS transition run from the dragged position.
			dialog.style.transition = dialog.style.transform = ''
			if (event.type !== 'pointerup') return
			const velocity = d / Math.max(event.timeStamp - drag.t, 1)
			const { points, index } = drag
			if (!points.length) {
				if (velocity > DRAWER_VELOCITY_THRESHOLD || d > (isVerticalDrawer(this.#direction) ? dialog.offsetHeight : dialog.offsetWidth) * DRAWER_DEFAULT_CLOSE_THRESHOLD) this.close()
				return
			}
			const target = resolveSnapPointTarget({
				activeSnapPointIndex: index,
				closeThreshold: DRAWER_DEFAULT_CLOSE_THRESHOLD,
				currentOffset: offsetOf(drag, d),
				dismissible: this.#dismissible,
				drawerSize: drag.size,
				snapPointsOffset: drag.offsets,
				snapToSequentialPoint: this.hasAttribute('snap-to-sequential-point'),
				velocity,
			})
			// shortcut: unlike vue's DrawerHandle, a click on the handle does not cycle snap points; add it with a click suppressed after drags if needed.
			if (target.type === 'close') this.close()
			else if (target.index !== index) {
				// Like vue's `update:activeSnapPoint`: reflected and announced for gestures only.
				this.setAttribute('active-snap-point', `${points[target.index]}`)
				this.dispatchEvent(new CustomEvent('snap-point-change', { detail: points[target.index] }))
			}
		}
		on('pointerup', release)
		on('pointercancel', release)
		addEventListener('resize', () => this.#rest(), { signal: this.#listeners.signal })

		this.#sync()
	}

	disconnectedCallback() {
		this.#listeners?.abort()
		this.#closeId++
		this.#unlock()
		this.#nest(false)
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
				// shortcut: a nested drawer opened while its parent is closed shows nothing but still makes the page inert; guard it if that can happen.
				dialog.showModal()
				this.#lock()
				dialog.getBoundingClientRect() // commit the closed transform so the open transition runs
			}
			this.#nest(true) // also when reopened during the close transition
			this.#rest()
			this.dataset.state = 'open'
			return
		}

		// Nested drawers close with their parent, instantly, like vue's forced close.
		dialog.querySelectorAll<HTMLDialogElement>('dialog[open]').forEach(child => child.close())
		if (!dialog.open) return
		const closeId = ++this.#closeId
		delete this.dataset.state
		this.#nest(false)
		// No running transition (reduced motion, zero duration, no style.css) resolves immediately.
		const transitions = dialog.getAnimations?.({ subtree: true }).filter(a => (a.effect as KeyframeEffect | null)?.target === dialog) ?? []
		await Promise.allSettled(transitions.map(a => a.finished))
		if (closeId === this.#closeId) dialog.close()
	}

	/** Applies the resting snap point (fully open without snap points): position, backdrop, and whether touch scrolls or drags. */
	#rest() {
		const dialog = this.#dialog!
		const { offsets, index } = this.#snaps()
		const offset = offsets[index] ?? 0
		const last = offsets.length - 1
		const fade = this.getAttribute('fade-from-index')
		dialog.style.setProperty('--drawer-rest', this.#translate(offset))
		// Resting on a snap point, vue's backdrop opacity is 0 or 1.
		this.toggleAttribute('data-backdrop-hidden', !getOverlayOpacityForOffset(offset, offsets, fade === null ? last : Math.min(+fade, last)))
		// Touch drags on a scroll container become native scrolls, so only non-scrolling sheets block panning on the drag axis.
		// Like vue, below the last snap point a swipe toward the open edge expands the sheet instead of scrolling it.
		// Sidebars always keep vertical panning: they scroll across their drag axis.
		// shortcut: measured on open and snap changes, content that grows meanwhile keeps the old value; use a ResizeObserver if that matters.
		dialog.style.touchAction = !isVerticalDrawer(this.#direction) ? 'pan-y' : index < last || dialog.scrollHeight <= dialog.clientHeight ? 'none' : ''
	}

	/** Scales the parent drawer back while this nested drawer is open (CSS `scale`/`translate`: drag owns the inline `transform`). */
	#nest(open: boolean) {
		if (open) {
			const parent = this.parentElement?.closest('astro-drawer')
			// Like vue's unset `scaleParent`: only a parent opening from the same side scales back.
			// shortcut: no `scale-parent` attribute to force it either way; read one here if needed.
			this.#parentDialog = parent instanceof AstroDrawer && parent.#direction === this.#direction ? parent.#dialog : null
		}
		const style = this.#parentDialog?.style
		if (!style) return
		// Same depth as core's getNestedParentTransform, moved toward the far edge.
		const shift = -DRAWER_NESTED_PARENT_DISPLACEMENT * getCloseDirectionSign(this.#direction)
		style.scale = open ? `${Math.max(1 - DRAWER_NESTED_PARENT_DISPLACEMENT / innerWidth, 0.94)}` : ''
		style.translate = open ? isVerticalDrawer(this.#direction) ? `0 ${shift}px` : `${shift}px` : ''
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
