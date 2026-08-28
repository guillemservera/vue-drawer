<script setup lang="ts">
import { computed, ref } from 'vue'
import type { DrawerAnimation } from '@guillemservera/vue-drawer'
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
import { contentClass, handleClass, overlayClass } from './demoClasses'

const props = defineProps<{ styled: boolean }>()
const animations: DrawerAnimation[] = ['slide', 'fade']
const open = ref(false)
const animation = ref<DrawerAnimation>('slide')
const closeAnimation = ref<DrawerAnimation>('slide')
const content = computed(() => contentClass(props.styled, 'bottom'))
const overlay = computed(() => overlayClass(props.styled))
const handle = computed(() => handleClass(props.styled))
</script>

<template>
	<section class="demo-stack">
		<div class="demo-copy">
			<h2>Basic bottom drawer</h2>
			<p>A modal bottom drawer with overlay dismissal, Escape handling, focus restore and swipe close.</p>
		</div>

		<div class="demo-segmented" role="group" aria-label="Animation">
			<button
				v-for="option in animations"
				:key="option"
				type="button"
				:data-active="animation === option ? 'true' : 'false'"
				@click="animation = option"
			>
				{{ option }}
			</button>
		</div>

		<div class="demo-segmented" role="group" aria-label="Close animation">
			<button
				v-for="option in animations"
				:key="option"
				type="button"
				:data-active="closeAnimation === option ? 'true' : 'false'"
				@click="closeAnimation = option"
			>
				out {{ option }}
			</button>
		</div>

		<DrawerRoot v-model:open="open" :animation="animation" :close-animation="closeAnimation">
				<DrawerTrigger class="demo-button">
					Open bottom drawer
				</DrawerTrigger>

			<DrawerPortal>
				<DrawerOverlay :class="overlay" />
				<DrawerContent :class="content">
					<DrawerHandle :class="handle" />
					<DrawerTitle class="demo-title">Portfolio filters</DrawerTitle>
					<DrawerDescription class="demo-description">
						Choose the data you want to inspect on mobile without committing to visual styles in the package.
					</DrawerDescription>

					<div class="demo-grid">
						<button class="demo-choice" type="button">Active positions</button>
						<button class="demo-choice" type="button">Watchlist</button>
						<button class="demo-choice" type="button">Earnings</button>
					</div>

						<DrawerClose class="demo-button demo-button--full">
							Done
						</DrawerClose>
				</DrawerContent>
			</DrawerPortal>
		</DrawerRoot>
	</section>
</template>
