<script setup lang="ts">
import { computed, ref } from 'vue'
import {
	DrawerClose,
	DrawerContent,
	DrawerDescription,
	DrawerHandle,
	DrawerOverlay,
	DrawerPortal,
	DrawerRoot,
	DrawerRootNested,
	DrawerTitle,
} from '@guillemservera/vue-drawer'
import { contentClass, handleClass, overlayClass } from './demoClasses'

const props = defineProps<{ styled: boolean }>()
const open = ref(false)
const nestedOpen = ref(false)
const content = computed(() => `${contentClass(props.styled, 'bottom')} demo-content--nested-parent`)
const nestedContent = computed(() => `${contentClass(props.styled, 'bottom')} demo-content--nested`)
const overlay = computed(() => overlayClass(props.styled))
const nestedOverlay = computed(() => `${overlayClass(props.styled)} demo-overlay--nested`)
const handle = computed(() => handleClass(props.styled))
</script>

<template>
	<section class="demo-stack">
		<div class="demo-copy">
			<h2>Nested drawers</h2>
			<p>Open a child drawer from inside the parent. Escape and overlay dismissal only close the top drawer.</p>
		</div>

		<DrawerRoot v-model:open="open">
			<button class="demo-button" type="button" @click="open = true">
				Open parent drawer
			</button>

			<DrawerPortal>
				<DrawerOverlay :class="overlay" />
				<DrawerContent :class="content">
					<DrawerHandle :class="handle" />
					<DrawerTitle class="demo-title">Parent drawer</DrawerTitle>
					<DrawerDescription class="demo-description">
						The parent remains stable while the nested drawer stacks above it.
					</DrawerDescription>

					<DrawerRootNested v-model:open="nestedOpen">
						<button class="demo-button demo-button--full" type="button" @click="nestedOpen = true">
							Open nested drawer
						</button>

						<DrawerPortal>
							<DrawerOverlay :class="nestedOverlay" />
							<DrawerContent :class="nestedContent">
								<DrawerHandle :class="handle" />
								<DrawerTitle class="demo-title">Nested drawer</DrawerTitle>
								<DrawerDescription class="demo-description">
									Press Escape once to close this drawer, then again to close the parent.
								</DrawerDescription>
								<DrawerClose class="demo-button demo-button--full">
									Close nested drawer
								</DrawerClose>
								<DrawerClose class="demo-button demo-button--full" scope="all">
									Close both drawers
								</DrawerClose>
							</DrawerContent>
						</DrawerPortal>
					</DrawerRootNested>
				</DrawerContent>
			</DrawerPortal>
		</DrawerRoot>
	</section>
</template>
