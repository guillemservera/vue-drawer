import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import type { Ref } from 'vue'
import { isSafariBrowser } from '../utils/drawerDom'
import { DRAWER_BRANCH_SELECTOR, isDrawerNoDragTarget } from '../utils/drawerSelectors'

interface BodyPositionSnapshot {
	position: string
	top: string
	left: string
	right: string
	height: string
}

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

interface UseDrawerScrollLockOptions {
	open: Ref<boolean>
	modal: Ref<boolean>
	nested: Ref<boolean>
	hasBeenOpened: Ref<boolean>
	preventScroll: Ref<boolean>
	preventScrollRestoration: Ref<boolean>
	noBodyStyles: Ref<boolean>
	contentElement: Ref<HTMLElement | null>
}

let previousBodyPosition: BodyPositionSnapshot | null = null
let previousDocumentScroll: DocumentScrollSnapshot | null = null
let previousDocumentOverscroll: DocumentOverscrollSnapshot | null = null
let documentScrollLockCount = 0
let documentOverscrollLockCount = 0

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

function canUseBodyFix() {
	if (typeof window === 'undefined') return false
	if (!isSafariBrowser()) return false
	return !window.matchMedia('(display-mode: standalone)').matches
}

function canLockDocumentOverscroll() {
	if (typeof document === 'undefined') return false
	return isSafariBrowser()
}

function isIOSBrowser() {
	if (typeof window === 'undefined') return false
	const { navigator } = window
	const isMac = /^Mac/.test(navigator.platform)
	const isIPhone = /^iPhone/.test(navigator.platform)
	const isIPad = /^iPad/.test(navigator.platform) || (isMac && navigator.maxTouchPoints > 1)
	return isIPhone || isIPad
}

function canLockDocumentScroll() {
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

function lockDocumentScroll() {
	if (!canLockDocumentScroll()) return

	if (documentScrollLockCount === 0) {
		const root = document.documentElement
		const scrollbarWidth = Math.max(window.innerWidth - document.documentElement.clientWidth, 0)
		previousDocumentScroll = {
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

	documentScrollLockCount += 1
}

function restoreDocumentScroll() {
	if (typeof document === 'undefined' || documentScrollLockCount === 0) return

	documentScrollLockCount = Math.max(documentScrollLockCount - 1, 0)
	if (documentScrollLockCount > 0) return
	if (!previousDocumentScroll) return

	document.documentElement.style.overflow = previousDocumentScroll.htmlOverflow
	document.body.style.overflow = previousDocumentScroll.bodyOverflow
	document.body.style.paddingRight = previousDocumentScroll.bodyPaddingRight
	if (previousDocumentScroll.htmlScrollbarGutter) {
		document.documentElement.style.setProperty('scrollbar-gutter', previousDocumentScroll.htmlScrollbarGutter)
	}
	else {
		document.documentElement.style.removeProperty('scrollbar-gutter')
	}
	if (previousDocumentScroll.scrollbarWidthProperty) {
		document.documentElement.style.setProperty('--vuedrawer-scrollbar-width', previousDocumentScroll.scrollbarWidthProperty)
	}
	else {
		document.documentElement.style.removeProperty('--vuedrawer-scrollbar-width')
	}
	previousDocumentScroll = null
}

function lockDocumentOverscroll() {
	if (!canLockDocumentOverscroll()) return

	if (documentOverscrollLockCount === 0) {
		previousDocumentOverscroll = {
			htmlOverscrollBehaviorY: document.documentElement.style.overscrollBehaviorY,
			bodyOverscrollBehaviorY: document.body.style.overscrollBehaviorY,
		}

		document.documentElement.style.overscrollBehaviorY = 'none'
		document.body.style.overscrollBehaviorY = 'none'
	}

	documentOverscrollLockCount += 1
}

function restoreDocumentOverscroll() {
	if (!canLockDocumentOverscroll() || documentOverscrollLockCount === 0) return

	documentOverscrollLockCount = Math.max(documentOverscrollLockCount - 1, 0)
	if (documentOverscrollLockCount > 0) return
	if (!previousDocumentOverscroll) return

	document.documentElement.style.overscrollBehaviorY = previousDocumentOverscroll.htmlOverscrollBehaviorY
	document.body.style.overscrollBehaviorY = previousDocumentOverscroll.bodyOverscrollBehaviorY
	previousDocumentOverscroll = null
}

export function useDrawerScrollLock(options: UseDrawerScrollLockOptions) {
	const {
		open,
		modal,
		nested,
		hasBeenOpened,
		preventScroll,
		preventScrollRestoration,
		noBodyStyles,
		contentElement,
	} = options
	const activeUrl = ref(typeof window !== 'undefined' ? window.location.href : '')
	const scrollPos = ref(typeof window !== 'undefined' ? window.scrollY : 0)
	const hasDocumentScrollLock = ref(false)
	const hasDocumentOverscrollLock = ref(false)
	const hasBodyPositionLock = ref(false)
	const lockedScrollX = ref(0)
	const lockedScrollY = ref(0)
	const removeTouchScrollGuard = ref<(() => void) | null>(null)
	const bodyPositionAdjustmentTimer = ref<number | null>(null)
	const windowScrollRestoreFrame = ref<number | null>(null)
	const nonModalRestoreTimer = ref<number | null>(null)

	function clearBodyPositionAdjustmentTimer() {
		if (bodyPositionAdjustmentTimer.value === null || typeof window === 'undefined') return
		window.clearTimeout(bodyPositionAdjustmentTimer.value)
		bodyPositionAdjustmentTimer.value = null
	}

	function clearNonModalRestoreTimer() {
		if (nonModalRestoreTimer.value === null || typeof window === 'undefined') return
		window.clearTimeout(nonModalRestoreTimer.value)
		nonModalRestoreTimer.value = null
	}

	function clearWindowScrollRestoreFrame() {
		if (windowScrollRestoreFrame.value === null || typeof window === 'undefined') return
		window.cancelAnimationFrame(windowScrollRestoreFrame.value)
		windowScrollRestoreFrame.value = null
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

	function clearTouchScrollGuard() {
		removeTouchScrollGuard.value?.()
		removeTouchScrollGuard.value = null
	}

	function registerTouchScrollGuard() {
		if (typeof document === 'undefined' || typeof window === 'undefined') return
		if (!isIOSBrowser()) return
		if (removeTouchScrollGuard.value) return

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
			const drawer = contentElement.value
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
			const drawer = contentElement.value
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
			const drawer = contentElement.value
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
			const drawer = contentElement.value
			if (!drawer || !isKeyboardInput(target) || !drawer.contains(target)) return
			if (target === document.activeElement) return

			event.preventDefault()
			temporarilyLiftInput(target)
			target.focus()
		}

		const handleFocus = (event: FocusEvent) => {
			const target = event.target
			const drawer = contentElement.value
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

		removeTouchScrollGuard.value = () => {
			document.removeEventListener('touchstart', handleTouchStart, true)
			document.removeEventListener('touchmove', handleTouchMove, true)
			document.removeEventListener('touchend', handleTouchEnd, true)
			document.removeEventListener('focus', handleFocus, true)
		}
	}

	function handleWindowScroll() {
		if (hasBodyPositionLock.value) {
			if (window.scrollX !== lockedScrollX.value || window.scrollY !== lockedScrollY.value) {
				scheduleLockedWindowScrollRestore()
			}
			return
		}

		scrollPos.value = window.scrollY
	}

	function scheduleLockedWindowScrollRestore() {
		if (typeof window === 'undefined' || windowScrollRestoreFrame.value !== null) return

		windowScrollRestoreFrame.value = window.requestAnimationFrame(() => {
			windowScrollRestoreFrame.value = null
			if (!hasBodyPositionLock.value) return
			if (window.scrollX === lockedScrollX.value && window.scrollY === lockedScrollY.value) return

			// Vaul uses a window scroll listener as the last line of defense on iOS.
			// Safari can still move the root viewport while the body is fixed,
			// especially around browser chrome and keyboard transitions.
			window.scrollTo(lockedScrollX.value, lockedScrollY.value)
		})
	}

	function syncDocumentOverscrollLock(shouldLock: boolean) {
		if (shouldLock && !hasDocumentOverscrollLock.value) {
			// Vaul's React implementation prevents Mobile Safari from chaining drawer drags
			// into viewport pull-to-refresh. Keep that protection for the full drawer lifetime.
			lockDocumentOverscroll()
			hasDocumentOverscrollLock.value = true
			return
		}

		if (!shouldLock && hasDocumentOverscrollLock.value) {
			restoreDocumentOverscroll()
			hasDocumentOverscrollLock.value = false
		}
	}

	function syncDocumentScrollLock(shouldLock: boolean) {
		const canLock = shouldLock && canLockDocumentScroll()

		if (canLock && !hasDocumentScrollLock.value) {
			lockDocumentScroll()
			hasDocumentScrollLock.value = true
			return
		}

		if (!canLock && hasDocumentScrollLock.value) {
			restoreDocumentScroll()
			hasDocumentScrollLock.value = false
		}
	}

	function syncTouchScrollGuard(shouldLock: boolean) {
		if (shouldLock) {
			registerTouchScrollGuard()
			return
		}

		clearTouchScrollGuard()
	}

	function lockBodyPosition() {
		if (!preventScroll.value || noBodyStyles.value || !canUseBodyFix() || nested.value || previousBodyPosition) return

		const { scrollX, innerHeight } = window
		lockedScrollX.value = scrollX
		lockedScrollY.value = scrollPos.value

		previousBodyPosition = {
			position: document.body.style.position,
			top: document.body.style.top,
			left: document.body.style.left,
			right: document.body.style.right,
			height: document.body.style.height,
		}

		document.body.style.setProperty('position', 'fixed', 'important')
		document.body.style.top = `${-lockedScrollY.value}px`
		document.body.style.left = `${-lockedScrollX.value}px`
		document.body.style.right = '0px'
		document.body.style.height = 'auto'
		hasBodyPositionLock.value = true

		clearBodyPositionAdjustmentTimer()
		bodyPositionAdjustmentTimer.value = window.setTimeout(() => {
			if (typeof window === 'undefined') return
			window.requestAnimationFrame(() => {
				if (typeof window === 'undefined') return
				const bottomBarHeight = innerHeight - window.innerHeight
				if (bottomBarHeight && lockedScrollY.value >= innerHeight) {
					document.body.style.top = `${-(lockedScrollY.value + bottomBarHeight)}px`
				}
			})
		}, 300)
	}

	function restoreBodyPosition() {
		if (!canUseBodyFix() || !previousBodyPosition) return
		clearBodyPositionAdjustmentTimer()

		const scrollY = -Number.parseInt(document.body.style.top || '0', 10)
		const scrollX = -Number.parseInt(document.body.style.left || '0', 10)

		hasBodyPositionLock.value = false
		clearWindowScrollRestoreFrame()

		document.body.style.position = previousBodyPosition.position
		document.body.style.top = previousBodyPosition.top
		document.body.style.left = previousBodyPosition.left
		document.body.style.right = previousBodyPosition.right
		document.body.style.height = previousBodyPosition.height

		previousBodyPosition = null
		lockedScrollX.value = 0
		lockedScrollY.value = 0

		window.requestAnimationFrame(() => {
			if (preventScrollRestoration.value && activeUrl.value !== window.location.href) {
				activeUrl.value = window.location.href
				return
			}

			window.scrollTo(scrollX, scrollY)
		})
	}

	onMounted(() => {
		handleWindowScroll()
		window.addEventListener('scroll', handleWindowScroll)
	})

	watch(
		() => [open.value, modal.value, preventScroll.value, noBodyStyles.value] as const,
		([isOpen, isModal, shouldPreventScroll, shouldSkipBodyStyles]) => {
			const shouldLockOverscroll = shouldPreventScroll && isOpen && isModal
			const shouldLockDocumentScroll = shouldLockOverscroll && !shouldSkipBodyStyles
			syncDocumentScrollLock(shouldLockDocumentScroll)
			syncDocumentOverscrollLock(shouldLockOverscroll)
			syncTouchScrollGuard(shouldLockOverscroll)
		},
		{ immediate: true },
	)

	watch(
		() => [
			open.value,
			modal.value,
			nested.value,
			hasBeenOpened.value,
			activeUrl.value,
			preventScroll.value,
			noBodyStyles.value,
		] as const,
		([isOpen, isModal, isNested, wasOpened, _activeUrl, shouldPreventScroll, shouldSkipBodyStyles]) => {
			if (isNested || !wasOpened) return

			if (isOpen && shouldPreventScroll && !shouldSkipBodyStyles) {
				lockBodyPosition()
				if (!isModal) {
					clearNonModalRestoreTimer()
					nonModalRestoreTimer.value = window.setTimeout(() => {
						restoreBodyPosition()
					}, 500)
				}
				return
			}

			restoreBodyPosition()
		},
		{ immediate: true },
	)

	onBeforeUnmount(() => {
		if (typeof window !== 'undefined') {
			window.removeEventListener('scroll', handleWindowScroll)
		}

		const shouldKeepBodyPosition = typeof document !== 'undefined' && modal.value && preventScroll.value && !noBodyStyles.value
			? [...document.querySelectorAll('[data-drawer-content][data-state="open"]')]
				.some(element => element !== contentElement.value)
			: false

		if (hasDocumentOverscrollLock.value) {
			restoreDocumentOverscroll()
			hasDocumentOverscrollLock.value = false
		}

		if (hasDocumentScrollLock.value) {
			restoreDocumentScroll()
			hasDocumentScrollLock.value = false
		}

		clearBodyPositionAdjustmentTimer()
		clearWindowScrollRestoreFrame()
		clearNonModalRestoreTimer()
		clearTouchScrollGuard()

		if (!shouldKeepBodyPosition) {
			restoreBodyPosition()
		}
	})
}
