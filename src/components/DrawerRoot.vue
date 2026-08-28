<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, toRef, watch } from 'vue'
import {
	DRAWER_DEFAULT_CLOSE_THRESHOLD,
	DRAWER_DEFAULT_CLOSE_TRANSITION_DURATION_MS,
	DRAWER_DEFAULT_OVERLAY_CLOSE_TRANSITION_DURATION_MS,
	DRAWER_DEFAULT_OVERLAY_TRANSITION_DURATION_MS,
	DRAWER_DEFAULT_SCROLL_LOCK_TIMEOUT,
	DRAWER_DEFAULT_TRANSITION_DURATION_MS,
	DRAWER_EASE,
	getNestedParentTransform,
	getTranslateStyles,
} from '../utils/drawerConstants'
import { provideDrawerRootContext, useOptionalDrawerRootContext } from '../utils/drawerContext'
import { restoreBodyPointerEvents, scheduleBodyPointerEventsRestore, waitForDrawerTransition } from '../utils/drawerDom'
import { getActiveSnapPointIndex, getOverlayOpacityForOffset, getSnapPointOffsets } from '../utils/drawerSnapPoints'
import type { DrawerAnimation, DrawerRootEmits, DrawerRootProps, DrawerSnapPoint } from '../utils/drawerTypes'
import { useDrawerInputReposition } from '../composables/useDrawerInputReposition'
import { useDrawerScrollLock } from '../composables/useDrawerScrollLock'

let nextDrawerId = 1

function createDrawerId(direction: string, nested: boolean) {
	const label = nested ? `${direction}-nested` : direction
	const id = nextDrawerId
	nextDrawerId += 1
	return `${label}#${id}`
}

const props = withDefaults(defineProps<DrawerRootProps>(), {
	open: undefined,
	defaultOpen: false,
	modal: true,
	dismissible: true,
	instantClose: false,
	autoFocus: false,
	handleOnly: false,
	container: null,
	repositionInputs: true,
	fixed: false,
	preventScroll: true,
	noBodyStyles: false,
	animation: 'slide',
	closeAnimation: 'slide',
	direction: 'bottom',
	closeThreshold: DRAWER_DEFAULT_CLOSE_THRESHOLD,
	scrollLockTimeout: DRAWER_DEFAULT_SCROLL_LOCK_TIMEOUT,
	nested: false,
	preventScrollRestoration: false,
	snapToSequentialPoint: false,
	snapPoints: undefined,
	activeSnapPoint: undefined,
	defaultSnapPoint: null,
	fadeFromIndex: undefined,
})

const emit = defineEmits<DrawerRootEmits>()

const parentContext = useOptionalDrawerRootContext()
const uncontrolledOpen = ref(props.defaultOpen)
const uncontrolledActiveSnapPoint = ref<DrawerSnapPoint | null>(resolveInitialSnapPoint())
const hasBeenOpened = ref(props.defaultOpen)
const openedAt = ref<number | null>(props.defaultOpen ? Date.now() : null)
const contentElement = ref<HTMLElement | null>(null)
const overlayElement = ref<HTMLElement | null>(null)
const isDragging = ref(false)
const gestureClosing = ref(false)
const scrollLockOpen = ref(props.open ?? props.defaultOpen)
const shouldAnimateInitialOpen = ref(!props.defaultOpen)
const skipCloseAnimation = ref(false)
const closeAnimationOverride = ref<DrawerAnimation | null>(null)
const preventCloseAutoFocusOnce = ref(false)
const nestedChildOpen = ref(false)
const drawerId = createDrawerId(props.direction, props.nested)
const domIdBase = `vuedrawer-${drawerId.replace(/[^a-zA-Z0-9_-]+/g, '-').toLowerCase()}`
const defaultContentId = `${domIdBase}-content`
const defaultTitleId = `${domIdBase}-title`
const defaultDescriptionId = `${domIdBase}-description`
const contentId = ref(defaultContentId)
const titleId = ref<string | undefined>()
const descriptionId = ref<string | undefined>()
let skipNextActiveSnapPointAnimation = false
let nestedParentTransitionCleanup: (() => void) | null = null

interface SyncRestingStyleOptions {
	overlayOpacity?: number
	restingOffset?: number
}

const open = computed({
	get: () => props.open ?? uncontrolledOpen.value,
	set: (value: boolean) => {
		// Auto-detect instant close before updating the value so Vue's
		// <Transition> picks up skipCloseAnimation in the same render cycle
		if (!value) {
			maybeEnableSkipCloseAnimation()
		}
		if (props.open === undefined) {
			uncontrolledOpen.value = value
		}
		emit('update:open', value)
	},
})

const hasSnapPoints = computed(() => (props.snapPoints?.length ?? 0) > 0)

const modelActiveSnapPoint = computed(() => props.activeSnapPoint ?? uncontrolledActiveSnapPoint.value)
const activeSnapPoint = computed<DrawerSnapPoint | null>(() => {
	if (!hasSnapPoints.value) return null

	const candidate = modelActiveSnapPoint.value
	if (candidate !== null && props.snapPoints?.some(snapPoint => snapPoint === candidate)) {
		return candidate
	}

	return props.snapPoints?.[0] ?? null
})
const activeSnapPointIndex = computed(() => getActiveSnapPointIndex(props.snapPoints, activeSnapPoint.value))
const fadeFromIndex = computed(() => {
	if (!hasSnapPoints.value) return undefined
	const lastIndex = props.snapPoints!.length - 1
	if (props.fadeFromIndex === undefined) return lastIndex
	return clamp(props.fadeFromIndex, 0, lastIndex)
})
const shouldFadeOverlay = computed(() => {
	if (!hasSnapPoints.value) return true
	const fadeIndex = fadeFromIndex.value
	return fadeIndex !== undefined && activeSnapPointIndex.value === fadeIndex
})

function maybeEnableSkipCloseAnimation() {
	if (props.instantClose) {
		skipCloseAnimation.value = true
		return true
	}

	if (!contentElement.value) return false

	const durationMs = Math.min(getTransitionDuration(), getTransitionDuration({ close: true }))

	if (Number.isNaN(durationMs) || durationMs > 10) {
		return false
	}

	skipCloseAnimation.value = true
	return true
}

function resolveInitialSnapPoint(): DrawerSnapPoint | null {
	const snapPoints = props.snapPoints
	if (!snapPoints?.length) return null

	const firstSnapPoint = snapPoints[0]
	if (firstSnapPoint === undefined) return null

	const candidate = props.defaultSnapPoint ?? firstSnapPoint
	if (snapPoints.some(snapPoint => snapPoint === candidate)) {
		return candidate
	}

	return firstSnapPoint
}

function setActiveSnapPointValue(value: DrawerSnapPoint | null, shouldEmit = true) {
	if (props.activeSnapPoint === undefined) {
		uncontrolledActiveSnapPoint.value = value
	}

	if (shouldEmit) {
		emit('update:activeSnapPoint', value)
	}
}

function registerContentId(id: string) {
	contentId.value = id
}

function unregisterContentId(id: string) {
	if (contentId.value === id) {
		contentId.value = defaultContentId
	}
}

function registerTitleId(id: string) {
	titleId.value = id
}

function unregisterTitleId(id: string) {
	if (titleId.value === id) {
		titleId.value = undefined
	}
}

function registerDescriptionId(id: string) {
	descriptionId.value = id
}

function unregisterDescriptionId(id: string) {
	if (descriptionId.value === id) {
		descriptionId.value = undefined
	}
}

function emitDrag(pointerEvent: PointerEvent, percentageDragged: number) {
	emit('drag', pointerEvent, percentageDragged)
}

function emitRelease(pointerEvent: PointerEvent, isOpen: boolean) {
	emit('release', pointerEvent, isOpen)
}

function requestOpenChange(value: boolean, options: { animation?: DrawerAnimation } = {}) {
	if (!value) {
		closeAnimationOverride.value = options.animation ?? null
		// Auto-detect instant close: if the consumer set a very short transition
		// duration via --drawer-duration-ms, skip the close animation so Vue's
		// <Transition> uses the --instant class (1ms) which guarantees
		// transitionend fires without a visible animation frame.
		maybeEnableSkipCloseAnimation()
	}

	open.value = value
	if (value) {
		closeAnimationOverride.value = null
		skipCloseAnimation.value = false
		gestureClosing.value = false
	}
}

function getVisibleDrawerSize() {
	const content = contentElement.value
	if (!content) return 1

	const rect = content.getBoundingClientRect()
	const rawSize = props.direction === 'top' || props.direction === 'bottom'
		? Math.min(rect.height || content.offsetHeight || 0, window.innerHeight)
		: Math.min(rect.width || content.offsetWidth || 0, window.innerWidth)

	return Math.max(rawSize, 1)
}

function getSnapPointContainerElement() {
	if (typeof document === 'undefined') return null
	const container = props.container
	if (container instanceof HTMLElement) {
		return isDocumentViewportElement(container) ? null : container
	}
	if (typeof container !== 'string') return null

	const element = document.querySelector(container)
	if (!(element instanceof HTMLElement)) return null
	return isDocumentViewportElement(element) ? null : element
}

function isDocumentViewportElement(element: HTMLElement) {
	return element === document.body || element === document.documentElement
}

function getSnapPointBaseSize() {
	if (typeof window === 'undefined') return getVisibleDrawerSize()

	const container = getSnapPointContainerElement()
	if (container) {
		const rect = container.getBoundingClientRect()
		const containerSize = props.direction === 'top' || props.direction === 'bottom'
			? rect.height
			: rect.width

		if (Number.isFinite(containerSize) && containerSize > 0) {
			return containerSize
		}
	}

	const viewportSize = props.direction === 'top' || props.direction === 'bottom'
		? window.innerHeight
		: window.innerWidth

	return Math.max(viewportSize || getVisibleDrawerSize(), 1)
}

function getSnapPointsOffset() {
	if (!props.snapPoints?.length) return []
	return getSnapPointOffsets(getSnapPointBaseSize(), props.snapPoints)
}

function getRestingOffset() {
	if (!hasSnapPoints.value) return 0
	return getSnapPointsOffset()[activeSnapPointIndex.value] ?? 0
}

function getRestingOverlayOpacity() {
	if (!hasSnapPoints.value) return 1
	return getOverlayOpacityForOffset(getRestingOffset(), getSnapPointsOffset(), fadeFromIndex.value)
}

function syncRestingStyles(options: SyncRestingStyleOptions = {}) {
	const content = contentElement.value
	const overlay = overlayElement.value
	const restingOffset = options.restingOffset ?? getRestingOffset()
	const overlayOpacity = options.overlayOpacity ?? getRestingOverlayOpacity()

	if (content) {
		content.style.setProperty('--drawer-rest-offset', `${restingOffset}px`)
	}

	if (overlay) {
		overlay.style.setProperty('--drawer-rest-overlay-opacity', `${overlayOpacity}`)
	}
}

function registerContentElement(element: HTMLElement | null) {
	contentElement.value = element
	if (!element) return

	switch (props.direction) {
		case 'bottom':
			element.style.transformOrigin = 'top center'
			break
		case 'top':
			element.style.transformOrigin = 'bottom center'
			break
		case 'left':
			element.style.transformOrigin = 'left center'
			break
		case 'right':
			element.style.transformOrigin = 'right center'
			break
	}

	syncRestingStyles()
	applyNestedParentTransformIfNeeded({ instant: true })
}

function registerOverlayElement(element: HTMLElement | null) {
	overlayElement.value = element
	syncRestingStyles()
}

function getTransitionDuration(
	options: { instant?: boolean, close?: boolean } = {},
	element = getTransitionElement(),
	defaultDurationMs = DRAWER_DEFAULT_TRANSITION_DURATION_MS,
	defaultCloseDurationMs = DRAWER_DEFAULT_CLOSE_TRANSITION_DURATION_MS,
) {
	if (options.instant || props.instantClose) return 1
	if (!element) return options.close ? defaultCloseDurationMs : defaultDurationMs

	const styles = window.getComputedStyle(element)
	const baseDuration = parseCssNumber(styles.getPropertyValue('--drawer-duration-ms'))
	const baseDurationMs = baseDuration ?? defaultDurationMs

	if (!options.close) return baseDurationMs

	const closeDuration = parseCssNumber(styles.getPropertyValue('--drawer-close-duration-ms'))
	if (baseDurationMs <= 10) return baseDurationMs
	return closeDuration ?? defaultCloseDurationMs
}

function parseCssNumber(value: string) {
	const duration = Number.parseFloat(value.trim())
	return Number.isFinite(duration) && duration > 0 ? duration : null
}

function getTransitionElement() {
	return contentElement.value ?? overlayElement.value
}

function getTransitionEase(options: { close?: boolean } = {}, element = getTransitionElement()) {
	if (!element) return DRAWER_EASE
	const styles = window.getComputedStyle(element)
	if (options.close) {
		const closeEase = styles.getPropertyValue('--drawer-close-ease').trim()
		if (closeEase) return closeEase
	}
	return styles.getPropertyValue('--drawer-ease').trim() || DRAWER_EASE
}

function getContentTransition(options: { instant?: boolean, close?: boolean } = {}) {
	const element = contentElement.value ?? overlayElement.value
	return `transform ${getTransitionDuration(options, element)}ms ${getTransitionEase(options, element)}`
}

function getOverlayTransition(options: { instant?: boolean, close?: boolean } = {}) {
	const element = overlayElement.value ?? contentElement.value
	return `opacity ${getTransitionDuration(
		options,
		element,
		DRAWER_DEFAULT_OVERLAY_TRANSITION_DURATION_MS,
		DRAWER_DEFAULT_OVERLAY_CLOSE_TRANSITION_DURATION_MS,
	)}ms ${getTransitionEase(options, element)}`
}

function getRestingTransform() {
	return getTranslateStyles(props.direction, getRestingOffset())
}

function getNestedCompositeTransform(closeProgress = 0) {
	const restingOffset = getRestingOffset()
	const nestedTransform = getNestedParentTransform(props.direction, closeProgress)

	if (restingOffset <= 0) return nestedTransform
	return `${getTranslateStyles(props.direction, restingOffset)} ${nestedTransform}`
}

function cancelNestedParentTransition() {
	nestedParentTransitionCleanup?.()
	nestedParentTransitionCleanup = null
}

function clearNestedParentTransform() {
	cancelNestedParentTransition()
	nestedChildOpen.value = false

	const content = contentElement.value
	if (!content) return

	content.style.transition = ''
	content.style.transform = ''
}

function applyNestedParentTransformIfNeeded(options: { instant?: boolean } = {}) {
	const content = contentElement.value
	if (!content || !nestedChildOpen.value || !open.value) return

	content.style.transition = getContentTransition({ instant: options.instant })
	content.style.transform = getNestedCompositeTransform()
}

function setNestedChildOpen(value: boolean, options: { instant?: boolean } = {}) {
	if (nestedChildOpen.value === value) return
	nestedChildOpen.value = value

	const content = contentElement.value
	if (!content) return

	cancelNestedParentTransition()

	if (!open.value) {
		content.style.transition = ''
		content.style.transform = ''
		return
	}

	content.style.transition = getContentTransition({
		close: !value,
		instant: options.instant,
	})
	content.style.transform = value ? getNestedCompositeTransform() : getRestingTransform()

	if (value) return

	const cleanup = waitForDrawerTransition(content, 'transform', () => {
		if (nestedParentTransitionCleanup === cleanup) {
			nestedParentTransitionCleanup = null
		}
		if (nestedChildOpen.value) return
		content.style.transition = ''
		content.style.transform = ''
		syncRestingStyles()
	})
	nestedParentTransitionCleanup = cleanup
}

function onNestedDrag(closeProgress: number) {
	const content = contentElement.value
	if (!content || !open.value) return

	cancelNestedParentTransition()
	content.style.transition = 'none'
	content.style.transform = getNestedCompositeTransform(closeProgress)
}

function onNestedRelease(isStillOpen: boolean) {
	const content = contentElement.value
	if (!content) return

	cancelNestedParentTransition()

	if (!isStillOpen) {
		nestedChildOpen.value = false
	}

	content.style.transition = getContentTransition({ close: !isStillOpen })
	content.style.transform = isStillOpen
		? getNestedCompositeTransform(0)
		: getRestingTransform()

	if (isStillOpen) return

	const cleanup = waitForDrawerTransition(content, 'transform', () => {
		if (nestedParentTransitionCleanup === cleanup) {
			nestedParentTransitionCleanup = null
		}
		if (nestedChildOpen.value) return
		content.style.transition = ''
		content.style.transform = ''
		syncRestingStyles()
	})
	nestedParentTransitionCleanup = cleanup
}

function animateToSnapPoint(index: number, options: { updateActiveSnapPoint?: boolean } = {}) {
	const snapPointsOffset = getSnapPointsOffset()
	const snapPoint = props.snapPoints?.[index] ?? null
	const targetOffset = snapPointsOffset[index]
	const content = contentElement.value
	const overlay = overlayElement.value
	const updateActiveSnapPoint = options.updateActiveSnapPoint ?? true

	if (targetOffset === undefined) return

	const targetOverlayOpacity = getOverlayOpacityForOffset(targetOffset, snapPointsOffset, fadeFromIndex.value)

	if (updateActiveSnapPoint) {
		skipNextActiveSnapPointAnimation = snapPoint !== activeSnapPoint.value
		setActiveSnapPointValue(snapPoint)
	}

	syncRestingStyles({
		overlayOpacity: targetOverlayOpacity,
		restingOffset: targetOffset,
	})

	if (!content) return

	content.style.transition = getContentTransition()
	content.style.transform = getTranslateStyles(props.direction, targetOffset)

	if (overlay) {
		overlay.style.transition = getOverlayTransition()
		overlay.style.opacity = `${targetOverlayOpacity}`
	}

	waitForDrawerTransition(content, 'transform', () => {
		if (!open.value) return
		resetInteractiveState()
	})
}

function handleDismissAttempt(event: Event) {
	if (!props.dismissible) {
		event.preventDefault()
	}
}

function handleContentError(error: unknown, instance: unknown, info: string) {
	emit('content:error', error, instance, info)
	setGestureClosing(false)
	requestOpenChange(false)
}

function resetInteractiveState() {
	const content = contentElement.value
	const overlay = overlayElement.value

	if (content) {
		content.style.transition = ''
		content.style.transform = ''
	}

	if (overlay) {
		overlay.style.transition = ''
		overlay.style.opacity = ''
	}

	isDragging.value = false
	gestureClosing.value = false
	syncRestingStyles()
	applyNestedParentTransformIfNeeded({ instant: true })

	if (open.value) {
		scheduleBodyPointerEventsRestore()
	}
}

function setGestureClosing(value: boolean) {
	gestureClosing.value = value
	if (!value) return
	isDragging.value = false
}

function setSkipCloseAnimation(value: boolean) {
	skipCloseAnimation.value = value
}

function forceInstantCloseFromParent() {
	setSkipCloseAnimation(true)
	setGestureClosing(false)

	if (contentElement.value) {
		contentElement.value.style.transition = getContentTransition({ instant: true })
	}
	if (overlayElement.value) {
		overlayElement.value.style.transition = getOverlayTransition({ instant: true })
	}

	requestOpenChange(false)
}

function handleAfterOpen() {
	if (!open.value) return
	gestureClosing.value = false
	skipCloseAnimation.value = false
	syncRestingStyles()
	scheduleBodyPointerEventsRestore()
	emit('after-open')
	emit('animation-end', true)
}

function handleAfterClose() {
	if (open.value) return
	resetInteractiveState()
	restoreBodyPointerEvents()
	skipCloseAnimation.value = false
	closeAnimationOverride.value = null
	gestureClosing.value = false
	if (preventCloseAutoFocusOnce.value) {
		preventCloseAutoFocusOnce.value = false
	}
	if (props.nested) {
		parentContext?.setNestedChildOpen(false, { instant: true })
	}
	scrollLockOpen.value = false
	emit('after-close')
	emit('animation-end', false)
}

provideDrawerRootContext({
	drawerId,
	open,
	hasBeenOpened,
	modal: toRef(props, 'modal'),
	dismissible: toRef(props, 'dismissible'),
	autoFocus: toRef(props, 'autoFocus'),
	handleOnly: toRef(props, 'handleOnly'),
	container: toRef(props, 'container'),
	animation: toRef(props, 'animation'),
	closeAnimation: toRef(props, 'closeAnimation'),
	closeAnimationOverride,
	direction: toRef(props, 'direction'),
	closeThreshold: toRef(props, 'closeThreshold'),
	scrollLockTimeout: toRef(props, 'scrollLockTimeout'),
	nested: toRef(props, 'nested'),
	snapToSequentialPoint: toRef(props, 'snapToSequentialPoint'),
	snapPoints: toRef(props, 'snapPoints'),
	hasSnapPoints,
	shouldFadeOverlay,
	activeSnapPoint,
	activeSnapPointIndex,
	fadeFromIndex,
	defaultContentId,
	defaultTitleId,
	defaultDescriptionId,
	contentId,
	titleId,
	descriptionId,
	openedAt,
	contentElement,
	overlayElement,
	isDragging,
	gestureClosing,
	skipCloseAnimation,
	shouldAnimateInitialOpen,
	preventCloseAutoFocusOnce,
	parentContext,
	requestOpenChange,
	registerContentId,
	unregisterContentId,
	registerTitleId,
	unregisterTitleId,
	registerDescriptionId,
	unregisterDescriptionId,
	registerContentElement,
	registerOverlayElement,
	emitDrag,
	emitRelease,
	getVisibleDrawerSize,
	getSnapPointBaseSize,
	getSnapPointsOffset,
	getRestingOffset,
	getRestingOverlayOpacity,
	syncRestingStyles,
	setActiveSnapPointValue,
	animateToSnapPoint,
	handleAfterOpen,
	handleAfterClose,
	handleDismissAttempt,
	handleContentError,
	setGestureClosing,
	setSkipCloseAnimation,
	setNestedChildOpen,
	onNestedDrag,
	onNestedRelease,
	resetInteractiveState,
	getContentTransition,
	getOverlayTransition,
})

useDrawerScrollLock({
	open: scrollLockOpen,
	modal: toRef(props, 'modal'),
	nested: toRef(props, 'nested'),
	hasBeenOpened,
	preventScroll: toRef(props, 'preventScroll'),
	preventScrollRestoration: toRef(props, 'preventScrollRestoration'),
	noBodyStyles: toRef(props, 'noBodyStyles'),
	contentElement,
})

useDrawerInputReposition({
	open,
	modal: toRef(props, 'modal'),
	nested: toRef(props, 'nested'),
	direction: toRef(props, 'direction'),
	repositionInputs: toRef(props, 'repositionInputs'),
	fixed: toRef(props, 'fixed'),
	contentElement,
})

watch(() => props.snapPoints, (snapPoints) => {
	if (props.activeSnapPoint !== undefined) return

	if (!snapPoints?.length) {
		uncontrolledActiveSnapPoint.value = null
		return
	}

	if (uncontrolledActiveSnapPoint.value === null) {
		uncontrolledActiveSnapPoint.value = resolveInitialSnapPoint()
		return
	}

	if (snapPoints.some(snapPoint => snapPoint === uncontrolledActiveSnapPoint.value)) return
	uncontrolledActiveSnapPoint.value = resolveInitialSnapPoint()
}, { immediate: true })

watch(open, (value, previousValue) => {
	if (value) {
		scrollLockOpen.value = true
	}
	else if (previousValue === true && (contentElement.value || gestureClosing.value)) {
		// Keep document scroll locked until Vue's leave transition has fully removed
		// the drawer from view. This mirrors Vaul/Radix presence behavior on desktop.
		scrollLockOpen.value = true
	}
	else {
		scrollLockOpen.value = false
	}

	if (previousValue === true && value === false) {
		emit('close')
	}
}, { flush: 'sync', immediate: true })

watch(activeSnapPoint, (value, previousValue) => {
	if (value === previousValue) return

	if (skipNextActiveSnapPointAnimation) {
		skipNextActiveSnapPointAnimation = false
		return
	}

	if (!open.value || !hasSnapPoints.value || isDragging.value || gestureClosing.value) {
		syncRestingStyles()
		return
	}

	animateToSnapPoint(activeSnapPointIndex.value, { updateActiveSnapPoint: false })
})

watch(
	() => parentContext?.open.value,
	(isParentOpen) => {
		if (
			!props.nested
			|| isParentOpen !== false
			|| (!open.value && !contentElement.value && !gestureClosing.value)
		) return

		forceInstantCloseFromParent()
	},
)

watch(
	() => [contentElement.value, overlayElement.value, activeSnapPoint.value, fadeFromIndex.value, props.direction, props.snapPoints] as const,
	() => {
		syncRestingStyles()
	},
	{ flush: 'post', immediate: true },
)

watch(contentElement, (element, _previous, onCleanup) => {
	if (!element || typeof ResizeObserver === 'undefined') return

	const observer = new ResizeObserver(() => {
		syncRestingStyles()
	})

	observer.observe(element)
	onCleanup(() => {
		observer.disconnect()
	})
})

watch(
	() => [props.container, props.direction] as const,
	(_value, _previous, onCleanup) => {
		if (typeof ResizeObserver === 'undefined') return
		const container = getSnapPointContainerElement()
		if (!container) return

		const observer = new ResizeObserver(() => {
			if (hasSnapPoints.value) {
				syncRestingStyles()
			}
		})

		observer.observe(container)
		onCleanup(() => {
			observer.disconnect()
		})
	},
	{ flush: 'post', immediate: true },
)

function handleSnapPointViewportResize() {
	if (hasSnapPoints.value) {
		syncRestingStyles()
	}
}

onMounted(() => {
	if (typeof window === 'undefined') return
	window.addEventListener('resize', handleSnapPointViewportResize)
	window.visualViewport?.addEventListener('resize', handleSnapPointViewportResize)
})

watch(open, (isOpen) => {
	if (isOpen) {
		if (props.nested) {
			parentContext?.setNestedChildOpen(true)
		}

		if (hasSnapPoints.value && props.activeSnapPoint === undefined && uncontrolledActiveSnapPoint.value === null) {
			uncontrolledActiveSnapPoint.value = resolveInitialSnapPoint()
		}

		hasBeenOpened.value = true
		openedAt.value = Date.now()
		skipCloseAnimation.value = false
		gestureClosing.value = false
		syncRestingStyles()
		if (!props.modal) {
			scheduleBodyPointerEventsRestore()
		}
		return
	}

	if (nestedChildOpen.value) {
		clearNestedParentTransform()
	}

	maybeEnableSkipCloseAnimation()

	if (props.nested) {
		parentContext?.setNestedChildOpen(false)
	}

	openedAt.value = null
	restoreBodyPointerEvents()
}, { immediate: true })

onBeforeUnmount(() => {
	if (typeof window !== 'undefined') {
		window.removeEventListener('resize', handleSnapPointViewportResize)
		window.visualViewport?.removeEventListener('resize', handleSnapPointViewportResize)
	}
	if (props.nested) {
		parentContext?.setNestedChildOpen(false, { instant: true })
	}
	resetInteractiveState()
})

function clamp(value: number, min: number, max: number) {
	return Math.min(Math.max(value, min), max)
}
</script>

<template>
	<slot />
</template>
