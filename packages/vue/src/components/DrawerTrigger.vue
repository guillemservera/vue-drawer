<script setup lang="ts">
import { computed, useAttrs } from 'vue'
import type { PropType } from 'vue'
import { DrawerPrimitive } from '../utils/drawerPrimitive'
import { useDrawerRootContext } from '../utils/drawerContext'
import type { DrawerPrimitiveAs } from '../utils/drawerTypes'

defineOptions({
	inheritAttrs: false,
})

const props = defineProps({
	disabled: {
		type: Boolean,
		default: false,
	},
	as: {
		type: [String, Object, Function] as PropType<DrawerPrimitiveAs>,
		default: 'button',
	},
	asChild: {
		type: Boolean,
		default: false,
	},
})
const attrs = useAttrs()
const root = useDrawerRootContext()
const state = computed(() => root.open.value ? 'open' : 'closed')
const triggerProps = computed(() => {
	const primitiveProps: Record<string, unknown> = {
		'data-drawer-trigger': '',
		'data-state': state.value,
		'aria-haspopup': 'dialog',
		'aria-expanded': root.open.value ? 'true' : 'false',
		'aria-controls': root.contentId.value,
		onClick: handleClick,
	}

	if (props.asChild || props.as === 'button') {
		primitiveProps.type = 'button'
	}

	if (props.disabled) {
		primitiveProps.disabled = true
	}

	return primitiveProps
})

function handleClick(event: MouseEvent) {
	if (props.disabled || event.defaultPrevented) return
	root.requestOpenChange(true)
}
</script>

<template>
	<DrawerPrimitive
		:as="props.as"
		:as-child="props.asChild"
		:element-props="triggerProps"
		v-bind="attrs"
	>
		<slot />
	</DrawerPrimitive>
</template>
