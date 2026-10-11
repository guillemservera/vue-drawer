<script setup lang="ts">
import { ref } from 'vue'
	import {
		DrawerClose,
		DrawerContent,
		DrawerOverlay,
	DrawerPortal,
		DrawerRoot,
		DrawerRootNested,
		DrawerTitle,
		DrawerTrigger,
	} from '@guillemservera/vue-drawer'

const open = ref(false)
const nestedOpen = ref(false)
</script>

	<template>
		<DrawerRoot v-model:open="open">
			<DrawerTrigger>
				Open parent
			</DrawerTrigger>

		<DrawerPortal>
			<DrawerOverlay class="fixed inset-0 z-40 bg-black/40" />
			<DrawerContent class="fixed inset-x-0 bottom-0 z-50 mx-auto grid max-w-xl gap-4 rounded-t-2xl bg-white p-6 shadow-2xl outline-none">
				<DrawerTitle class="text-lg font-semibold">Parent drawer</DrawerTitle>

					<DrawerRootNested v-model:open="nestedOpen">
						<DrawerTrigger>
							Open nested
						</DrawerTrigger>

					<DrawerPortal>
						<DrawerOverlay class="fixed inset-0 z-40 bg-black/40" />
							<DrawerContent class="fixed inset-x-0 bottom-0 z-50 mx-auto grid max-w-xl gap-4 rounded-t-2xl bg-white p-6 shadow-2xl outline-none">
								<DrawerTitle class="text-lg font-semibold">Nested drawer</DrawerTitle>
								<DrawerClose>
									Close nested
								</DrawerClose>
							</DrawerContent>
						</DrawerPortal>
					</DrawerRootNested>
					<DrawerClose>
						Close parent
					</DrawerClose>
				</DrawerContent>
		</DrawerPortal>
	</DrawerRoot>
</template>
