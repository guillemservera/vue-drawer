<script setup lang="ts">
import { ref } from 'vue'
import { DrawerClose, DrawerContent, DrawerOverlay, DrawerPortal, DrawerRoot, DrawerTitle, DrawerTrigger } from '@guillemservera/vue-drawer'

const open = ref(false)
</script>

	<template>
		<DrawerRoot v-model:open="open" direction="right">
			<DrawerTrigger>
				Open side drawer
			</DrawerTrigger>

		<DrawerPortal>
				<DrawerOverlay class="fixed inset-0 z-40 bg-black/40" />
				<DrawerContent class="fixed bottom-0 right-0 top-0 z-50 grid w-full max-w-sm gap-4 bg-white p-6 shadow-2xl outline-none">
					<DrawerTitle class="text-lg font-semibold">Side drawer</DrawerTitle>
					<DrawerClose>
						Close
					</DrawerClose>
				</DrawerContent>
		</DrawerPortal>
	</DrawerRoot>
</template>
