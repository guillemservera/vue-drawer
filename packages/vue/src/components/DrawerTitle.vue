<script setup lang="ts">
import { computed, onBeforeUnmount, useAttrs, watch } from 'vue'
import { useDrawerRootContext } from '../utils/drawerContext'

defineOptions({ inheritAttrs: false })

const attrs = useAttrs()
const root = useDrawerRootContext()
const titleId = computed(() => getAttributeString(attrs.id) ?? root.defaultTitleId)

function getAttributeString(value: unknown) {
	if (value === undefined || value === null || value === false) return undefined
	return String(value)
}

watch(titleId, (id, previousId) => {
	if (previousId) {
		root.unregisterTitleId(previousId)
	}
	root.registerTitleId(id)
}, { immediate: true })

onBeforeUnmount(() => {
	root.unregisterTitleId(titleId.value)
})
</script>

<template>
	<h2
		v-bind="attrs"
		:id="titleId"
	>
		<slot />
	</h2>
</template>
