<script setup lang="ts">
import { computed, onBeforeUnmount, useAttrs, watch } from 'vue'
import { useDrawerRootContext } from '../utils/drawerContext'

defineOptions({ inheritAttrs: false })

const attrs = useAttrs()
const root = useDrawerRootContext()
const descriptionId = computed(() => getAttributeString(attrs.id) ?? root.defaultDescriptionId)

function getAttributeString(value: unknown) {
	if (value === undefined || value === null || value === false) return undefined
	return String(value)
}

watch(descriptionId, (id, previousId) => {
	if (previousId) {
		root.unregisterDescriptionId(previousId)
	}
	root.registerDescriptionId(id)
}, { immediate: true })

onBeforeUnmount(() => {
	root.unregisterDescriptionId(descriptionId.value)
})
</script>

<template>
	<p
		v-bind="attrs"
		:id="descriptionId"
	>
		<slot />
	</p>
</template>
