import {
	DRAWER_CLICK_SUPPRESS_MS,
	DRAWER_DEFAULT_CLOSE_THRESHOLD,
	DRAWER_DEFAULT_SCROLL_LOCK_TIMEOUT,
	DRAWER_DRAG_ACTIVATION_PX,
	DRAWER_NESTED_PARENT_DISPLACEMENT,
	DRAWER_RECENT_OPEN_WINDOW_MS,
	DRAWER_VELOCITY_THRESHOLD,
	canUseBodyFix,
	createTouchScrollGuard,
	dampenValue,
	getActiveSnapPointIndex,
	getCloseDirectionSign,
	getOverlayOpacityForOffset,
	getSnapPointOffsets,
	isDrawerNoDragTarget,
	isElementInsideDrawerBranch,
	isIOSBrowser,
	isVerticalDrawer,
	lockDocumentOverscroll,
	lockDocumentScroll,
	restoreDocumentOverscroll,
	restoreDocumentScroll,
	resolveSnapPointTarget,
} from '@guillemservera/drawer-core'
import type { DrawerDirection, DrawerSnapPoint } from '@guillemservera/drawer-core'
import { watchKeyboard } from './keyboard'
import './style.css'

// Safari scrolls the page behind `overflow: hidden`; pin the body instead (same fix as vue-drawer).
let bodyPins = 0
let pinned: { x: number, y: number, url: string, body: HTMLElement, position: string, top: string, left: string, right: string } | null = null

function pinBody() {
	if (bodyPins++ || !canUseBodyFix()) return
	const { position, top, left, right } = document.body.style
	pinned = { x: scrollX, y: scrollY, url: location.href, body: document.body, position, top, left, right }
	Object.assign(document.body.style, { position: 'fixed', top: `${-pinned.y}px`, left: `${-pinned.x}px`, right: '0px' })
}

function unpinBody(keepNavigationScroll: boolean) {
	if (--bodyPins || !pinned) return
	const { x, y, url, body, ...style } = pinned
	pinned = null
	// A client router swapped the body meanwhile: the new page starts at the top, and the pinned styles went with the old body.
	if (body !== document.body) return
	Object.assign(document.body.style, style)
	// `instant` overrides a consumer's `scroll-behavior: smooth`.
	const restore = () => scrollTo({ left: x, top: y, behavior: 'instant' })
	// vue's `preventScrollRestoration`: wait a frame, so a navigation started from inside the drawer keeps its own scroll.
	if (keepNavigationScroll) requestAnimationFrame(() => location.href === url && restore())
	else restore()
}

// Vue's snap point values: a number is a fraction of the viewport, a string ("160px", "18rem") a length.
const parseSnapPoint = (value: string) => Number.isNaN(+value) ? value.trim() : +value
const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max)
const settled = async (dialog: HTMLElement) => {
	// No running transition (reduced motion, zero duration, no style.css) resolves immediately. A consumer's endless animation (a loading pulse) never would.
	// A transition replaced while running (a snap point changed mid-way) is canceled and a new one starts: wait for the new ones too.
	const waited = new Set<Animation>()
	for (let round = 0; round < 4; round++) {
		const running = (dialog.getAnimations?.({ subtree: true }) ?? [])
			.filter(a => !waited.has(a) && (a.effect as KeyframeEffect | null)?.target === dialog && a.effect?.getComputedTiming?.().iterations !== Infinity)
		if (!running.length) return
		running.forEach(a => waited.add(a))
		await Promise.allSettled(running.map(a => a.finished))
	}
}
// vue's focus scope candidates, for `auto-focus`.
const FOCUSABLE = 'a[href],button:not([disabled]),input:not([disabled]):not([type=hidden]),select:not([disabled]),textarea:not([disabled]),[tabindex],[contenteditable]'
const announce = (el: Element, type: string, detail?: unknown, cancelable = false) => {
	const event = new CustomEvent(type, { detail, cancelable })
	el.dispatchEvent(event)
	return event
}

// Escape belongs to a plain modal dialog the focus is in, or to an open popover that light-dismisses on Escape (not `popover="manual"`).
// A modal dialog makes the rest of the page inert, so while one is open the focus is inside the topmost.
const claimed = (target: Element | null, top: AstroDrawer) => {
	try {
		const plain = 'dialog:modal:not(astro-drawer > dialog)'
		const inside = target instanceof Element && target !== document.body && target !== document.documentElement
		const modal = inside ? target.closest(plain) : document.querySelector(plain)
		if (modal && !(inside && top.contains(target))) return true
		return CSS.supports('selector(:popover-open)') && !!document.querySelector('[popover]:not([popover="manual" i]):popover-open')
	} catch {
		return false // an engine without `:modal`
	}
}

let zOrder = 0 // non-modal drawers stack by opening order

interface Snaps { points: DrawerSnapPoint[], size: number, offsets: number[], index: number }

// Open drawers, topmost last: Escape and outside interactions belong to the last one.
const stack: AstroDrawer[] = []
let labelId = 0

const Base = (globalThis.HTMLElement ?? class {}) as typeof HTMLElement

export class AstroDrawer extends Base {
	static observedAttributes = ['open', 'dismissible', 'active-snap-point', 'snap-points', 'fade-from-index', 'direction']
	static #installed = false

	#dialog: HTMLDialogElement | null = null
	#listeners: AbortController | null = null
	#unguard: (() => void) | null = null
	#keyboard: ReturnType<typeof watchKeyboard> | null = null
	#resizer: ResizeObserver | null = null
	#locked = false
	#docLocked = false
	#pinned = false
	#state = false
	#openedAt = 0
	#lastPreventedAt = 0
	#outsidePrevented = false
	#closeId = 0
	// A native `close` is owed an announcement: set when the sheet is shown, so a close event queued earlier (a DOM move) is not announced twice.
	#owed = false
	#closeAnimation: string | null = null
	#cycleTimer = 0
	#tapTimer = 0
	#noClickUntil = 0
	#tap: { x: number, y: number, moved: boolean, long: boolean } | null = null
	#drag: ({ id: number, x: number, y: number, t: number, active: boolean, extent: number, from: Element | null } & Snaps) | null = null
	// Remembered on open: a removed nested drawer no longer has a parentElement to find it by.
	#parent: AstroDrawer | null = null
	// The drawer this one is nested in, kept when `container` moves it out of that drawer's DOM.
	#owner: AstroDrawer | null = null

	// Like vue's props: `dismissible`, `modal` ... are true unless set to "false".
	#flag(name: string, fallback: boolean) {
		const value = this.getAttribute(name)
		return value === null ? fallback : value !== 'false'
	}

	#number(name: string, fallback: number) {
		const value = parseFloat(this.getAttribute(name) ?? '')
		return Number.isFinite(value) ? value : fallback
	}

	get #dismissible() {
		return this.#flag('dismissible', true)
	}

	get #modal() {
		return this.#flag('modal', true)
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

	/** The element a non-modal drawer lives in (`container`), if any. */
	#box() {
		const selector = this.getAttribute('container')
		return !this.#modal && selector ? this.parentElement?.closest(selector) ?? null : null
	}

	/** The drawer this one is nested in. */
	#up(): AstroDrawer | null {
		const parent = this.#owner ?? this.parentElement?.closest('astro-drawer')
		return parent instanceof AstroDrawer ? parent : null
	}

	/** The topmost open modal drawer of the nested stack rooted here: the one the touch guard serves. */
	#top(): AstroDrawer {
		const under = (drawer: AstroDrawer | null): boolean => !!drawer && (drawer === this || under(drawer.#up()))
		return stack.filter(drawer => drawer.#modal && under(drawer)).at(-1) ?? this
	}

	/** Snap points resolved like vue's: offsets from fully open toward the closing edge, measured on the viewport (or the non-modal `container`); `index` is -1 without them. */
	#snaps(): Snaps {
		const points = (this.getAttribute('snap-points') ?? '').split(',').filter(value => value.trim()).map(parseSnapPoint)
		const active = this.getAttribute('active-snap-point')
		const vertical = isVerticalDrawer(this.#direction)
		const box = this.#box()?.getBoundingClientRect()
		const size = (vertical ? box?.height : box?.width) || (vertical ? innerHeight : innerWidth)
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

	static #install() {
		if (AstroDrawer.#installed) return
		AstroDrawer.#installed = true
		// Declarative trigger: <button data-drawer-open="#my-drawer">.
		document.addEventListener('click', (event) => {
			const selector = (event.target as Element).closest?.('[data-drawer-open]')?.getAttribute('data-drawer-open')
			// Like vue's DrawerTrigger, a click a handler already prevented does not open.
			const drawer = selector && !event.defaultPrevented && document.querySelector(selector)
			if (drawer instanceof AstroDrawer) drawer.show()
		})
		// The topmost drawer handles Escape here, modal or not: a non-modal dialog has no native Escape, and a modal one's
		// `cancel` can be vetoed only once per user activation (the next Escape closes it anyway), while a canceled keydown always holds.
		document.addEventListener('keydown', (event) => {
			const top = stack.at(-1)
			if (event.key !== 'Escape' || !top || event.defaultPrevented || event.isComposing || claimed(event.target as Element | null, top)) return
			event.preventDefault()
			// vue's `data-drawer-branch`: an Escape from a branch (a menu portalled out of the sheet) is the branch's own.
			if (!isElementInsideDrawerBranch(event.target)) top.#escape(event)
		})
		// Non-modal drawers stay open on outside interaction, but still announce it (vue's `modal=false`).
		const outside = (type: string) => (event: Event) => {
			const top = stack.at(-1)
			if (top && !top.#modal && !event.composedPath().includes(top) && !isElementInsideDrawerBranch(event.target)) {
				announce(top, type, { originalEvent: event }, true)
				announce(top, 'interact-outside', { originalEvent: event }, true)
			}
		}
		document.addEventListener('pointerdown', outside('pointer-down-outside'), true)
		document.addEventListener('focusin', outside('focus-outside'), true)
	}

	#escape(originalEvent: Event | null) {
		if (!announce(this, 'escape-key-down', { originalEvent }, true).defaultPrevented && this.#dismissible) this.close()
	}

	connectedCallback() {
		// vue's `container`: a non-modal drawer lives inside its container (modal ones sit in the top layer, which ignores containers).
		const container = !this.#modal && this.getAttribute('container') && document.querySelector(this.getAttribute('container')!)
		if (container && this.parentElement !== container) {
			this.#owner = this.parentElement?.closest('astro-drawer') as AstroDrawer | null
			return void container.append(this) // reconnects here
		}
		if (!container) this.#owner = null
		const dialog = this.querySelector('dialog')
		if (!dialog) return
		AstroDrawer.#install()
		this.#dialog = dialog
		// The scroll guard's ownership check (shared with vue) recognizes a drawer's sheet by these two attributes.
		dialog.setAttribute('data-drawer-content', '')
		this.#listeners = new AbortController()
		// A nested drawer's events bubble through this dialog: they belong to the nested drawer only.
		const on = <K extends keyof HTMLElementEventMap>(type: K, listener: (event: HTMLElementEventMap[K]) => void) =>
			dialog.addEventListener(type, event => (event.target as Element).closest('astro-drawer') === this && listener(event), { signal: this.#listeners!.signal })

		on('cancel', (event) => {
			event.preventDefault()
			this.#escape(null)
		})
		// Any native close (our animated close, unpreventable Escape, form[method=dialog]) ends here.
		on('close', () => {
			if (dialog.open || !this.#owed) return // queued before a DOM move reopened it, or already announced
			this.#owed = false
			this.#closeId++
			this.#cleanup() // also ends a drag: a native close can land mid-drag
			this.#mark(false)
			this.removeAttribute('open')
			this.#announceOpen(false)
			if (this.open) return // a `close` listener reopened it
			// Focus is already back on the trigger (native). Like vue's `close-auto-focus`, preventing this leaves it nowhere, or where the handler put it.
			const held = document.activeElement
			if (announce(this, 'close-auto-focus', undefined, true).defaultPrevented && held === document.activeElement) (held as HTMLElement | null)?.blur?.()
			announce(this, 'after-close')
			announce(this, 'animation-end', false)
		})
		// The ::backdrop hit-tests as the dialog itself, so tell them apart by geometry.
		const onBackdrop = (event: MouseEvent) => {
			if (event.target !== dialog) return false
			const rect = dialog.getBoundingClientRect()
			const { clientX: x, clientY: y } = event
			return x < rect.left || x > rect.right || y < rect.top || y > rect.bottom
		}
		on('click', (event) => {
			const target = event.target as Element
			// The pointer is captured by the dialog during a drag, so its click lands wherever the finger stopped.
			if (performance.now() < this.#noClickUntil) return
			if (onBackdrop(event)) {
				if (this.#dismissible && !this.#outsidePrevented) this.close()
				return
			}
			// `[data-drawer-close]` is an explicit close (vue's DrawerClose), so it ignores `dismissible` but honors a prevented click.
			const closer = !event.defaultPrevented && target.closest('[data-drawer-close]')
			if (closer) {
				let drawer: AstroDrawer = this
				// `scope="all"` closes the whole nested stack from its root, which takes the children with it.
				if (closer.getAttribute('data-drawer-close') === 'all') for (let p; (p = drawer.#up());) drawer = p
				drawer.#closeAnimation = closer.getAttribute('data-drawer-animation')
				drawer.close()
				return
			}
			const handle = target.closest('[data-drawer-handle]')
			if (handle && !handle.hasAttribute('data-prevent-cycle')) this.#cycle()
		})
		on('pointerdown', (event) => {
			const target = event.target as Element
			if (onBackdrop(event)) {
				// A press outside the sheet. The events are cancelable; the close itself happens on the click that follows.
				const pressed = announce(this, 'pointer-down-outside', { originalEvent: event }, true)
				const interacted = announce(this, 'interact-outside', { originalEvent: event }, true)
				this.#outsidePrevented = pressed.defaultPrevented || interacted.defaultPrevented || event.button === 2 || event.ctrlKey && event.button === 0
				return
			}
			const handle = target.closest('[data-drawer-handle]')
			clearTimeout(this.#tapTimer)
			this.#tap = handle ? { x: event.clientX, y: event.clientY, moved: false, long: false } : null
			// A press held past 250ms is not a tap (vue's DrawerHandle).
			if (this.#tap) this.#tapTimer = setTimeout(() => this.#tap && (this.#tap.long = true), 250) as unknown as number
			const snaps = this.#snaps()
			// Like vue, a non-dismissible drawer still drags between its snap points.
			if (event.button || event.isPrimary === false || this.#drag || !this.open || !this.#dismissible && !snaps.points.length || isDrawerNoDragTarget(event.target)) return
			if (this.#flag('handle-only', false) && !handle) return
			// Without snap points the drag spans the sheet itself.
			const extent = snaps.points.length ? snaps.size : isVerticalDrawer(this.#direction) ? dialog.offsetHeight : dialog.offsetWidth
			this.#drag = { id: event.pointerId, x: event.clientX, y: event.clientY, t: event.timeStamp, active: false, extent: extent || 1, from: handle ? null : target, ...snaps }
		})
		// The dragged offset: between the last snap point and the first (or off-screen when dismissible), else toward the closing edge.
		// Vertical sheets overdrag elastically past fully open; sidebars stay anchored there.
		const offsetOf = ({ offsets, index }: Snaps, d: number) => {
			if (!offsets.length) return d >= 0 || !isVerticalDrawer(this.#direction) ? Math.max(d, 0) : -Math.max(dampenValue(-d), 0)
			return clamp((offsets[index] ?? 0) + d, offsets.at(-1)!, this.#dismissible ? Infinity : offsets[0]!)
		}
		const fadeIndex = (last: number) => {
			const value = this.getAttribute('fade-from-index')
			return value === null ? last : clamp(+value, 0, last)
		}
		on('pointermove', (event) => {
			if (this.#tap && Math.hypot(event.clientX - this.#tap.x, event.clientY - this.#tap.y) > 4) this.#tap.moved = true
			const drag = this.#drag
			if (!drag || drag.id !== event.pointerId) return
			const [d, across] = this.#delta(event, drag)
			if (!drag.active) {
				// A finger needs more travel than a mouse before a press is a drag (vue's activation distance).
				if (Math.abs(d) < (event.pointerType === 'touch' ? Math.max(DRAWER_DRAG_ACTIVATION_PX, 10) : DRAWER_DRAG_ACTIVATION_PX)) return
				// Toward the open edge only expands to a higher snap point.
				if (Math.abs(across) > Math.abs(d) || d < 0 && drag.index >= drag.offsets.length - 1) {
					this.#drag = null
					return
				}
				// vue ignores vertical drags that start right after opening (a ghost flick after the tap that opened it).
				if (isVerticalDrawer(this.#direction) && Date.now() - this.#openedAt < DRAWER_RECENT_OPEN_WINDOW_MS) return
				// Decided here, not on press (vue's `shouldAllowDrag`): a tap in scrolled content is no scroll attempt.
				if (this.#scrolls(drag.from)) {
					this.#drag = null
					return
				}
				drag.active = true
				// Like vue: a mouse drag selects text, and pressing on a selection starts a native drag that cancels the next gesture.
				getSelection()?.removeAllRanges()
				dialog.setPointerCapture?.(event.pointerId)
				dialog.style.transition = 'none'
				this.dataset.dragging = '' // the backdrop follows the finger, so it must not transition
			}
			const offset = offsetOf(drag, d)
			dialog.style.transform = this.#translate(offset)
			const progress = clamp(Math.max(offset, 0) / drag.extent, 0, 1)
			dialog.style.setProperty('--drawer-fade', `${drag.points.length ? getOverlayOpacityForOffset(offset, drag.offsets, fadeIndex(drag.points.length - 1)) : 1 - progress}`)
			if (this.#parent) {
				this.#parent.#dialog!.style.transition = 'none'
				this.#parent.#depth(progress)
			}
			announce(this, 'drag', { originalEvent: event, percentageDragged: progress })
		})
		const release = (event: PointerEvent) => {
			const drag = this.#drag
			if (!drag || drag.id !== event.pointerId) return
			this.#drag = null
			if (!drag.active) return
			const [d] = this.#delta(event, drag)
			delete this.dataset.dragging
			dialog.style.removeProperty('--drawer-fade')
			// Clearing inline styles lets the CSS transition run from the dragged position.
			dialog.style.transition = dialog.style.transform = ''
			const stepBack = (closing: boolean) => {
				if (!this.#parent) return
				this.#parent.#dialog!.style.transition = ''
				// A closing child clears the step-back itself (`#nest(false)`); otherwise the parent returns to full depth.
				if (!closing) this.#parent.#depth(0)
			}
			if (event.type !== 'pointerup') return stepBack(false)
			this.#noClickUntil = performance.now() + DRAWER_CLICK_SUPPRESS_MS // only a release is followed by a click
			const velocity = d / Math.max(event.timeStamp - drag.t, 1)
			const { points, index } = drag
			// Gestures always close with the slide, like vue.
			const closeNow = () => {
				this.#closeAnimation = 'drag'
				announce(this, 'release', { originalEvent: event, open: false })
				stepBack(true)
				this.close()
			}
			if (!points.length) {
				const closing = d > 0 && (velocity >= DRAWER_VELOCITY_THRESHOLD || d >= drag.extent * this.#number('close-threshold', DRAWER_DEFAULT_CLOSE_THRESHOLD))
				if (closing) return closeNow()
				announce(this, 'release', { originalEvent: event, open: true })
				return stepBack(false)
			}
			const target = resolveSnapPointTarget({
				activeSnapPointIndex: index,
				closeThreshold: this.#number('close-threshold', DRAWER_DEFAULT_CLOSE_THRESHOLD),
				currentOffset: offsetOf(drag, d),
				dismissible: this.#dismissible,
				drawerSize: drag.size,
				snapPointsOffset: drag.offsets,
				snapToSequentialPoint: this.hasAttribute('snap-to-sequential-point'),
				velocity,
			})
			if (target.type === 'close') return closeNow()
			announce(this, 'release', { originalEvent: event, open: true })
			stepBack(false)
			if (target.index !== index) this.#snapTo(target.index)
		}
		on('pointerup', release)
		on('pointercancel', release)
		// A press that ends outside the sheet before it became a drag (a non-modal drawer has no backdrop to catch it) never reaches `release`.
		const stale = (event: PointerEvent) => {
			if (this.#drag?.id === event.pointerId && !this.#drag.active) this.#drag = null
		}
		document.addEventListener('pointerup', stale, { capture: true, signal: this.#listeners.signal })
		document.addEventListener('pointercancel', stale, { capture: true, signal: this.#listeners.signal })
		addEventListener('resize', () => this.#rest(), { signal: this.#listeners.signal })

		// Already open when it connected (rendered open, or a persisted drawer that moved): shown in place, like vue's `defaultOpen`.
		if (this.open) {
			this.dataset.instant = ''
			requestAnimationFrame(() => {
				dialog.getBoundingClientRect() // take the final state without a transition before it may run
				delete this.dataset.instant
			})
		}
		// vue's `defaultSnapPoint`: where an uncontrolled drawer first rests.
		if (!this.hasAttribute('active-snap-point') && this.hasAttribute('default-snap-point')) this.setAttribute('active-snap-point', this.getAttribute('default-snap-point')!)
		this.#label()
		this.#sync()
	}

	disconnectedCallback() {
		this.#listeners?.abort()
		this.#closeId++
		for (const drawer of [...stack]) if (drawer.#owner === this) drawer.#dialog?.close() // moved out by `container`
		this.#cleanup()
		this.#dialog?.close()
		this.#mark(false)
	}

	attributeChangedCallback() {
		this.#sync()
	}

	/** vue's DrawerTitle / DrawerDescription: `[data-drawer-title]` and `[data-drawer-description]` name and describe the dialog unless it is labelled already. */
	#label() {
		const dialog = this.#dialog!
		const link = (hook: string, attribute: string, ...skip: string[]) => {
			const element = dialog.querySelector(`[${hook}]`)
			if (!element || skip.some(name => dialog.hasAttribute(name))) return
			element.id ||= `astro-drawer-${++labelId}`
			dialog.setAttribute(attribute, element.id)
		}
		link('data-drawer-title', 'aria-labelledby', 'aria-labelledby', 'aria-label')
		link('data-drawer-description', 'aria-describedby', 'aria-describedby')
		// The declarative triggers are the disclosure buttons vue's DrawerTrigger renders.
		for (const trigger of this.#triggers()) {
			trigger.setAttribute('aria-haspopup', 'dialog')
			trigger.setAttribute('aria-controls', dialog.id ||= `astro-drawer-${++labelId}`)
			trigger.setAttribute('aria-expanded', `${this.open}`)
		}
	}

	#triggers() {
		return [...document.querySelectorAll('[data-drawer-open]')].filter((el) => {
			try {
				return this.matches(el.getAttribute('data-drawer-open')!)
			} catch {
				return false // an invalid selector is not ours
			}
		})
	}

	/** vue's `update:open`, plus the triggers' `aria-expanded`. */
	#announceOpen(open: boolean) {
		if (this.#state === open) return
		this.#state = open
		this.#triggers().forEach(trigger => trigger.setAttribute('aria-expanded', `${open}`))
		announce(this, 'open-change', open)
		// vue emits `close` with the state change; `after-close` marks the end of the transition.
		if (!open) announce(this, 'close')
	}

	/** The state markers: the host drives the stylesheet, the sheet carries the pair the shared scroll guard looks for. */
	#mark(open: boolean) {
		if (open) {
			this.dataset.state = 'open'
			this.#dialog!.dataset.state = 'open'
		} else {
			delete this.dataset.state
			if (this.#dialog) delete this.#dialog.dataset.state
		}
	}

	/** Gives back everything a drag holds: pointer state, inline transform, backdrop opacity and the parent's transition override. */
	#endDrag() {
		this.#drag = null
		delete this.dataset.dragging
		const dialog = this.#dialog
		if (!dialog) return
		dialog.style.removeProperty('--drawer-fade')
		dialog.style.transition = dialog.style.transform = ''
		if (this.#parent && this.#parent.#dialog) this.#parent.#dialog.style.transition = ''
	}

	/** Whether a drag that starts on `from` is still a scroll: it follows a scroll attempt closely (vue's `scrollLockTimeout`), or an ancestor is scrolled away from the closing edge. */
	#scrolls(from: Element | null) {
		const vertical = isVerticalDrawer(this.#direction)
		const toEnd = getCloseDirectionSign(this.#direction) < 0
		let scrolls = vertical && Date.now() - this.#lastPreventedAt < this.#number('scroll-lock-timeout', DRAWER_DEFAULT_SCROLL_LOCK_TIMEOUT)
		// Off the handle, dragging toward the closing edge scrolls such an ancestor back first.
		for (let el = from; !scrolls && el && el !== this; el = el.parentElement) {
			// Limit: RTL scrollers report a negative scrollLeft, so left/right drawers misread them; handle RTL if needed.
			const scrolled = vertical ? el.scrollTop : el.scrollLeft
			// Bottom/right: scrolled at all. Top/left: a real scroller (ellipsized labels overflow too) not yet at its end.
			scrolls = toEnd
				? (vertical ? el.scrollHeight - el.clientHeight : el.scrollWidth - el.clientWidth) - scrolled > 1 && /auto|scroll/.test(getComputedStyle(el)[vertical ? 'overflowY' : 'overflowX'])
				: scrolled > 0
		}
		if (scrolls) this.#lastPreventedAt = Date.now()
		return scrolls
	}

	/** The animation of a transition: vue's `animation`, or the cross-fade a sheet opts into with `data-reduced-motion="fade"` under reduced motion. */
	#anim(name: string | null) {
		const reduced = this.#dialog!.dataset.reducedMotion === 'fade' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
		return name === 'fade' || reduced ? 'fade' : 'slide'
	}

	/** vue's DrawerHandle click: a tap (not a drag or long press) on the handle advances to the next snap point, and dismisses past the last. */
	#cycle() {
		const tap = this.#tap
		this.#tap = null
		clearTimeout(this.#tapTimer)
		if (!tap || tap.moved || tap.long || !this.open) return
		// A second tap within the double-tap window cancels the cycle.
		if (this.#cycleTimer) {
			clearTimeout(this.#cycleTimer)
			this.#cycleTimer = 0
			return
		}
		this.#cycleTimer = setTimeout(() => {
			this.#cycleTimer = 0
			if (!this.open) return
			const { points, index } = this.#snaps()
			if (!points.length || index < 0) return
			if (index < points.length - 1) this.#snapTo(index + 1)
			else if (this.#dismissible) this.close()
		}, 120) as unknown as number
	}

	/** A snap point chosen by the user: reflected on `active-snap-point` and announced, like vue's `update:activeSnapPoint`. */
	#snapTo(index: number) {
		const point = this.#snaps().points[index]
		if (point === undefined) return
		this.setAttribute('active-snap-point', `${point}`)
		announce(this, 'snap-point-change', point)
	}

	async #sync() {
		const dialog = this.#dialog
		if (!dialog || !this.isConnected) return
		// Chromium/WebKit force-close a modal after repeated Escapes even when `cancel` is prevented; `closedby="none"` stops that.
		// Limit: engines without `closedby` keep only the prevented `cancel`, so a repeated Escape can still close; re-open on `close` if they matter.
		if (this.#dismissible) dialog.removeAttribute('closedby')
		else dialog.setAttribute('closedby', 'none')

		if (this.open) {
			// A real opening: from closed, or reopened while closing. Not an option changing on a drawer that is already open.
			const opening = !dialog.open || this.dataset.state !== 'open'
			if (opening) this.#closeId++ // cancels a close that is still waiting for its transition
			const closeId = this.#closeId
			if (!dialog.open) {
				const modal = this.#modal
				dialog.tabIndex = -1
				this.dataset.anim = this.#anim(this.getAttribute('animation'))
				// Before showing: showing flushes style, and a fade that gets its resting position after that would transition to it.
				this.#rest()
				// Inert while it shows: the native focusing steps would focus the first control (Chromium ignores the sheet's `autofocus`) and scroll to it.
				dialog.inert = true
				// Limit: a nested drawer opened while its parent is closed shows nothing but still makes the page inert; guard it if that can happen.
				if (modal) dialog.showModal()
				else dialog.show()
				dialog.inert = false
				// Like vue, the sheet itself takes focus while it opens (its first control may be scrolled away in a snap sheet); `auto-focus` moves focus
				// to the first control once the transition is over. A non-modal drawer without it leaves the page's focus alone.
				if (modal || this.#flag('auto-focus', false)) dialog.focus({ preventScroll: true })
				// A focus handler may have removed or closed the drawer while it was being shown.
				if (!this.isConnected || !this.open) return
				this.#owed = true
				this.#openedAt = Date.now()
				// Idempotent: a reopen can land before the previous close's native event has cleaned up.
				const slot = stack.indexOf(this)
				if (slot >= 0) stack.splice(slot, 1)
				// Non-modal drawers are not in the top layer: the one opened last stacks above the others.
				if (!modal) dialog.style.zIndex = `calc(var(--drawer-z-index, 50) + ${++zOrder})`
				stack.push(this)
				if (modal) this.#lock()
				// vue's `repositionInputs`: bottom modal sheets only.
				this.#keyboard?.stop()
				this.#keyboard = modal && this.#direction === 'bottom' && this.#flag('reposition-inputs', true) ? watchKeyboard(dialog, this.#flag('fixed', false), () => this.#rest()) : null
				// vue observes its container: a panel that resizes moves the snap points.
				const box = this.#box()
				this.#resizer?.disconnect()
				this.#resizer = box && typeof ResizeObserver !== 'undefined' ? new ResizeObserver(() => this.#rest()) : null
				if (box) this.#resizer?.observe(box)
				dialog.getBoundingClientRect() // commit the closed transform so the open transition runs
			}
			if (opening) this.#nest(true) // also when reopened during the close transition
			this.#rest()
			this.#announceOpen(true)
			this.#mark(true)
			if (opening) {
				void settled(dialog).then(() => {
					if (!this.open || closeId !== this.#closeId) return
					announce(this, 'after-open')
					announce(this, 'animation-end', true)
					// vue's `open-auto-focus`, after the transition: preventing it keeps focus on the sheet, which a native modal cannot leave.
					if (announce(this, 'open-auto-focus', undefined, true).defaultPrevented || !this.#flag('auto-focus', false)) return
					// The first control that takes it: a disabled or hidden one (a closed nested drawer's) does not.
					for (const el of dialog.querySelectorAll<HTMLElement>(FOCUSABLE)) {
						if (el.tabIndex < 0 || el.getAttribute('aria-hidden') === 'true') continue
						el.focus({ preventScroll: true })
						if (document.activeElement === el) break
					}
				})
			}
			return
		}

		// Nested drawers close with their parent, instantly, like vue's forced close.
		dialog.querySelectorAll<HTMLDialogElement>('dialog[open]').forEach(child => child.close())
		for (const drawer of [...stack]) if (drawer.#owner === this) drawer.#dialog?.close() // moved out by `container`
		if (!dialog.open) return
		const closeId = ++this.#closeId
		this.#endDrag() // a close during a drag animates on from where the sheet was dragged
		clearTimeout(this.#cycleTimer) // a handle tap pending its 120ms double-tap window must not act on a reopened drawer
		this.#cycleTimer = 0
		const animation = this.#closeAnimation ?? this.getAttribute('close-animation')
		this.#closeAnimation = null
		// A swipe continues toward the closing edge: vue leaves the gesture untouched by its reduced-motion fade.
		this.dataset.anim = animation === 'drag' ? 'slide' : this.#anim(animation)
		this.#mark(false)
		this.#announceOpen(false)
		if (this.open || closeId !== this.#closeId) return // a `close` listener reopened it
		this.#nest(false)
		if (this.#flag('instant-close', false)) return dialog.close()
		await settled(dialog)
		if (closeId === this.#closeId) dialog.close()
	}

	/** Applies the resting snap point (fully open without snap points): position, backdrop, and whether touch scrolls or drags. */
	#rest() {
		const dialog = this.#dialog!
		const { offsets, index } = this.#snaps()
		const offset = offsets[index] ?? 0
		const last = offsets.length - 1
		const fade = this.getAttribute('fade-from-index')
		// While the keyboard layout holds the sheet it sits at its fully open position; the snap offset comes back with the restore.
		if (!(this.#keyboard && this.#keyboard.active())) dialog.style.setProperty('--drawer-rest', this.#translate(offset))
		// Resting on a snap point, vue's backdrop opacity is 0 or 1.
		this.toggleAttribute('data-backdrop-hidden', !getOverlayOpacityForOffset(offset, offsets, fade === null ? last : Math.min(+fade, last)))
		// Touch drags on a scroll container become native scrolls, so only non-scrolling sheets block panning on the drag axis.
		// Like vue, below the last snap point a swipe toward the open edge expands the sheet instead of scrolling it.
		// Sidebars always keep vertical panning: they scroll across their drag axis.
		// Limit: measured on open and snap changes, content that grows meanwhile keeps the old value; use a ResizeObserver if that matters.
		dialog.style.touchAction = !isVerticalDrawer(this.#direction) ? 'pan-y pinch-zoom' : index < last || dialog.scrollHeight <= dialog.clientHeight ? 'pinch-zoom' : ''
		// The sheet spans the viewport but rests partly off-screen: a spacer lets scrolled content clear the hidden part.
		dialog.style.setProperty('--drawer-hidden', `${isVerticalDrawer(this.#direction) ? offset : 0}px`)
	}

	/** Steps this (parent) drawer back for an open nested one: `closeProgress` 0 is fully stepped back, 1 is at rest. CSS `scale`/`translate`: drag owns the inline `transform`. */
	#depth(closeProgress: number | null) {
		const style = this.#dialog?.style
		if (!style) return
		if (closeProgress === null) {
			style.scale = style.translate = ''
			return
		}
		const depth = 1 - clamp(closeProgress, 0, 1)
		// Same depth as core's getNestedParentTransform, moved toward the far edge.
		style.scale = `${1 - (1 - Math.max(1 - DRAWER_NESTED_PARENT_DISPLACEMENT / innerWidth, 0.94)) * depth}`
		const shift = -DRAWER_NESTED_PARENT_DISPLACEMENT * getCloseDirectionSign(this.#direction) * depth
		style.translate = isVerticalDrawer(this.#direction) ? `0 ${shift}px` : `${shift}px`
	}

	#nest(open: boolean) {
		if (open) {
			const parent = this.#up()
			// vue's `scaleParent`: unset, only a parent opening from the same side steps back; `true`/`false` force it.
			const forced = this.getAttribute('scale-parent')
			this.#parent = parent && (forced === null ? parent.#direction === this.#direction : forced !== 'false') ? parent : null
		}
		if (!this.#parent) return
		this.#parent.#depth(open ? 0 : null)
		if (!open) this.#parent = null
	}

	#lock() {
		if (this.#locked || !this.#flag('prevent-scroll', true)) return
		this.#locked = true
		// vue's `noBodyStyles`: the app owns the document and body styles, so only the overscroll and touch guards remain.
		const bare = this.#flag('no-body-styles', false)
		if (!bare) {
			this.#docLocked = true
			lockDocumentScroll()
		}
		lockDocumentOverscroll()
		if (!bare) {
			this.#pinned = true
			pinBody()
		}
		// One guard per nested stack: a nested drawer sits inside its parent's content, and two guards would both lift the same input.
		// It serves the topmost modal drawer of the stack; a sibling's guard skips touches the shared ownership check assigns to another open sheet.
		const guarded = (el: AstroDrawer | null): boolean => !!el && (!!el.#unguard || guarded(el.#up()))
		if (isIOSBrowser() && !guarded(this.#up())) this.#unguard = createTouchScrollGuard(() => this.#top().#dialog)
	}

	/** Everything a closed (or removed) drawer must give back: drag state, timers, scroll lock, keyboard watcher, stack slot, parent step-back. */
	#cleanup() {
		this.#endDrag()
		clearTimeout(this.#cycleTimer)
		clearTimeout(this.#tapTimer)
		this.#cycleTimer = this.#tapTimer = 0
		this.#tap = null
		this.#keyboard?.stop()
		this.#keyboard = null
		this.#resizer?.disconnect()
		this.#resizer = null
		if (this.#dialog) this.#dialog.style.zIndex = ''
		const slot = stack.indexOf(this)
		if (slot >= 0) stack.splice(slot, 1)
		this.#nest(false)
		if (!this.#locked) return
		this.#locked = false
		this.#unguard?.()
		this.#unguard = null
		if (this.#pinned) {
			this.#pinned = false
			unpinBody(this.#flag('prevent-scroll-restoration', false))
		}
		restoreDocumentOverscroll()
		if (this.#docLocked) {
			this.#docLocked = false
			restoreDocumentScroll()
		}
	}
}

declare global {
	interface HTMLElementTagNameMap {
		'astro-drawer': AstroDrawer
	}
}

if (typeof customElements !== 'undefined' && !customElements.get('astro-drawer')) {
	customElements.define('astro-drawer', AstroDrawer)
}
