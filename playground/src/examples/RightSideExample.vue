<script setup lang="ts">
import { computed, ref } from 'vue'
import type { DrawerDirection } from '@guillemservera/vue-drawer'
import {
	DrawerContent,
	DrawerDescription,
	DrawerOverlay,
	DrawerPortal,
	DrawerRoot,
	DrawerTitle,
} from '@guillemservera/vue-drawer'
import { contentClass, overlayClass } from './demoClasses'
import type { DemoContentVariant } from './demoClasses'

const props = defineProps<{ styled: boolean }>()

interface SideExample {
	id: string
	description: string
	direction: Extract<DrawerDirection, 'left' | 'right'>
	label: string
	title: string
	variant: Exclude<DemoContentVariant, 'default'>
}

const sideExamples: SideExample[] = [
	{
		id: 'left-sidebar',
		description: 'A flush application sidebar with calmer width and no floating treatment.',
		direction: 'left',
		label: 'Left sidebar',
		title: 'Navigation',
		variant: 'side-sidebar',
	},
	{
		id: 'left-drawer',
		description: 'An edge-attached side drawer for focused secondary workflows.',
		direction: 'left',
		label: 'Left drawer',
		title: 'Workspace tools',
		variant: 'side-drawer',
	},
	{
		id: 'left-floating',
		description: 'A compact floating panel with visible page space around it.',
		direction: 'left',
		label: 'Left floating',
		title: 'Quick actions',
		variant: 'side-floating',
	},
	{
		id: 'right-sidebar',
		description: 'A right-side inspector that reads more like a native sidebar.',
		direction: 'right',
		label: 'Right sidebar',
		title: 'Inspector',
		variant: 'side-sidebar',
	},
	{
		id: 'right-drawer',
		description: 'A right edge drawer with the same behavior as a bottom sheet.',
		direction: 'right',
		label: 'Right drawer',
		title: 'Ticker details',
		variant: 'side-drawer',
	},
	{
		id: 'right-floating',
		description: 'A floating side drawer for lightweight contextual content.',
		direction: 'right',
		label: 'Right floating',
		title: 'Alerts',
		variant: 'side-floating',
	},
]

const open = ref(false)
const activeExample = ref(sideExamples[4]!)
const content = computed(() => contentClass(props.styled, activeExample.value.direction, activeExample.value.variant))
const overlay = computed(() => overlayClass(props.styled))

function openExample(example: SideExample) {
	activeExample.value = example
	open.value = true
}
</script>

<template>
	<section class="demo-stack">
		<div class="demo-copy">
			<h2>Side drawers</h2>
			<p>Left and right drawers can be styled as app sidebars, edge drawers or floating panels without changing the primitive.</p>
		</div>

		<div class="side-demo-grid">
			<button
				v-for="example in sideExamples"
				:key="example.id"
				class="side-demo-card"
				type="button"
				@click="openExample(example)"
			>
				<span>{{ example.label }}</span>
				<small>{{ example.description }}</small>
			</button>
		</div>

		<DrawerRoot v-model:open="open" :direction="activeExample.direction">
			<DrawerPortal>
				<DrawerOverlay :class="overlay" />
				<DrawerContent :class="content">
					<DrawerTitle class="demo-title">{{ activeExample.title }}</DrawerTitle>
					<DrawerDescription class="demo-description">
						{{ activeExample.description }}
					</DrawerDescription>

					<div class="side-nav-list">
						<button class="side-nav-item" type="button">Overview</button>
						<button class="side-nav-item" type="button">Positions</button>
						<button class="side-nav-item" type="button">Signals</button>
						<button class="side-nav-item" type="button">Risk</button>
					</div>

					<dl class="demo-metrics">
						<div><dt>Side</dt><dd>{{ activeExample.direction }}</dd></div>
						<div><dt>Style</dt><dd>{{ activeExample.variant.replace('side-', '') }}</dd></div>
						<div><dt>Dismiss</dt><dd>drag or overlay</dd></div>
					</dl>
				</DrawerContent>
			</DrawerPortal>
		</DrawerRoot>
	</section>
</template>
