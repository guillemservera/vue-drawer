<script setup lang="ts">
import { ref } from 'vue'
	import {
		DrawerClose,
		DrawerContent,
		DrawerDescription,
		DrawerHandle,
	DrawerOverlay,
		DrawerPortal,
		DrawerRoot,
		DrawerTitle,
		DrawerTrigger,
	} from '@guillemservera/vue-drawer'

const open = ref(false)
</script>

	<template>
		<DrawerRoot v-model:open="open">
			<DrawerTrigger>
				Open drawer
			</DrawerTrigger>

		<DrawerPortal>
			<DrawerOverlay class="fixed inset-0 z-40 bg-black/40" />
			<DrawerContent class="fixed inset-x-0 bottom-0 z-50 mx-auto grid max-w-xl gap-4 rounded-t-2xl bg-white p-6 shadow-2xl outline-none">
				<DrawerHandle class="mx-auto h-1.5 w-12 rounded-full bg-zinc-300" />
				<DrawerTitle class="text-lg font-semibold">Drawer title</DrawerTitle>
					<DrawerDescription class="text-sm text-zinc-600">
						Drawer description
					</DrawerDescription>
					<DrawerClose>
						Close
					</DrawerClose>
				</DrawerContent>
		</DrawerPortal>
	</DrawerRoot>
</template>
