<script setup lang="ts">
import { computed, useAttrs } from 'vue'
import { useDrawerRootContext } from '../utils/drawerContext'
import { suppressNextClickAfterPointerDismiss } from '../utils/drawerPointer'

defineOptions({
	inheritAttrs: false,
})

const attrs = useAttrs()
const root = useDrawerRootContext()

const shouldShow = computed(() => root.open.value || root.gestureClosing.value)
const shouldUseInstantLeave = computed(() => root.skipCloseAnimation.value)
const closeAnimation = computed(() => root.closeAnimationOverride.value ?? root.closeAnimation.value)
const leaveActiveClass = computed(() => {
	const classes = ['drawer-overlay-leave-active', `drawer-overlay-leave-active--${closeAnimation.value}`]
	if (shouldUseInstantLeave.value) {
		classes.push('drawer-overlay-leave-active--instant')
	}
	return classes.join(' ')
})

function assignOverlayRef(el: unknown) {
	if (!el) {
		root.registerOverlayElement(null)
		return
	}
	root.registerOverlayElement(el instanceof HTMLElement ? el : null)
}

function handleOverlayPointerDown(event: PointerEvent) {
	if (event.target !== event.currentTarget) return
	root.handleDismissAttempt(event)
	if (event.defaultPrevented || !root.modal.value || !root.dismissible.value) return
	event.stopPropagation()
	event.preventDefault()
	suppressNextClickAfterPointerDismiss()
	root.requestOpenChange(false)
}
</script>

<template>
	<Transition
		:appear="root.shouldAnimateInitialOpen.value"
		enter-active-class="drawer-overlay-enter-active"
		enter-from-class="drawer-overlay-enter-from"
		enter-to-class="drawer-overlay-enter-to"
		:leave-active-class="leaveActiveClass"
		leave-from-class="drawer-overlay-leave-from"
		leave-to-class="drawer-overlay-leave-to"
	>
		<div
			v-if="shouldShow"
			:ref="assignOverlayRef"
			v-bind="attrs"
			data-drawer-overlay=""
			:data-modal="root.modal.value ? 'true' : 'false'"
			:data-snap-points="root.open.value && root.hasSnapPoints.value ? 'true' : 'false'"
			:data-snap-points-overlay="root.open.value && root.hasSnapPoints.value && root.shouldFadeOverlay.value ? 'true' : 'false'"
			:data-state="root.open.value ? 'open' : 'closed'"
			:data-close-animation="closeAnimation"
			:class="['drawer-overlay', { 'drawer-overlay--non-modal': !root.modal.value }]"
			@pointerdown="handleOverlayPointerDown"
		/>
	</Transition>
</template>
