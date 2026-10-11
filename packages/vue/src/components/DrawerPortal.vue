<script setup lang="ts">
import { computed } from 'vue'
import type { PropType } from 'vue'
import { useOptionalDrawerRootContext } from '../utils/drawerContext'
import type { DrawerPortalTarget } from '../utils/drawerTypes'

const props = defineProps({
	to: {
		type: [String, Object] as PropType<DrawerPortalTarget>,
		default: undefined,
	},
	disabled: {
		type: Boolean,
		default: false,
	},
})

const root = useOptionalDrawerRootContext()
const portalTarget = computed(() => props.to ?? root?.container.value ?? 'body')
</script>

<template>
	<Teleport :to="portalTarget" :disabled="props.disabled">
		<slot />
	</Teleport>
</template>
