<script setup lang="ts">
import { ref } from 'vue'
import type { DrawerSnapPoint } from '@guillemservera/vue-drawer'
import { DrawerClose, DrawerContent, DrawerHandle, DrawerOverlay, DrawerPortal, DrawerRoot, DrawerTitle, DrawerTrigger } from '@guillemservera/vue-drawer'

const open = ref(false)
const activeSnapPoint = ref<DrawerSnapPoint | null>('160px')
const snapPoints: DrawerSnapPoint[] = ['160px', 0.55, 0.9]
</script>

<template>
	<DrawerRoot
		v-model:open="open"
		v-model:active-snap-point="activeSnapPoint"
		:snap-points="snapPoints"
		default-snap-point="160px"
		:fade-from-index="1"
	>
		<DrawerTrigger>
			Open snap drawer
		</DrawerTrigger>

		<DrawerPortal>
			<DrawerOverlay class="fixed inset-0 z-40 bg-black/40" />
			<DrawerContent class="fixed inset-x-0 bottom-0 z-50 mx-auto grid h-[100dvh] max-h-[100dvh] max-w-xl gap-4 rounded-t-2xl bg-white p-6 shadow-2xl outline-none">
				<DrawerHandle class="mx-auto h-1.5 w-12 rounded-full bg-zinc-300" />
				<DrawerTitle class="text-lg font-semibold">Snap points</DrawerTitle>
				<p>Active: {{ activeSnapPoint }}</p>
				<DrawerClose>
					Close
				</DrawerClose>
			</DrawerContent>
		</DrawerPortal>
	</DrawerRoot>
</template>
