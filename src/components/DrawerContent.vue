<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onErrorCaptured, ref, useAttrs, watch } from 'vue'
import type { ComponentPublicInstance } from 'vue'
import { useDrawerAriaIsolation } from '../composables/useDrawerAriaIsolation'
import { useDrawerDismissableLayer } from '../composables/useDrawerDismissableLayer'
import { useDrawerFocusScope } from '../composables/useDrawerFocusScope'
import { useDrawerGesture } from '../composables/useDrawerGesture'
import { ESCAPE_LAYER_PRIORITIES, useDrawerEscapeLayer } from '../composables/useDrawerEscapeLayer'
import { useDrawerRootContext } from '../utils/drawerContext'
import { provideDrawerGestureContext } from '../utils/drawerGestureContext'
import type { DrawerContentEmits } from '../utils/drawerTypes'

defineOptions({
	inheritAttrs: false,
})

const attrs = useAttrs()
const root = useDrawerRootContext()
const lastKnownPointerEvent = ref<PointerEvent | null>(null)
const emit = defineEmits<DrawerContentEmits>()
let hasWarnedMissingAccessibleName = false

onErrorCaptured((error, instance, info) => {
	emit('error', error, instance, info)
	root.handleContentError(error, instance, info)
	return false
})

const shouldRender = computed(() => root.open.value || root.gestureClosing.value)
const shouldUseInstantLeave = computed(() => root.skipCloseAnimation.value)
const closeAnimation = computed(() => root.closeAnimationOverride.value ?? root.closeAnimation.value)
const contentAnimation = computed(() => root.open.value ? root.animation.value : closeAnimation.value)
const isModalOpen = computed(() => root.open.value && root.modal.value)
const shouldRestoreFocus = computed(() => !root.preventCloseAutoFocusOnce.value)
const resolvedContentId = computed(() => getAttributeString(attrs.id) ?? root.defaultContentId)
const resolvedAriaLabelledBy = computed(() => {
	const explicitLabelledBy = getAttributeString(attrs['aria-labelledby'])
	if (explicitLabelledBy !== undefined) return explicitLabelledBy
	if (attrs['aria-label'] !== undefined) return undefined
	return root.titleId.value
})
const resolvedAriaDescribedBy = computed(() => getAttributeString(attrs['aria-describedby']) ?? root.descriptionId.value)
const hasAccessibleName = computed(() => {
	const ariaLabel = getAttributeString(attrs['aria-label'])?.trim()
	const ariaLabelledBy = resolvedAriaLabelledBy.value?.trim()
	return Boolean(ariaLabel || ariaLabelledBy)
})
const leaveActiveClass = computed(() => {
	const classes = ['drawer-content-leave-active', `drawer-content-leave-active--${closeAnimation.value}`]
	if (shouldUseInstantLeave.value) {
		classes.push('drawer-content-leave-active--instant')
	}
	return classes.join(' ')
})
const leaveToClass = computed(() => `drawer-content-leave-to drawer-content-leave-to--${closeAnimation.value}`)

function getAttributeString(value: unknown) {
	if (value === undefined || value === null || value === false) return undefined
	return String(value)
}

async function warnMissingAccessibleName() {
	if (!import.meta.env.DEV || hasWarnedMissingAccessibleName || !root.open.value) return

	await nextTick()
	await nextTick()

	if (hasWarnedMissingAccessibleName || !root.open.value || hasAccessibleName.value) return
	hasWarnedMissingAccessibleName = true
	console.warn('[vuedrawer] DrawerContent needs an accessible name. Add DrawerTitle, aria-label, or aria-labelledby.')
}

const {
	handlePointerDown,
	handlePointerMove,
	handlePointerUp,
	handlePointerCancel,
	handleLostPointerCapture,
} = useDrawerGesture({
	open: root.open,
	openedAt: root.openedAt,
	direction: root.direction,
	dismissible: root.dismissible,
	closeThreshold: root.closeThreshold,
	scrollLockTimeout: root.scrollLockTimeout,
	snapToSequentialPoint: root.snapToSequentialPoint,
	hasSnapPoints: root.hasSnapPoints,
	activeSnapPointIndex: root.activeSnapPointIndex,
	fadeFromIndex: root.fadeFromIndex,
	contentElement: root.contentElement,
	overlayElement: root.overlayElement,
	isDragging: root.isDragging,
	gestureClosing: root.gestureClosing,
	preventCloseAutoFocusOnce: root.preventCloseAutoFocusOnce,
	requestOpenChange: root.requestOpenChange,
	setSkipCloseAnimation: root.setSkipCloseAnimation,
	setGestureClosing: root.setGestureClosing,
	emitDrag: root.emitDrag,
	emitRelease: root.emitRelease,
	getContentTransition: root.getContentTransition,
	getOverlayTransition: root.getOverlayTransition,
	getVisibleDrawerSize: root.getVisibleDrawerSize,
	getSnapPointBaseSize: root.getSnapPointBaseSize,
	getSnapPointsOffset: root.getSnapPointsOffset,
	getRestingOffset: root.getRestingOffset,
	getRestingOverlayOpacity: root.getRestingOverlayOpacity,
	animateToSnapPoint: root.animateToSnapPoint,
	resetInteractiveState: root.resetInteractiveState,
	onNestedDrag: closeProgress => root.parentContext?.onNestedDrag(closeProgress),
	onNestedRelease: isStillOpen => root.parentContext?.onNestedRelease(isStillOpen),
})
const contentRef = ref<HTMLElement | null>(null)

const focusScope = useDrawerFocusScope({
	contentElement: contentRef,
	enabled: isModalOpen,
	autoFocus: root.autoFocus,
	shouldRestoreFocus,
	onOpenAutoFocus: event => emit('open-auto-focus', event),
	onCloseAutoFocus: event => emit('close-auto-focus', event),
})

useDrawerAriaIsolation({
	contentElement: contentRef,
	enabled: isModalOpen,
})

useDrawerDismissableLayer({
	id: `drawer:${root.drawerId}`,
	element: contentRef,
	enabled: () => root.open.value,
	modal: () => root.modal.value,
	onPointerDownOutside: (event) => {
		emit('pointer-down-outside', event)
		emit('interact-outside', event)

		if (event.defaultPrevented) return

		const originalEvent = event.detail.originalEvent
		const ctrlLeftClick = originalEvent.button === 0 && originalEvent.ctrlKey
		const isRightClick = originalEvent.button === 2 || ctrlLeftClick
		if (root.modal.value && isRightClick) {
			event.preventDefault()
			return
		}

		if (!root.modal.value) return

		root.handleDismissAttempt(event)
		if (event.defaultPrevented) return

		root.preventCloseAutoFocusOnce.value = true
		root.requestOpenChange(false)
	},
	onFocusOutside: (event) => {
		emit('focus-outside', event)
		emit('interact-outside', event)

		if (event.defaultPrevented) return
		if (root.modal.value) {
			event.preventDefault()
			return
		}

		return
	},
})

provideDrawerGestureContext({
	handlePointerDown,
	handlePointerMove,
	handlePointerUp,
	handlePointerCancel,
	handleLostPointerCapture,
})

function resolveHtmlElement(el: Element | ComponentPublicInstance | null): HTMLElement | null {
	if (el instanceof HTMLElement) return el
	const componentEl = el && '$el' in el ? el.$el : null
	return componentEl instanceof HTMLElement ? componentEl : null
}

function assignContentRef(el: Element | ComponentPublicInstance | null) {
	const element = resolveHtmlElement(el)
	contentRef.value = element
	root.registerContentElement(element)
}

function handleAfterEnter() {
	if (!root.open.value) return
	root.handleAfterOpen()
	focusScope.handleAfterOpen()
}

function handleAfterLeave() {
	if (root.open.value) return
	focusScope.handleAfterClose()
	root.preventCloseAutoFocusOnce.value = false
	root.handleAfterClose()
}

function handleKeyDown(event: KeyboardEvent) {
	focusScope.handleKeyDown(event)
}

watch(resolvedContentId, (id, previousId) => {
	if (previousId) {
		root.unregisterContentId(previousId)
	}
	root.registerContentId(id)
}, { immediate: true })

watch([() => root.open.value, hasAccessibleName], () => {
	void warnMissingAccessibleName()
}, { flush: 'post', immediate: true })

onBeforeUnmount(() => {
	root.unregisterContentId(resolvedContentId.value)
})

useDrawerEscapeLayer({
	id: `drawer:${root.drawerId}`,
	label: root.drawerId,
	priority: ESCAPE_LAYER_PRIORITIES.drawer,
	enabled: () => root.open.value,
	onEscape: (event) => {
		emit('escape-key-down', event)
		if (event.defaultPrevented) return true

		root.handleDismissAttempt(event)
		if (!event.defaultPrevented) {
			root.requestOpenChange(false)
		}

		return true
	},
})

function handleTrackedPointerDown(event: PointerEvent) {
	lastKnownPointerEvent.value = event
	if (root.handleOnly.value) return
	handlePointerDown(event)
}

function handleTrackedPointerMove(event: PointerEvent) {
	lastKnownPointerEvent.value = event
	if (root.handleOnly.value) return
	handlePointerMove(event)
}

function handleTrackedPointerUp(event: PointerEvent) {
	lastKnownPointerEvent.value = null
	handlePointerUp(event)
}

function handlePointerOut(event: PointerEvent) {
	const currentTarget = event.currentTarget
	const relatedTarget = event.relatedTarget
	if (currentTarget instanceof HTMLElement && relatedTarget instanceof Node && currentTarget.contains(relatedTarget)) {
		return
	}

	if (!lastKnownPointerEvent.value) return
	const pointerEvent = lastKnownPointerEvent.value
	lastKnownPointerEvent.value = null
	handlePointerUp(pointerEvent)
}

function handleContextMenu() {
	if (!lastKnownPointerEvent.value) return
	const pointerEvent = lastKnownPointerEvent.value
	lastKnownPointerEvent.value = null
	handlePointerUp(pointerEvent)
}

function handleTrackedPointerCancel(event: PointerEvent) {
	lastKnownPointerEvent.value = null
	handlePointerCancel(event)
}

function handleTrackedLostPointerCapture(event: PointerEvent) {
	lastKnownPointerEvent.value = null
	handleLostPointerCapture(event)
}
</script>

<template>
	<Transition
		:appear="root.shouldAnimateInitialOpen.value"
		enter-active-class="drawer-content-enter-active"
		enter-from-class="drawer-content-enter-from"
		enter-to-class="drawer-content-enter-to"
		:leave-active-class="leaveActiveClass"
		leave-from-class="drawer-content-leave-from"
		:leave-to-class="leaveToClass"
		@after-enter="handleAfterEnter"
		@after-leave="handleAfterLeave"
	>
		<div
			v-if="shouldRender"
			:ref="assignContentRef"
			v-bind="attrs"
			:id="resolvedContentId"
			role="dialog"
			:aria-modal="root.modal.value ? 'true' : undefined"
			:aria-labelledby="resolvedAriaLabelledBy"
			:aria-describedby="resolvedAriaDescribedBy"
			tabindex="-1"
			data-drawer-content=""
			:data-snap-points="root.hasSnapPoints.value ? 'true' : 'false'"
			:data-active-snap-point-index="root.hasSnapPoints.value ? String(root.activeSnapPointIndex.value) : undefined"
			:data-modal="root.modal.value ? 'true' : 'false'"
			:data-state="root.open.value ? 'open' : 'closed'"
			:data-direction="root.direction.value"
			:data-animation="contentAnimation"
			:data-open-animation="root.animation.value"
			:data-close-animation="closeAnimation"
			:data-dragging="root.isDragging.value ? 'true' : 'false'"
			class="drawer-content"
			:class="{ 'drawer-content--dragging': root.isDragging.value }"
			@pointerdown="handleTrackedPointerDown"
			@pointermove="handleTrackedPointerMove"
			@pointerup="handleTrackedPointerUp"
			@pointerout="handlePointerOut"
			@pointercancel="handleTrackedPointerCancel"
			@lostpointercapture="handleTrackedLostPointerCapture"
			@contextmenu="handleContextMenu"
			@keydown="handleKeyDown"
		>
			<slot />
		</div>
	</Transition>
</template>
