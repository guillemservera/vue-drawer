import { onBeforeUnmount, ref, watch } from 'vue'
import type { Ref } from 'vue'
import {
	DRAWER_DRAG_ACTIVATION_PX,
	DRAWER_VELOCITY_THRESHOLD,
	dampenValue,
	getAxisDistance,
	getCloseDirectionSign,
	getClosedTransform,
	getTranslateStyles,
	isVerticalDrawer,
} from '../utils/drawerConstants'
import { DRAWER_RECENT_OPEN_WINDOW_MS, getDrawerTransform, getDrawerTransitions, restoreBodyPointerEvents, waitForDrawerTransition } from '../utils/drawerDom'
import { getPointerPagePosition, resolvePointerDragIntent } from '../utils/drawerPointer'
import { getClosestSnapPointIndex, getOverlayOpacityForOffset, resolveSnapPointTarget } from '../utils/drawerSnapPoints'
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
	getSnapPointsOffset: (baseSize?: number) => number[]
	getRestingOffset: () => number
	getRestingOverlayOpacity: () => number
	animateToSnapPoint: (index: number) => void
	waitForSettle: (content: HTMLElement) => void
	cancelSettle: () => boolean
	resetInteractiveState: () => void
	onNestedDrag: (closeProgress: number, startProgress?: number) => void
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
		waitForSettle,
		cancelSettle,
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
	let gestureDrawerSize = 1
	let gestureSnapPointsOffset: number[] = []
	let sampledOffset: number | undefined
	let dragTransform: DOMMatrix | undefined
	let dragOverlayStartOpacity: number | undefined
	let previousContentOpacity: string | undefined

	function cacheGestureMetrics() {
		const drawerSize = hasSnapPoints.value ? getSnapPointBaseSize() : getVisibleDrawerSize()
		gestureDrawerSize = Math.max(drawerSize, 1)
		gestureSnapPointsOffset = hasSnapPoints.value
			? getSnapPointsOffset(gestureDrawerSize)
			: []
	}

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
		gestureDrawerSize = 1
		gestureSnapPointsOffset = []
		sampledOffset = undefined
		dragTransform = undefined
		dragOverlayStartOpacity = undefined
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

	function shouldAllowDrag(target: EventTarget | null, closeDistance: number, moving: boolean) {
		if (!dismissible.value && !hasSnapPoints.value) return false
		if (!target || shouldIgnoreTarget(target)) return false

		if (!isVerticalDrawer(direction.value)) {
			return true
		}

		const now = Date.now()
		if (!moving && wasDrawerOpenedRecently()) return false

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
			const canExpandSnapPoint = hasSnapPoints.value && activeSnapPointIndex.value < gestureSnapPointsOffset.length - 1
			if (!canExpandSnapPoint && !moving) {
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

	function getDragOverlayCurveOpacity(offset: number) {
		return hasSnapPoints.value
			? getOverlayOpacityForOffset(offset, gestureSnapPointsOffset, fadeFromIndex.value)
			: 1 - clamp(offset / gestureDrawerSize, 0, 1)
	}

	function getDragOverlayOpacity(offset: number) {
		const opacity = getDragOverlayCurveOpacity(offset)
		if (dragOverlayStartOpacity === undefined) return opacity
		const start = dragBaseOffset.value
		if (offset === start) return dragOverlayStartOpacity
		const closing = offset > start
		const canSlideOffscreen = dismissible.value || !hasSnapPoints.value
		const closedOffset = canSlideOffscreen ? gestureDrawerSize : gestureSnapPointsOffset[0] ?? start
		const end = closing ? closedOffset : gestureSnapPointsOffset.at(-1) ?? 0
		const progress = clamp(Math.abs(offset - start) / Math.abs(end - start), 0, 1)
		const startCorrection = dragOverlayStartOpacity - getDragOverlayCurveOpacity(start)
		// A snap curve that starts fully opaque still has to reach zero offscreen.
		const endCorrection = closing && canSlideOffscreen ? -getDragOverlayCurveOpacity(end) : 0
		return clamp(opacity + startCorrection * (1 - progress) + endCorrection * progress, 0, 1)
	}

	function setDraggingStyles(offset: number, startProgress?: number) {
		const content = contentElement.value
		if (!content) return

		const overlay = overlayElement.value
		const closeProgress = clamp(offset / gestureDrawerSize, 0, 1)

		content.style.transition = 'none'
		if (dragTransform) {
			const translation = offset * getCloseDirectionSign(direction.value)
			if (isVerticalDrawer(direction.value)) dragTransform.m42 = translation
			else dragTransform.m41 = translation
			content.style.transform = dragTransform.toString()
		}
		else {
			content.style.transform = getTranslateStyles(direction.value, offset)
		}

		if (overlay) {
			overlay.style.transition = 'none'
			overlay.style.opacity = `${getDragOverlayOpacity(offset)}`
		}

		onNestedDrag(closeProgress, startProgress)
	}

	function restoreContentOpacity(animate = false) {
		const content = contentElement.value
		if (!content || previousContentOpacity === undefined) return
		if (animate) {
			const opacityTransition = content.style.transition.replace(/^transform /, 'opacity ')
			content.style.transition += `, ${opacityTransition}`
		}
		content.style.opacity = previousContentOpacity
		previousContentOpacity = undefined
	}

	function clearInlineStyles(options: {
		preserveTransform?: boolean
		preserveOpacity?: boolean
		preservePointerEvents?: boolean
	} = {}) {
		restoreContentOpacity()
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

	function releaseOpenMotion() {
		if (cancelSettle() || isDragging.value) {
			// Commit the currently rendered styles before the leave takes over.
			void contentElement.value?.getBoundingClientRect()
			clearInlineStyles()
		}
		if (pointerId.value !== null) cleanupGestureState()
	}

	function animateBackToOpen() {
		const content = contentElement.value
		if (!content) return
		onNestedRelease(true)
		const restingOffset = getRestingOffset()
		if (currentOffset.value === restingOffset && !dragTransform && previousContentOpacity === undefined) {
			resetInteractiveState()
			return
		}

		const overlay = overlayElement.value

		content.style.transition = getContentTransition()
		content.style.transform = getTranslateStyles(direction.value, restingOffset)
		restoreContentOpacity(true)

		if (overlay) {
			overlay.style.transition = getOverlayTransition()
			overlay.style.opacity = `${getRestingOverlayOpacity()}`
		}

		waitForSettle(content)
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
		restoreContentOpacity(true)

		if (overlay) {
			overlay.style.transition = getOverlayTransition({ close: true })
			overlay.style.opacity = '0'
		}

		onNestedRelease(false)

		waitForDrawerTransition(content, 'transform', () => {
			if (transitionVersion !== closeTransitionVersion) {
				return
			}
			// Keep the drawer non-interactive for the short leave that follows the
			// gesture-owned close. Clearing pointer-events here lets the lingering overlay
			// intercept taps during the leave window, which is exactly the regression we
			// are trying to avoid.
			clearInlineStyles({
				preserveTransform: true,
				preserveOpacity: true,
				preservePointerEvents: true,
			})
			// The gesture already reached the exit target.
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
		const drawerSize = gestureDrawerSize

		if (hasSnapPoints.value) {
			const snapPointsOffset = gestureSnapPointsOffset
			const minOffset = snapPointsOffset[snapPointsOffset.length - 1] ?? 0
			const maxOffset = dismissible.value ? drawerSize : (snapPointsOffset[0] ?? 0)
			const resolvedOffset = clamp(dragBaseOffset.value + closeDistance, minOffset, maxOffset)
			currentOffset.value = resolvedOffset

			const target = resolveSnapPointTarget({
				activeSnapPointIndex: sampledOffset === undefined
					? activeSnapPointIndex.value
					: getClosestSnapPointIndex(sampledOffset, snapPointsOffset),
				closeThreshold: closeThreshold.value,
				currentOffset: resolvedOffset,
				startOffset: sampledOffset,
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
				restoreContentOpacity(true)
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
		cacheGestureMetrics()
		dragBaseOffset.value = hasSnapPoints.value
			? gestureSnapPointsOffset[activeSnapPointIndex.value] ?? 0
			: 0
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
		const content = contentElement.value
		if (pointerId.value !== event.pointerId || !content) return
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

		let startProgress: number | undefined
		if (!isAllowedToDrag.value) {
			const overlay = overlayElement.value
			const contentTransitions = getDrawerTransitions(content)
			const moving = contentTransitions.length > 0
				|| Boolean(overlay && getDrawerTransitions(overlay).length)
			if (!shouldAllowDrag(pointerTarget.value, closeDistance, moving)) {
				return
			}

			if (moving) {
				// Sample at drag activation, after the scroll and intent checks.
				const transform = getDrawerTransform(content)
				const vertical = isVerticalDrawer(direction.value)
				const translation = vertical ? transform?.m42 : transform?.m41
				sampledOffset = (translation ?? 0) * getCloseDirectionSign(direction.value)
				dragBaseOffset.value = sampledOffset
				startProgress = clamp(sampledOffset / gestureDrawerSize, 0, 1)
				if (transform) {
					const remainingTransform = DOMMatrix.fromMatrix(transform)
					if (vertical) remainingTransform.m42 = 0
					else remainingTransform.m41 = 0
					if (!remainingTransform.isIdentity) dragTransform = remainingTransform
				}
				if (overlay) {
					dragOverlayStartOpacity = Number(getComputedStyle(overlay).opacity)
				}
				if (contentTransitions.some(transition => 'transitionProperty' in transition && transition.transitionProperty === 'opacity')) {
					previousContentOpacity = content.style.opacity
					content.style.opacity = getComputedStyle(content).opacity
				}
			}
			cancelSettle()

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
			const snapPointsOffset = gestureSnapPointsOffset
			const snapPointBaseSize = gestureDrawerSize
			const minOffset = snapPointsOffset[snapPointsOffset.length - 1] ?? 0
			const maxOffset = dismissible.value ? snapPointBaseSize : (snapPointsOffset[0] ?? dragBaseOffset.value)
			// An entering drawer can start beyond the usual snap limits.
			const offset = clamp(
				dragBaseOffset.value + closeDistance,
				Math.min(minOffset, dragBaseOffset.value),
				Math.max(maxOffset, dragBaseOffset.value),
			)
			currentOffset.value = offset
			setDraggingStyles(offset, startProgress)
			emitDrag(event, Math.min(Math.max(offset, 0) / snapPointBaseSize, 1))
			return
		}

		const drawerSize = gestureDrawerSize
		// Side drawers stay anchored at their open edge; only vertical sheets overdrag.
		const distance = dragBaseOffset.value + closeDistance
		const offset = !isVerticalDrawer(direction.value)
			? Math.max(distance, 0)
			: distance >= 0
				? distance
				: -Math.max(dampenValue(-distance), 0)
		currentOffset.value = offset
		setDraggingStyles(offset, startProgress)
		emitDrag(event, Math.min(Math.max(offset, 0) / drawerSize, 1))
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
		cancelSettle()
		clearInlineStyles()
		cleanupGestureState()
	})

	return {
		handlePointerDown,
		handlePointerMove,
		handlePointerUp,
		handlePointerCancel,
		handleLostPointerCapture,
		releaseOpenMotion,
	}
}

function clamp(value: number, min: number, max: number) {
	return Math.min(Math.max(value, min), max)
}
