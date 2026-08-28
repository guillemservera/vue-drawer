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
const content = computed(() => contentClass(props.styled, 'bottom'))
const overlay = computed(() => overlayClass(props.styled))
const handle = computed(() => handleClass(props.styled))
</script>

<template>
	<section class="demo-stack">
		<div class="demo-copy">
			<h2>Non-dismissible drawer</h2>
			<p>Escape, outside click and drag-to-close are prevented until the app closes the controlled drawer.</p>
		</div>

		<DrawerRoot v-model:open="open" :dismissible="false">
			<button class="demo-button" type="button" @click="open = true">
				Open locked drawer
			</button>

			<DrawerPortal>
				<DrawerOverlay :class="overlay" />
				<DrawerContent :class="content">
					<DrawerHandle :class="handle" />
					<DrawerTitle class="demo-title">Review order</DrawerTitle>
					<DrawerDescription class="demo-description">
						This flow only closes from an explicit action.
					</DrawerDescription>

					<dl class="demo-metrics">
						<div>
							<dt>dismissible</dt>
							<dd>false</dd>
						</div>
						<div>
							<dt>open</dt>
							<dd>{{ open }}</dd>
						</div>
					</dl>

					<button class="demo-button demo-button--full" type="button" @click="open = false">
						Confirm and close
					</button>
				</DrawerContent>
			</DrawerPortal>
		</DrawerRoot>
	</section>
</template>
