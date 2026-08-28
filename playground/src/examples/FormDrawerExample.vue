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
const symbol = ref('NVDA')
const alertType = ref('Breakout')
const content = computed(() => contentClass(props.styled, 'bottom'))
const overlay = computed(() => overlayClass(props.styled))
const handle = computed(() => handleClass(props.styled))
</script>

<template>
	<section class="demo-stack">
		<div class="demo-copy">
			<h2>Form inside drawer</h2>
			<p>Focusable controls stay trapped while modal. The form uses data-drawer-no-drag.</p>
		</div>

		<DrawerRoot v-model:open="open">
			<button class="demo-button" type="button" @click="open = true">
				Create alert
			</button>

			<DrawerPortal>
				<DrawerOverlay :class="overlay" />
				<DrawerContent :class="content">
					<DrawerHandle :class="handle" />
					<DrawerTitle class="demo-title">Create alert</DrawerTitle>
					<DrawerDescription class="demo-description">
						Inputs and selects opt out of drag so the drawer does not steal form gestures.
					</DrawerDescription>

					<form class="demo-form" data-drawer-no-drag @submit.prevent="open = false">
						<label>
							<span>Symbol</span>
							<input v-model="symbol" autocomplete="off">
						</label>
						<label>
							<span>Alert type</span>
							<select v-model="alertType">
								<option>Breakout</option>
								<option>Pullback</option>
								<option>Volatility</option>
							</select>
						</label>
						<button class="demo-button demo-button--full" type="submit">
							Save alert
						</button>
					</form>
				</DrawerContent>
			</DrawerPortal>
		</DrawerRoot>
	</section>
</template>
