<script setup lang="ts">
import { ref, useAttrs } from 'vue'
import { useDrawerPresence } from '../composables/useDrawerPresence'
import { useDrawerRootContext } from '../utils/drawerContext'
import { isOutsidePressOwnedByNestedLayer } from '../utils/drawerDom'
import { suppressNextClickAfterPointerDismiss } from '../utils/drawerPointer'

defineOptions({
	inheritAttrs: false,
})

const attrs = useAttrs()
const root = useDrawerRootContext()

const overlayRef = ref<HTMLElement | null>(null)
const { present, motionClasses, closeAnimation } = useDrawerPresence(root, overlayRef, 'overlay')

function assignOverlayRef(el: unknown) {
	const element = el instanceof HTMLElement ? el : null
	overlayRef.value = element
	root.registerOverlayElement(element)
}

function handleOverlayPointerDown(event: PointerEvent) {
	if (!root.open.value || event.target !== event.currentTarget) return
	if (isOutsidePressOwnedByNestedLayer()) return
	root.handleDismissAttempt(event)
	if (event.defaultPrevented || !root.modal.value || !root.dismissible.value) return
	event.stopPropagation()
	event.preventDefault()
	suppressNextClickAfterPointerDismiss()
	root.requestOpenChange(false)
}
</script>

<template>
	<div
		v-if="present"
		:ref="assignOverlayRef"
		v-bind="attrs"
		data-drawer-overlay=""
		:data-modal="root.modal.value ? 'true' : 'false'"
		:data-snap-points="root.open.value && root.hasSnapPoints.value ? 'true' : 'false'"
		:data-snap-points-overlay="root.open.value && root.hasSnapPoints.value && root.shouldFadeOverlay.value ? 'true' : 'false'"
		:data-state="root.open.value ? 'open' : 'closed'"
		:data-close-animation="closeAnimation"
		:data-dragging="root.isDragging.value ? 'true' : 'false'"
		class="drawer-overlay"
		:class="[motionClasses, { 'drawer-overlay--non-modal': !root.modal.value, 'drawer-overlay--dragging': root.isDragging.value }]"
		@pointerdown="handleOverlayPointerDown"
	/>
</template>
