<script setup lang="ts">
import DrawerRoot from './DrawerRoot.vue'

defineOptions({
	name: 'DrawerNested',
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
