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
import { contentClass, overlayClass } from './demoClasses'

const props = defineProps<{ styled: boolean }>()
const bottomOpen = ref(false)
const sidebarOpen = ref(false)
const bottomContent = computed(() => `${contentClass(props.styled, 'bottom')} demo-content--scroll-body`)
const sidebarContent = computed(() => `${contentClass(props.styled, 'left', 'side-sidebar')} demo-content--scroll-body`)
const overlay = computed(() => overlayClass(props.styled))
const rows = Array.from({ length: 34 }, (_, index) => index + 1)
</script>

<template>
	<section class="demo-stack">
		<div class="demo-copy">
			<h2>Scrollable drawer bodies</h2>
			<p>Long native drawer bodies for checking touch scroll, overscroll containment and drag-to-close at the top edge.</p>
		</div>

		<div class="demo-inline-actions">
			<button class="demo-button" type="button" @click="bottomOpen = true">
				Open bottom scroll
			</button>
			<button class="demo-choice" type="button" @click="sidebarOpen = true">
				Open left sidebar scroll
			</button>
		</div>

		<DrawerRoot v-model:open="bottomOpen">
			<DrawerPortal>
				<DrawerOverlay :class="overlay" />
				<DrawerContent :class="bottomContent">
					<div class="scroll-body-header">
						<DrawerHandle :class="props.styled ? 'demo-handle demo-handle--styled' : 'demo-handle'" />
						<DrawerTitle class="demo-title">Activity feed</DrawerTitle>
						<DrawerDescription class="demo-description">
							Scroll the drawer content, then return to the top and drag down to close.
						</DrawerDescription>
					</div>

					<div class="scroll-body-content demo-long-list" data-drawer-scroll-axis="y">
						<p v-for="row in rows" :key="row">
							Feed item {{ row }} · Portfolio update with enough text to make each row easy to drag and scroll on touch devices.
						</p>
					</div>
				</DrawerContent>
			</DrawerPortal>
		</DrawerRoot>

		<DrawerRoot v-model:open="sidebarOpen" direction="left">
			<DrawerPortal>
				<DrawerOverlay :class="overlay" />
				<DrawerContent :class="sidebarContent">
					<div class="scroll-body-header">
						<DrawerTitle class="demo-title">Navigation feed</DrawerTitle>
						<DrawerDescription class="demo-description">
							A left sidebar with enough body content to validate native scrolling and iOS edge handling.
						</DrawerDescription>
					</div>

					<div class="scroll-body-content side-nav-list" data-drawer-scroll-axis="y">
						<button v-for="row in rows" :key="row" class="side-nav-item" type="button">
							Workspace item {{ row }}
						</button>
					</div>
				</DrawerContent>
			</DrawerPortal>
		</DrawerRoot>
	</section>
</template>
