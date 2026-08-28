<script setup lang="ts">
import { computed, ref } from 'vue'
import type { DrawerSnapPoint } from '@guillemservera/vue-drawer'
import {
	DrawerContent,
	DrawerDescription,
	DrawerHandle,
	DrawerOverlay,
	DrawerPortal,
	DrawerRoot,
	DrawerTitle,
} from '@guillemservera/vue-drawer'
import { contentClass, handleClass, overlayClass } from './demoClasses'

const props = defineProps<{ styled: boolean }>()
const open = ref(false)
const activeSnapPoint = ref<DrawerSnapPoint | null>('160px')
const snapPoints: DrawerSnapPoint[] = ['160px', 0.55, 0.92]
const content = computed(() => contentClass(props.styled, 'bottom'))
const overlay = computed(() => overlayClass(props.styled))
const handle = computed(() => handleClass(props.styled))
</script>

<template>
	<section class="demo-stack">
		<div class="demo-copy">
			<h2>Snap points</h2>
			<p>Drag between snap points. The active snap point can be controlled with v-model.</p>
		</div>

		<DrawerRoot
			v-model:open="open"
			v-model:active-snap-point="activeSnapPoint"
			:snap-points="snapPoints"
			default-snap-point="160px"
			:fade-from-index="1"
		>
			<button class="demo-button" type="button" @click="open = true">
				Open snap drawer
			</button>

			<DrawerPortal>
				<DrawerOverlay :class="overlay" />
				<DrawerContent :class="content">
					<DrawerHandle :class="handle" />
					<DrawerTitle class="demo-title">Snap points</DrawerTitle>
					<DrawerDescription class="demo-description">
						Active snap point: {{ activeSnapPoint }}
					</DrawerDescription>

					<div class="demo-grid">
						<button
							v-for="snapPoint in snapPoints"
							:key="String(snapPoint)"
							class="demo-choice"
							type="button"
							@click="activeSnapPoint = snapPoint"
						>
							{{ snapPoint }}
						</button>
					</div>

					<div class="demo-long-list">
						<p v-for="index in 10" :key="index">
							Snap point row {{ index }}
						</p>
					</div>
				</DrawerContent>
			</DrawerPortal>
		</DrawerRoot>
	</section>
</template>
