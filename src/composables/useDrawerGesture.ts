import { onBeforeUnmount, ref, watch } from 'vue'
import type { Ref } from 'vue'
import {
	DRAWER_DRAG_ACTIVATION_PX,
	DRAWER_VELOCITY_THRESHOLD,
	getAxisDistance,
	getCloseDirectionSign,
	getClosedTransform,
	getTranslateStyles,
	isVerticalDrawer,
} from '../utils/drawerConstants'
import { DRAWER_RECENT_OPEN_WINDOW_MS, restoreBodyPointerEvents, waitForDrawerTransition } from '../utils/drawerDom'
import { getPointerPagePosition, resolvePointerDragIntent } from '../utils/drawerPointer'
import { getOverlayOpacityForOffset, resolveSnapPointTarget } from '../utils/drawerSnapPoints'
import type { DrawerDirection } from '../utils/drawerTypes'

interface UseDrawerGestureOptions {
	open: Ref<boolean>
	openedAt: Ref<number | null>
	direction: Ref<DrawerDirection>
	dismissible: Ref<boolean>
	closeThreshold: Ref<number>
	scrollLockTimeout: Ref<number>
	snapToSequentialPoint: Ref<boolean>
	hasSnapPoints: Ref<boolean>
	activeSnapPointIndex: Ref<number>
	fadeFromIndex: Ref<number | undefined>
	contentElement: Ref<HTMLElement | null>
	overlayElement: Ref<HTMLElement | null>
	isDragging: Ref<boolean>
	gestureClosing: Ref<boolean>
	preventCloseAutoFocusOnce: Ref<boolean>
	requestOpenChange: (value: boolean) => void
	setSkipCloseAnimation: (value: boolean) => void
	setGestureClosing: (value: boolean) => void
	emitDrag: (pointerEvent: PointerEvent, percentageDragged: number) => void
	emitRelease: (pointerEvent: PointerEvent, open: boolean) => void
	getContentTransition: (options?: { instant?: boolean, close?: boolean }) => string
	getOverlayTransition: (options?: { instant?: boolean, close?: boolean }) => string
	getVisibleDrawerSize: () => number
	getSnapPointBaseSize: () => number
	getSnapPointsOffset: () => number[]
	getRestingOffset: () => number
	getRestingOverlayOpacity: () => number
	animateToSnapPoint: (index: number) => void
	resetInteractiveState: () => void
	onNestedDrag: (closeProgress: number) => void
	onNestedRelease: (isStillOpen: boolean) => void
}

export function useDrawerGesture(options: UseDrawerGestureOptions) {
	const {
		open,
		openedAt,
		direction,
		dismissible,
		closeThreshold,
		scrollLockTimeout,
		snapToSequentialPoint,
		hasSnapPoints,
		activeSnapPointIndex,
		fadeFromIndex,
		contentElement,
		overlayElement,
		isDragging,
		gestureClosing,
		preventCloseAutoFocusOnce,
		requestOpenChange,
		setSkipCloseAnimation,
		setGestureClosing,
		emitDrag,
		emitRelease,
		getContentTransition,
		getOverlayTransition,
		getVisibleDrawerSize,
		getSnapPointBaseSize,
		getSnapPointsOffset,
		getRestingOffset,
		getRestingOverlayOpacity,
		animateToSnapPoint,
		resetInteractiveState,
		onNestedDrag,
		onNestedRelease,
	} = options

	const pointerId = ref<number | null>(null)
	const pointerTarget = ref<EventTarget | null>(null)
	const lastPointerEvent = ref<PointerEvent | null>(null)
	const pointerCaptureElement = ref<HTMLElement | null>(null)
	const pointerStartPosition = ref<{ x: number, y: number } | null>(null)
	const pointerStart = ref(0)
	const pointerStartTime = ref(0)
	const lastPreventedDragAt = ref(0)
	const hasExceededDragThreshold = ref(false)
	const hasCommittedSwipeDirection = ref(false)
	const isAllowedToDrag = ref(false)
	const dragBaseOffset = ref(0)
	const currentOffset = ref(0)
	const touchEndFallbackTimer = ref<number | null>(null)
	const removeWindowGestureListeners = ref<(() => void) | null>(null)
	let closeTransitionVersion = 0

	function clearTouchEndFallback() {
		if (touchEndFallbackTimer.value === null || typeof window === 'undefined') return
		window.clearTimeout(touchEndFallbackTimer.value)
		touchEndFallbackTimer.value = null
	}

	function clearWindowGestureListeners() {
		removeWindowGestureListeners.value?.()
		removeWindowGestureListeners.value = null
	}

	function releaseCapturedPointer(captureElement: HTMLElement | null, capturedPointerId: number | null) {
		if (capturedPointerId === null || !captureElement?.hasPointerCapture?.(capturedPointerId)) return

		try {
			captureElement.releasePointerCapture(capturedPointerId)
		}
		catch {
			// Ignore invalid pointer capture release attempts during teardown.
		}
	}

	function cleanupGestureState() {
		clearTouchEndFallback()
		clearWindowGestureListeners()
		const capturedPointerId = pointerId.value
		const captureElement = pointerCaptureElement.value
		pointerId.value = null
		pointerTarget.value = null
		lastPointerEvent.value = null
		pointerCaptureElement.value = null
		pointerStartPosition.value = null
		pointerStart.value = 0
		pointerStartTime.value = 0
		hasExceededDragThreshold.value = false
		hasCommittedSwipeDirection.value = false
		isAllowedToDrag.value = false
		isDragging.value = false
		dragBaseOffset.value = 0
		currentOffset.value = 0
		releaseCapturedPointer(captureElement, capturedPointerId)
	}

	function finalizeTouchGestureFromFallback() {
		touchEndFallbackTimer.value = null
		if (pointerId.value === null) return

		const event = lastPointerEvent.value
		if (!event) {
			settleInterruptedGesture()
			return
		}

		finalizeGesture(event)
	}

	function forceCloseAfterInterruptedGesture() {
		setGestureClosing(false)
		setSkipCloseAnimation(true)
		requestOpenChange(false)
	}

	function settleInterruptedGesture() {
		if (pointerId.value === null) return

		if (gestureClosing.value) {
			forceCloseAfterInterruptedGesture()
			cleanupGestureState()
			return
		}

		if (isDragging.value) {
			animateBackToOpen()
			cleanupGestureState()
			return
		}

		clearInlineStyles()
		resetInteractiveState()
		cleanupGestureState()
	}

	function registerWindowGestureListeners() {
		if (typeof window === 'undefined' || typeof document === 'undefined') return

		clearWindowGestureListeners()

		const handleWindowPointerUp = (event: PointerEvent) => {
			if (pointerId.value !== event.pointerId) return
			finalizeGesture(event)
		}

		const handleWindowPointerCancel = (event: PointerEvent) => {
			if (pointerId.value !== event.pointerId) return
			settleInterruptedGesture()
		}

		const handleWindowTouchEnd = () => {
			if (pointerId.value === null) return

			touchEndFallbackTimer.value = window.setTimeout(() => {
				finalizeTouchGestureFromFallback()
			}, 0)
		}

		const handleWindowTouchCancel = () => {
			settleInterruptedGesture()
		}

		const handleWindowGestureAbort = () => {
			settleInterruptedGesture()
		}

		const handleVisibilityChange = () => {
			if (!document.hidden) return
			settleInterruptedGesture()
		}

		// Safari can move the viewport during a drawer drag before it delivers touchend.
		// Keep active drags alive so the touchend fallback can finish the close gesture.
		const handleWindowScroll = () => {
			if (pointerId.value === null) return
		}

		window.addEventListener('pointerup', handleWindowPointerUp, { passive: true })
		window.addEventListener('pointercancel', handleWindowPointerCancel, { passive: true })
		window.addEventListener('touchend', handleWindowTouchEnd, { passive: true })
		window.addEventListener('touchcancel', handleWindowTouchCancel, { passive: true })
		window.addEventListener('scroll', handleWindowScroll, { passive: true })
		window.addEventListener('pagehide', handleWindowGestureAbort, { passive: true })
		window.addEventListener('blur', handleWindowGestureAbort)
		document.addEventListener('visibilitychange', handleVisibilityChange)

		removeWindowGestureListeners.value = () => {
			window.removeEventListener('pointerup', handleWindowPointerUp)
			window.removeEventListener('pointercancel', handleWindowPointerCancel)
			window.removeEventListener('touchend', handleWindowTouchEnd)
			window.removeEventListener('touchcancel', handleWindowTouchCancel)
			window.removeEventListener('scroll', handleWindowScroll)
			window.removeEventListener('pagehide', handleWindowGestureAbort)
			window.removeEventListener('blur', handleWindowGestureAbort)
			document.removeEventListener('visibilitychange', handleVisibilityChange)
		}
	}

	function shouldIgnoreTarget(target: EventTarget | null) {
		// Only explicit no-drag zones — and native SELECT, which opens its own OS
		// picker — suppress the swipe. Interactive content (buttons, links, list
		// rows) must NOT block it: side sheets/nav sidebars are swiped edge-to-edge,
		// and vertical bottom sheets rely on the scroll-position guard in
		// shouldAllowDrag (a drag only starts when the scroll body is at the top).
		// Blanket-blocking every interactive element was the regression that killed
		// drag-to-dismiss on drawers with a scrollable body.
		if (!(target instanceof HTMLElement)) return false
		if (target.tagName === 'SELECT') return true
		return Boolean(target.closest('[data-drawer-no-drag], [data-vaul-no-drag]'))
	}

	function wasDrawerOpenedRecently() {
		return openedAt.value !== null && Date.now() - openedAt.value < DRAWER_RECENT_OPEN_WINDOW_MS
	}

	function shouldAllowDrag(target: EventTarget | null, closeDistance: number) {
		if (!dismissible.value && !hasSnapPoints.value) return false
		if (!target || shouldIgnoreTarget(target)) return false

		if (!isVerticalDrawer(direction.value)) {
			return true
		}

		const now = Date.now()
		if (wasDrawerOpenedRecently()) return false

		if (
			currentOffset.value === dragBaseOffset.value
			&& lastPreventedDragAt.value > 0
			&& now - lastPreventedDragAt.value < scrollLockTimeout.value
		) {
			lastPreventedDragAt.value = now
			return false
		}

		if (currentOffset.value > dragBaseOffset.value) {
			return true
		}

		if (closeDistance <= 0) {
			const canExpandSnapPoint = hasSnapPoints.value && activeSnapPointIndex.value < getSnapPointsOffset().length - 1
			if (!canExpandSnapPoint) {
				lastPreventedDragAt.value = now
				return false
			}
		}

		let element = target instanceof HTMLElement ? target : null
		const root = contentElement.value

		while (element && root && root.contains(element)) {
			if (element.scrollHeight > element.clientHeight + 1) {
				if (element.scrollTop !== 0) {
					lastPreventedDragAt.value = now
					return false
				}

				if (element.getAttribute('role') === 'dialog') {
					return true
				}
			}

			element = element.parentElement
		}

		return true
	}

	function setDraggingStyles(offset: number) {
		const content = contentElement.value
		if (!content) return

		const overlay = overlayElement.value
		const drawerSize = hasSnapPoints.value ? getSnapPointBaseSize() : getVisibleDrawerSize()
		const closeProgress = Math.min(Math.max(offset, 0) / drawerSize, 1)

		content.style.transition = 'none'
		content.style.transform = getTranslateStyles(direction.value, offset)

		if (overlay) {
			overlay.style.transition = 'none'
			overlay.style.opacity = hasSnapPoints.value
				? `${getOverlayOpacityForOffset(offset, getSnapPointsOffset(), fadeFromIndex.value)}`
				: `${1 - closeProgress}`
		}

		onNestedDrag(closeProgress)
	}

	function clearInlineStyles(options: {
		preserveTransform?: boolean
		preserveOpacity?: boolean
		preservePointerEvents?: boolean
	} = {}) {
		const {
			preserveTransform = false,
			preserveOpacity = false,
			preservePointerEvents = false,
		} = options
		const content = contentElement.value
		const overlay = overlayElement.value

		if (content) {
			content.style.transition = ''
			if (!preserveTransform) {
				content.style.transform = ''
			}
			if (!preservePointerEvents) {
				content.style.pointerEvents = ''
			}
		}

		if (overlay) {
			overlay.style.transition = ''
			if (!preserveOpacity) {
				overlay.style.opacity = ''
			}
			if (!preservePointerEvents) {
				overlay.style.pointerEvents = ''
			}
		}
	}

	watch(open, (isOpen) => {
		if (!isOpen) return

		const content = contentElement.value
		const overlay = overlayElement.value
		const hadClosingArtifacts = gestureClosing.value
			|| content?.style.pointerEvents === 'none'
			|| overlay?.style.pointerEvents === 'none'
			|| content?.style.transform === getClosedTransform(direction.value)
			|| overlay?.style.opacity === '0'

		if (!hadClosingArtifacts) return

		closeTransitionVersion += 1
		clearInlineStyles()
		setSkipCloseAnimation(false)
		setGestureClosing(false)
		preventCloseAutoFocusOnce.value = false
	})

	function animateBackToOpen() {
		const content = contentElement.value
		if (!content) return
		const restingOffset = getRestingOffset()
		if (currentOffset.value === restingOffset) {
			resetInteractiveState()
			return
		}

		const overlay = overlayElement.value

		content.style.transition = getContentTransition()
		content.style.transform = getTranslateStyles(direction.value, restingOffset)

		if (overlay) {
			overlay.style.transition = getOverlayTransition()
			overlay.style.opacity = `${getRestingOverlayOpacity()}`
		}

		waitForDrawerTransition(content, 'transform', () => {
			if (!open.value) return
			clearInlineStyles()
			resetInteractiveState()
		})

		onNestedRelease(true)
	}

	function animateCloseFromGesture() {
		const content = contentElement.value
		if (!content || gestureClosing.value) return
		const transitionVersion = ++closeTransitionVersion

		const overlay = overlayElement.value
		setGestureClosing(true)
		// Close the logical modal state immediately so Safari/Radix never keep a ghost
		// dismissable layer alive while the swipe-close animation is still finishing.
		requestOpenChange(false)
		preventCloseAutoFocusOnce.value = true
		content.style.pointerEvents = 'none'
		if (overlay) {
			overlay.style.pointerEvents = 'none'
		}
		restoreBodyPointerEvents()

		content.style.transition = getContentTransition({ close: true })
		content.style.transform = getClosedTransform(direction.value)

		if (overlay) {
			overlay.style.transition = getOverlayTransition({ close: true })
			overlay.style.opacity = '0'
		}

		onNestedRelease(false)

		waitForDrawerTransition(content, 'transform', () => {
			if (transitionVersion !== closeTransitionVersion) {
				return
			}
			// Keep the drawer non-interactive for the short Vue leave that follows the
			// gesture-owned close. Clearing pointer-events here lets the lingering overlay
			// intercept taps during the leave window, which is exactly the regression we
			// are trying to avoid.
			clearInlineStyles({
				preserveTransform: true,
				preserveOpacity: true,
				preservePointerEvents: true,
			})
			// IMPORTANT: Set skipCloseAnimation BEFORE gestureClosing. When gestureClosing
			// becomes false, shouldRender becomes false, and Vue's <Transition> starts its
			// leave animation reading shouldUseInstantLeave at that moment. If skipCloseAnimation
			// isn't set yet, the Transition uses the normal leave instead of instant (1ms).
			setSkipCloseAnimation(true)
			setGestureClosing(false)
		})
	}

	function finalizeGesture(event: PointerEvent) {
		const axisDistance = getAxisDistance(event, direction.value)
		if (!isDragging.value) {
			cleanupGestureState()
			return
		}

		const rawDistance = axisDistance - pointerStart.value
		const closeDistance = rawDistance * getCloseDirectionSign(direction.value)
		const elapsed = Math.max(performance.now() - pointerStartTime.value, 1)
		const velocity = closeDistance / elapsed
		const drawerSize = hasSnapPoints.value ? getSnapPointBaseSize() : getVisibleDrawerSize()

		if (hasSnapPoints.value) {
			const snapPointsOffset = getSnapPointsOffset()
			const minOffset = snapPointsOffset[snapPointsOffset.length - 1] ?? 0
			const maxOffset = dismissible.value ? drawerSize : (snapPointsOffset[0] ?? 0)
			const resolvedOffset = clamp(dragBaseOffset.value + closeDistance, minOffset, maxOffset)
			currentOffset.value = resolvedOffset

			const target = resolveSnapPointTarget({
				activeSnapPointIndex: activeSnapPointIndex.value,
				closeThreshold: closeThreshold.value,
				currentOffset: resolvedOffset,
				dismissible: dismissible.value,
				drawerSize,
				snapPointsOffset,
				snapToSequentialPoint: snapToSequentialPoint.value,
				velocity,
			})

			if (target.type === 'close') {
				emitRelease(event, false)
				animateCloseFromGesture()
			}
			else if (target.index >= 0) {
				emitRelease(event, true)
				animateToSnapPoint(target.index)
				onNestedRelease(true)
			}
			else {
				emitRelease(event, true)
				animateBackToOpen()
			}

			cleanupGestureState()
			return
		}

		const shouldClose = closeDistance > 0 && (
			velocity >= DRAWER_VELOCITY_THRESHOLD
			|| closeDistance >= drawerSize * closeThreshold.value
		)

		if (shouldClose) {
			emitRelease(event, false)
			animateCloseFromGesture()
		}
		else {
			emitRelease(event, true)
			animateBackToOpen()
		}

		cleanupGestureState()
	}

	function handlePointerDown(event: PointerEvent) {
		if (!open.value || gestureClosing.value) return
		if (event.pointerType === 'mouse' && event.button !== 0) return
		if (!contentElement.value?.contains(event.target as Node)) return
		if (shouldIgnoreTarget(event.target)) return

		pointerId.value = event.pointerId
		pointerTarget.value = event.target
		lastPointerEvent.value = event
		pointerCaptureElement.value = event.target instanceof HTMLElement
			? event.target
			: contentElement.value
		pointerStartPosition.value = getPointerPagePosition(event)
		pointerStart.value = getAxisDistance(event, direction.value)
		pointerStartTime.value = performance.now()
		dragBaseOffset.value = getRestingOffset()
		currentOffset.value = dragBaseOffset.value
		registerWindowGestureListeners()

		try {
			pointerCaptureElement.value?.setPointerCapture?.(event.pointerId)
		}
		catch {
			pointerCaptureElement.value = null
		}
	}

	function handlePointerMove(event: PointerEvent) {
		if (pointerId.value !== event.pointerId || !contentElement.value) return
		lastPointerEvent.value = event

		const pointerStartPositionValue = pointerStartPosition.value
		if (pointerStartPositionValue) {
			const pointerPosition = getPointerPagePosition(event)
			const swipeStartThreshold = event.pointerType === 'touch' ? 10 : 2
			const delta = {
				x: pointerPosition.x - pointerStartPositionValue.x,
				y: pointerPosition.y - pointerStartPositionValue.y,
			}
			const dragIntent = resolvePointerDragIntent({
				delta,
				direction: direction.value,
				threshold: swipeStartThreshold,
				hasCommittedDirection: hasCommittedSwipeDirection.value,
			})

			hasCommittedSwipeDirection.value = dragIntent.hasCommittedDirection

			if (!dragIntent.shouldHandle) {
				if (Math.abs(delta.x) > swipeStartThreshold || Math.abs(delta.y) > swipeStartThreshold) {
					cleanupGestureState()
				}
				return
			}
		}

		const axisDistance = getAxisDistance(event, direction.value)

		const rawDistance = axisDistance - pointerStart.value
		const closeDistance = rawDistance * getCloseDirectionSign(direction.value)
		const activationThreshold = event.pointerType === 'touch'
			? Math.max(DRAWER_DRAG_ACTIVATION_PX, 10)
			: DRAWER_DRAG_ACTIVATION_PX

		if (Math.abs(rawDistance) < activationThreshold) return

		if (!hasExceededDragThreshold.value) {
			hasExceededDragThreshold.value = true
		}

		if (!isAllowedToDrag.value) {
			if (!shouldAllowDrag(pointerTarget.value, closeDistance)) {
				return
			}

			// Match Vaul's scroll handoff: a gesture that starts while inner content
			// is scrolling can become a drawer drag later in the same touch sequence.
			isAllowedToDrag.value = true
			window.getSelection()?.removeAllRanges()
		}

		if (event.cancelable) {
			event.preventDefault()
		}

		isDragging.value = true
		if (hasSnapPoints.value) {
			const snapPointsOffset = getSnapPointsOffset()
			const minOffset = snapPointsOffset[snapPointsOffset.length - 1] ?? 0
			const snapPointBaseSize = getSnapPointBaseSize()
			const maxOffset = dismissible.value ? snapPointBaseSize : (snapPointsOffset[0] ?? dragBaseOffset.value)
			const offset = clamp(dragBaseOffset.value + closeDistance, minOffset, maxOffset)
			currentOffset.value = offset
			setDraggingStyles(offset)
			emitDrag(event, Math.min(Math.max(offset, 0) / snapPointBaseSize, 1))
			return
		}

		const offset = Math.max(closeDistance, 0)
		currentOffset.value = offset
		setDraggingStyles(offset)
		emitDrag(event, Math.min(Math.max(offset, 0) / getVisibleDrawerSize(), 1))
	}

	function handlePointerUp(event: PointerEvent) {
		if (pointerId.value !== event.pointerId) return
		lastPointerEvent.value = event
		finalizeGesture(event)
	}

	function handlePointerCancel(event: PointerEvent) {
		if (pointerId.value !== event.pointerId) return

		if (!isDragging.value) {
			cleanupGestureState()
			return
		}

		animateBackToOpen()
		cleanupGestureState()
	}

	function handleLostPointerCapture(event: PointerEvent) {
		if (pointerId.value !== event.pointerId) return

		if (!isDragging.value) {
			cleanupGestureState()
			return
		}

		animateBackToOpen()
		cleanupGestureState()
	}

	onBeforeUnmount(() => {
		clearInlineStyles()
		cleanupGestureState()
	})

	return {
		handlePointerDown,
		handlePointerMove,
		handlePointerUp,
		handlePointerCancel,
		handleLostPointerCapture,
		clearInlineStyles,
	}
}

function clamp(value: number, min: number, max: number) {
	return Math.min(Math.max(value, min), max)
}
