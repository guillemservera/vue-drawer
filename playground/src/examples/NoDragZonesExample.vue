<script setup lang="ts">
import { computed, ref } from 'vue'
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
const slider = ref(40)
const content = computed(() => contentClass(props.styled, 'bottom'))
const overlay = computed(() => overlayClass(props.styled))
const handle = computed(() => handleClass(props.styled))
</script>

<template>
	<section class="demo-stack">
		<div class="demo-copy">
			<h2>No-drag zones</h2>
			<p>Use data-drawer-no-drag or data-vaul-no-drag for controls that own their pointer gestures.</p>
		</div>

		<DrawerRoot v-model:open="open">
			<button class="demo-button" type="button" @click="open = true">
				Open no-drag demo
			</button>

			<DrawerPortal>
				<DrawerOverlay :class="overlay" />
				<DrawerContent :class="content">
					<DrawerHandle :class="handle" />
					<DrawerTitle class="demo-title">Pointer-owned controls</DrawerTitle>
					<DrawerDescription class="demo-description">
						The range input and horizontal scroller should not close the drawer while used.
					</DrawerDescription>

					<label class="demo-form" data-drawer-no-drag>
						<span>Allocation: {{ slider }}%</span>
						<input v-model="slider" type="range" min="0" max="100">
					</label>

					<div class="demo-horizontal-strip" data-drawer-scroll-axis="x">
						<button v-for="label in ['1D', '5D', '1M', '6M', 'YTD', '1Y', '5Y']" :key="label" class="demo-chip" type="button">
							{{ label }}
						</button>
					</div>
				</DrawerContent>
			</DrawerPortal>
		</DrawerRoot>
	</section>
</template>
