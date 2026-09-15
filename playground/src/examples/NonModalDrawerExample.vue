<script setup lang="ts">
import { computed, ref } from 'vue'
import {
	DrawerContent,
	DrawerDescription,
	DrawerHandle,
	DrawerPortal,
	DrawerRoot,
	DrawerTitle,
} from '@guillemservera/vue-drawer'
import { contentClass, handleClass } from './demoClasses'

const props = defineProps<{ styled: boolean }>()
const open = ref(false)
const backgroundClicks = ref(0)
const content = computed(() => contentClass(props.styled, 'right'))
const handle = computed(() => handleClass(props.styled))
</script>

<template>
	<section class="demo-stack">
		<div class="demo-copy">
			<h2>Non-modal drawer</h2>
			<p>Non-modal drawers keep the page interactive and do not consume overlay pointer events.</p>
		</div>

		<div class="demo-inline-actions">
			<button class="demo-button" type="button" @click="open = true">
				Open non-modal drawer
			</button>
			<button class="demo-button demo-button--secondary" type="button" @click="backgroundClicks += 1">
				Background clicks: {{ backgroundClicks }}
			</button>
		</div>

		<DrawerRoot v-model:open="open" direction="right" :modal="false">
			<DrawerPortal>
				<DrawerContent :class="content">
					<DrawerHandle :class="handle" />
					<DrawerTitle class="demo-title">Non-modal tools</DrawerTitle>
					<DrawerDescription class="demo-description">
						This drawer can stay open while you interact with the underlying page.
					</DrawerDescription>
					<button class="demo-button demo-button--full" type="button" @click="open = false">
						Close
					</button>
				</DrawerContent>
			</DrawerPortal>
		</DrawerRoot>
	</section>
</template>
