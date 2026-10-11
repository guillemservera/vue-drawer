import { isSafariBrowser } from './drawerDom'
import { DRAWER_BRANCH_SELECTOR, isDrawerNoDragTarget } from './drawerSelectors'

interface DocumentOverscrollSnapshot {
	htmlOverscrollBehaviorY: string
	bodyOverscrollBehaviorY: string
}

interface DocumentScrollSnapshot {
	htmlOverflow: string
	bodyOverflow: string
	bodyPaddingRight: string
	htmlScrollbarGutter: string
	scrollbarWidthProperty: string
}

// Bundled separately into every drawer package, so a page with a vue-drawer and an astro-drawer has two copies of this module:
// the counters live on `globalThis`, or each copy would restore the page while the other still holds the lock.
const stateKey = Symbol.for('@guillemservera/drawer-core/scroll-lock')
const lockState = ((globalThis as Record<symbol, unknown>)[stateKey] ??= {
	previousDocumentScroll: null,
	previousDocumentOverscroll: null,
	documentScrollLockCount: 0,
	documentOverscrollLockCount: 0,
}) as {
	previousDocumentScroll: DocumentScrollSnapshot | null
	previousDocumentOverscroll: DocumentOverscrollSnapshot | null
	documentScrollLockCount: number
	documentOverscrollLockCount: number
}

const nonTextInputTypes = new Set([
	'checkbox',
	'radio',
	'range',
	'color',
	'file',
	'image',
	'button',
	'submit',
	'reset',
])

export function canUseBodyFix() {
	if (typeof window === 'undefined') return false
	if (!isSafariBrowser()) return false
	return !window.matchMedia('(display-mode: standalone)').matches
}

function canLockDocumentOverscroll() {
	if (typeof document === 'undefined') return false
	return isSafariBrowser()
}

export function isIOSBrowser() {
	if (typeof window === 'undefined') return false
	const { navigator } = window
	const isMac = /^Mac/.test(navigator.platform)
	const isIPhone = /^iPhone/.test(navigator.platform)
	const isIPad = /^iPad/.test(navigator.platform) || (isMac && navigator.maxTouchPoints > 1)
	return isIPhone || isIPad
}

export function canLockDocumentScroll() {
	if (typeof document === 'undefined') return false
	// Mobile Safari gets worse if we force html/body overflow. Vaul leaves that
	// path to body fixed positioning plus touch guards, so keep overflow untouched.
	return !isIOSBrowser()
}

function hasStableScrollbarGutter(value: string) {
	return value.split(/\s+/).includes('stable')
}

function isKeyboardInput(target: EventTarget | null): target is HTMLElement {
	if (!(target instanceof HTMLElement)) return false
	if (target instanceof HTMLTextAreaElement) return true
	if (target instanceof HTMLSelectElement) return false
	if (!(target instanceof HTMLInputElement)) return target.isContentEditable

	return !nonTextInputTypes.has(target.type)
}

export function lockDocumentScroll() {
	if (!canLockDocumentScroll()) return

	if (lockState.documentScrollLockCount === 0) {
		const root = document.documentElement
		const scrollbarWidth = Math.max(window.innerWidth - document.documentElement.clientWidth, 0)
		lockState.previousDocumentScroll = {
			htmlOverflow: root.style.overflow,
			bodyOverflow: document.body.style.overflow,
			bodyPaddingRight: document.body.style.paddingRight,
			htmlScrollbarGutter: root.style.getPropertyValue('scrollbar-gutter'),
			scrollbarWidthProperty: root.style.getPropertyValue('--vuedrawer-scrollbar-width'),
		}

		// Body fixed handles the Mobile Safari bugs, but the document overflow lock
		// is what removes the page scrollbar and prevents desktop/root scrolling.
		if (hasStableScrollbarGutter(window.getComputedStyle(root).getPropertyValue('scrollbar-gutter'))) {
			root.style.setProperty('scrollbar-gutter', 'auto')
		}
		if (scrollbarWidth > 0) {
			const currentPaddingRight = Number.parseFloat(window.getComputedStyle(document.body).paddingRight)
			const nextPaddingRight = (Number.isFinite(currentPaddingRight) ? currentPaddingRight : 0) + scrollbarWidth
			document.body.style.paddingRight = `${nextPaddingRight}px`
			root.style.setProperty('--vuedrawer-scrollbar-width', `${scrollbarWidth}px`)
		}
		root.style.overflow = 'hidden'
		document.body.style.overflow = 'hidden'
	}

	lockState.documentScrollLockCount += 1
}

export function restoreDocumentScroll() {
	if (typeof document === 'undefined' || lockState.documentScrollLockCount === 0) return

	lockState.documentScrollLockCount = Math.max(lockState.documentScrollLockCount - 1, 0)
	if (lockState.documentScrollLockCount > 0) return
	if (!lockState.previousDocumentScroll) return

	document.documentElement.style.overflow = lockState.previousDocumentScroll.htmlOverflow
	document.body.style.overflow = lockState.previousDocumentScroll.bodyOverflow
	document.body.style.paddingRight = lockState.previousDocumentScroll.bodyPaddingRight
	if (lockState.previousDocumentScroll.htmlScrollbarGutter) {
		document.documentElement.style.setProperty('scrollbar-gutter', lockState.previousDocumentScroll.htmlScrollbarGutter)
	}
	else {
		document.documentElement.style.removeProperty('scrollbar-gutter')
	}
	if (lockState.previousDocumentScroll.scrollbarWidthProperty) {
		document.documentElement.style.setProperty('--vuedrawer-scrollbar-width', lockState.previousDocumentScroll.scrollbarWidthProperty)
	}
	else {
		document.documentElement.style.removeProperty('--vuedrawer-scrollbar-width')
	}
	lockState.previousDocumentScroll = null
}

export function lockDocumentOverscroll() {
	if (!canLockDocumentOverscroll()) return

	if (lockState.documentOverscrollLockCount === 0) {
		lockState.previousDocumentOverscroll = {
			htmlOverscrollBehaviorY: document.documentElement.style.overscrollBehaviorY,
			bodyOverscrollBehaviorY: document.body.style.overscrollBehaviorY,
		}

		document.documentElement.style.overscrollBehaviorY = 'none'
		document.body.style.overscrollBehaviorY = 'none'
	}

	lockState.documentOverscrollLockCount += 1
}

export function restoreDocumentOverscroll() {
	if (!canLockDocumentOverscroll() || lockState.documentOverscrollLockCount === 0) return

	lockState.documentOverscrollLockCount = Math.max(lockState.documentOverscrollLockCount - 1, 0)
	if (lockState.documentOverscrollLockCount > 0) return
	if (!lockState.previousDocumentOverscroll) return

	document.documentElement.style.overscrollBehaviorY = lockState.previousDocumentOverscroll.htmlOverscrollBehaviorY
	document.body.style.overscrollBehaviorY = lockState.previousDocumentOverscroll.bodyOverscrollBehaviorY
	lockState.previousDocumentOverscroll = null
}

function isScrollableElement(node: Element) {
	const style = window.getComputedStyle(node)
	return /(auto|scroll)/.test(style.overflow + style.overflowX + style.overflowY)
}

function getScrollParent(node: Element) {
	let current: Element | null = node

	while (current) {
		if (isScrollableElement(current)) {
			// `data-drawer-scroll-axis` stays as an explicit consumer override
			// (it also drives touch-action/overscroll rules in drawer.css), e.g.
			// for scrollers whose content does not overflow yet. Without it we
			// trust computed overflow, but only with real scroll room so
			// overflow:auto wrappers without overflowing content are walked past.
			if (current.hasAttribute('data-drawer-scroll-axis') || current.scrollHeight > current.clientHeight) {
				return current
			}
		}

		current = current.parentElement
	}

	return document.scrollingElement || document.documentElement
}

function getTouchPoint(event: TouchEvent) {
	const touch = event.changedTouches[0]
	return {
		x: touch?.pageX ?? 0,
		y: touch?.pageY ?? 0,
	}
}

function isOwnedByAnotherOpenDrawer(target: Element, drawer: HTMLElement | null) {
	const owner = target.closest('[data-drawer-content][data-state="open"]')
	return Boolean(owner && owner !== drawer)
}

function isNoDragElement(target: Element) {
	return isDrawerNoDragTarget(target)
}

function getDrawerBranchRoot(target: Element) {
	const branch = target.closest(DRAWER_BRANCH_SELECTOR)
	return branch instanceof HTMLElement ? branch : null
}

function getTouchBoundary(target: Element, drawer: HTMLElement | null) {
	if (drawer?.contains(target)) return drawer
	return getDrawerBranchRoot(target)
}

function findHorizontalPanContainer(target: Element, boundary: HTMLElement) {
	let current: Element | null = target

	while (current && boundary.contains(current)) {
		if (current instanceof HTMLElement) {
			const style = window.getComputedStyle(current)
			const touchAction = (style.touchAction || '').replace(/\s+/g, '')
			const canPanHorizontally = touchAction.includes('pan-x') || touchAction === 'manipulation'
			const hasHorizontalOverflow = current.scrollWidth > current.clientWidth + 1

			if (canPanHorizontally && hasHorizontalOverflow) {
				return current
			}
		}

		current = current.parentElement
	}

	return null
}

/**
 * Registers the iOS touch/focus guards on `document` and returns their cleanup.
 * `getContentElement` is read at event time, so it may change while registered.
 */
export function createTouchScrollGuard(getContentElement: () => HTMLElement | null) {
	let scrollable: Element | null = null
	let horizontalPanContainer: Element | null = null
	let startX = 0
	let startY = 0
	let lastY = 0
	const liftedInputs = new Set<HTMLElement>()

	function temporarilyLiftInput(target: HTMLElement) {
		// touchend focuses the input, which fires the focus listener synchronously;
		// a second lift would capture `-2000px` as the "previous" transform and the
		// restore would strand the input off-screen. Lift once per frame.
		if (liftedInputs.has(target)) return
		liftedInputs.add(target)

		const previousTransform = target.style.transform
		target.style.transform = 'translateY(-2000px)'
		window.requestAnimationFrame(() => {
			liftedInputs.delete(target)
			target.style.transform = previousTransform
		})
	}

	function scrollInputIntoDrawerView(target: HTMLElement) {
		const drawer = getContentElement()
		if (!drawer?.contains(target)) return

		// Start from the parent: a self-scrollable input (e.g. an overflowing
		// textarea) must be revealed by its containing scroller, not by itself.
		const inputScroller = getScrollParent(target.parentElement ?? target)
		if (inputScroller === document.documentElement || inputScroller === document.body) return
		if (!drawer.contains(inputScroller)) return

		const scrollableElement = inputScroller as HTMLElement
		const scrollerRect = scrollableElement.getBoundingClientRect()
		const targetRect = target.getBoundingClientRect()
		const viewportBottom = window.visualViewport?.height ?? window.innerHeight
		const bottomLimit = Math.min(scrollerRect.bottom, viewportBottom) - 24

		if (targetRect.bottom > bottomLimit) {
			scrollableElement.scrollTop += targetRect.bottom - bottomLimit
			return
		}

		if (targetRect.top < scrollerRect.top) {
			scrollableElement.scrollTop -= scrollerRect.top - targetRect.top
		}
	}

	const handleTouchStart = (event: TouchEvent) => {
		const target = event.target
		const drawer = getContentElement()
		const touchPoint = getTouchPoint(event)
		startX = touchPoint.x
		startY = touchPoint.y
		lastY = touchPoint.y

		if (!(target instanceof Element)) {
			scrollable = null
			horizontalPanContainer = null
			return
		}

		const boundary = getTouchBoundary(target, drawer)
		if (!boundary) {
			scrollable = null
			horizontalPanContainer = null
			return
		}

		if (drawer?.contains(target) && isOwnedByAnotherOpenDrawer(target, drawer)) {
			scrollable = null
			horizontalPanContainer = null
			return
		}

		if (isNoDragElement(target)) {
			scrollable = null
			horizontalPanContainer = null
			return
		}

		scrollable = getScrollParent(target)
		horizontalPanContainer = findHorizontalPanContainer(target, boundary)
	}

	const handleTouchMove = (event: TouchEvent) => {
		if (!event.cancelable) return

		const target = event.target
		const drawer = getContentElement()
		const { x, y } = getTouchPoint(event)
		if (target instanceof Element && isOwnedByAnotherOpenDrawer(target, drawer)) {
			return
		}

		if (target instanceof Element && isNoDragElement(target)) {
			return
		}

		if (!(target instanceof Element)) {
			event.preventDefault()
			return
		}

		const boundary = getTouchBoundary(target, drawer)
		if (!boundary) {
			event.preventDefault()
			return
		}

		if (horizontalPanContainer && horizontalPanContainer.contains(target)) {
			const horizontalDelta = Math.abs(x - startX)
			const verticalDelta = Math.abs(y - startY)
			if (horizontalDelta > verticalDelta) {
				lastY = y
				return
			}
		}

		if (scrollable === document.documentElement || scrollable === document.body) {
			event.preventDefault()
			return
		}

		if (!scrollable || !boundary.contains(scrollable)) {
			event.preventDefault()
			return
		}

		const scrollTop = (scrollable as HTMLElement).scrollTop
		const bottom = (scrollable as HTMLElement).scrollHeight - (scrollable as HTMLElement).clientHeight

		// Mirror Vaul: once a nested scroller hits its top/bottom edge, prevent the
		// touchmove so Safari cannot chain into viewport scroll / pull-to-refresh.
		if (bottom <= 0) {
			lastY = y
			return
		}

		if ((scrollTop <= 0 && y > lastY) || (scrollTop >= bottom && y < lastY)) {
			event.preventDefault()
		}

		lastY = y
	}

	const handleTouchEnd = (event: TouchEvent) => {
		const target = event.target
		const drawer = getContentElement()
		if (!drawer || !isKeyboardInput(target) || !drawer.contains(target)) return
		if (target === document.activeElement) return

		event.preventDefault()
		temporarilyLiftInput(target)
		target.focus()
	}

	const handleFocus = (event: FocusEvent) => {
		const target = event.target
		const drawer = getContentElement()
		if (!drawer || !isKeyboardInput(target) || !drawer.contains(target)) return

		temporarilyLiftInput(target)
		window.requestAnimationFrame(() => {
			scrollInputIntoDrawerView(target)
		})
	}

	document.addEventListener('touchstart', handleTouchStart, { passive: false, capture: true })
	document.addEventListener('touchmove', handleTouchMove, { passive: false, capture: true })
	document.addEventListener('touchend', handleTouchEnd, { passive: false, capture: true })
	document.addEventListener('focus', handleFocus, true)

	return () => {
		document.removeEventListener('touchstart', handleTouchStart, true)
		document.removeEventListener('touchmove', handleTouchMove, true)
		document.removeEventListener('touchend', handleTouchEnd, true)
		document.removeEventListener('focus', handleFocus, true)
	}
}
