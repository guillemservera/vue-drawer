<script setup lang="ts">
import { onBeforeUnmount } from 'vue'
import type { DrawerHandleProps } from '../utils/drawerTypes'
import { useOptionalDrawerRootContext } from '../utils/drawerContext'
import { useOptionalDrawerGestureContext } from '../utils/drawerGestureContext'

const props = withDefaults(defineProps<DrawerHandleProps>(), {
	preventCycle: false,
})

const root = useOptionalDrawerRootContext()
const gesture = useOptionalDrawerGestureContext()
const LONG_HANDLE_PRESS_TIMEOUT = 250
const DOUBLE_TAP_TIMEOUT = 120
let longPressTimer: number | null = null
let cycleTimer: number | null = null
let pointerStart: { x: number, y: number } | null = null
let shouldCancelInteraction = false

function shouldOwnGesture() {
	return Boolean(root?.handleOnly.value && gesture)
}

function handlePointerDown(event: PointerEvent) {
	pointerStart = { x: event.pageX, y: event.pageY }
	startInteractionCancelTimer()
	if (!shouldOwnGesture()) return
	event.stopPropagation()
	gesture?.handlePointerDown(event)
}

function handlePointerMove(event: PointerEvent) {
	if (pointerStart) {
		const deltaX = event.pageX - pointerStart.x
		const deltaY = event.pageY - pointerStart.y
		if (Math.abs(deltaX) > 4 || Math.abs(deltaY) > 4) {
			shouldCancelInteraction = true
		}
	}
	if (!shouldOwnGesture()) return
	event.stopPropagation()
	gesture?.handlePointerMove(event)
}

function handlePointerUp(event: PointerEvent) {
	clearLongPressTimer()
	pointerStart = null
	if (!shouldOwnGesture()) return
	event.stopPropagation()
	gesture?.handlePointerUp(event)
}

function handlePointerCancel(event: PointerEvent) {
	cancelHandleInteraction()
	if (!shouldOwnGesture()) return
	event.stopPropagation()
	gesture?.handlePointerCancel(event)
}

function handleLostPointerCapture(event: PointerEvent) {
	cancelHandleInteraction()
	if (!shouldOwnGesture()) return
	event.stopPropagation()
	gesture?.handleLostPointerCapture(event)
}

function startInteractionCancelTimer() {
	clearLongPressTimer()
	longPressTimer = window.setTimeout(() => {
		shouldCancelInteraction = true
	}, LONG_HANDLE_PRESS_TIMEOUT)
}

function clearLongPressTimer() {
	if (longPressTimer === null) return
	window.clearTimeout(longPressTimer)
	longPressTimer = null
}

function clearCycleTimer() {
	if (cycleTimer === null) return false
	window.clearTimeout(cycleTimer)
	cycleTimer = null
	return true
}

function cancelHandleInteraction() {
	clearLongPressTimer()
	clearCycleTimer()
	pointerStart = null
	shouldCancelInteraction = false
}

function handleClick() {
	clearLongPressTimer()
	if (!root?.open.value || props.preventCycle || root.isDragging.value || shouldCancelInteraction) {
		cancelHandleInteraction()
		return
	}

	if (clearCycleTimer()) {
		cancelHandleInteraction()
		return
	}

	cycleTimer = window.setTimeout(() => {
		cycleTimer = null
		cycleSnapPoints()
	}, DOUBLE_TAP_TIMEOUT)
}

function cycleSnapPoints() {
	if (!root || props.preventCycle || root.isDragging.value || shouldCancelInteraction) {
		cancelHandleInteraction()
		return
	}

	cancelHandleInteraction()

	if (!root.snapPoints.value?.length) return

	const lastIndex = root.snapPoints.value.length - 1
	const activeIndex = root.activeSnapPointIndex.value
	if (activeIndex < 0) return

	if (activeIndex >= lastIndex) {
		if (root.dismissible.value) {
			root.requestOpenChange(false)
		}
		return
	}

	root.animateToSnapPoint(activeIndex + 1)
}

onBeforeUnmount(() => {
	cancelHandleInteraction()
})
</script>

<template>
	<div
		aria-hidden="true"
		data-drawer-handle=""
		data-vaul-handle=""
		:data-drawer-visible="root?.open.value ? 'true' : 'false'"
		:data-vaul-drawer-visible="root?.open.value ? 'true' : 'false'"
		:class="['drawer-handle', $props.class]"
		@click="handleClick"
		@pointerdown="handlePointerDown"
		@pointermove="handlePointerMove"
		@pointerup="handlePointerUp"
		@pointercancel="handlePointerCancel"
		@lostpointercapture="handleLostPointerCapture"
	>
		<span data-drawer-handle-hitarea="" data-vaul-handle-hitarea="" aria-hidden="true" />
	</div>
</template>
