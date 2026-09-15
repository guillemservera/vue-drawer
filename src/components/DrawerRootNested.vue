<script setup lang="ts">
import DrawerRoot from './DrawerRoot.vue'

defineOptions({
	inheritAttrs: false,
})
</script>

<template>
	<DrawerRoot
		v-bind="$attrs"
		nested
	>
		<slot />
	</DrawerRoot>
</template>
