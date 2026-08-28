<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
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

const open = ref(false)
const modal = ref(true)
const repositionInputs = ref(true)
const fixed = ref(false)
const preventScroll = ref(true)
const noBodyStyles = ref(false)
const preventScrollRestoration = ref(false)
const pageRows = Array.from({ length: 18 }, (_, index) => index + 1)
const drawerRows = Array.from({ length: 22 }, (_, index) => index + 1)
const viewportSnapshot = ref({
	scrollY: 0,
	innerHeight: 0,
	visualViewportHeight: 0,
	bodyPosition: '',
	bodyTop: '',
	htmlOverscrollY: '',
	bodyOverscrollY: '',
})

const overlay = computed(() => overlayClass(props.styled))
const content = computed(() => `${contentClass(props.styled, 'bottom')} demo-content--scroll-body demo-content--ios-lab`)

let deferredSnapshotTimer: number | null = null

function readViewportSnapshot() {
	if (typeof window === 'undefined' || typeof document === 'undefined') return

	viewportSnapshot.value = {
		scrollY: Math.round(window.scrollY),
		innerHeight: Math.round(window.innerHeight),
		visualViewportHeight: Math.round(window.visualViewport?.height ?? 0),
		bodyPosition: document.body.style.position || 'none',
		bodyTop: document.body.style.top || 'none',
		htmlOverscrollY: document.documentElement.style.overscrollBehaviorY || 'none',
		bodyOverscrollY: document.body.style.overscrollBehaviorY || 'none',
	}
}

function scheduleDeferredSnapshot() {
	if (typeof window === 'undefined') return
	if (deferredSnapshotTimer !== null) {
		window.clearTimeout(deferredSnapshotTimer)
	}

	deferredSnapshotTimer = window.setTimeout(() => {
		deferredSnapshotTimer = null
		readViewportSnapshot()
	}, 360)
}

function handleViewportChange() {
	readViewportSnapshot()
	scheduleDeferredSnapshot()
}

watch([open, modal, repositionInputs, fixed, preventScroll, noBodyStyles, preventScrollRestoration], handleViewportChange)

onMounted(() => {
	readViewportSnapshot()
	window.addEventListener('scroll', handleViewportChange, { passive: true })
	window.addEventListener('resize', handleViewportChange)
	window.visualViewport?.addEventListener('resize', handleViewportChange)
	window.visualViewport?.addEventListener('scroll', handleViewportChange)
})

onBeforeUnmount(() => {
	window.removeEventListener('scroll', handleViewportChange)
	window.removeEventListener('resize', handleViewportChange)
	window.visualViewport?.removeEventListener('resize', handleViewportChange)
	window.visualViewport?.removeEventListener('scroll', handleViewportChange)
	if (deferredSnapshotTimer !== null) {
		window.clearTimeout(deferredSnapshotTimer)
	}
})
</script>

<template>
	<section class="demo-stack">
		<div class="demo-copy">
			<h2>iOS scroll lock lab</h2>
			<p>Manual checks for Safari body locking, browser keyboard resize, scroll restoration and internal drawer scrolling.</p>
		</div>

		<div class="ios-lab-layout">
			<form class="ios-lab-panel" @submit.prevent>
				<h3>Lock options</h3>
				<label class="demo-toggle">
					<input v-model="modal" type="checkbox">
					<span>modal</span>
				</label>
				<label class="demo-toggle">
					<input v-model="repositionInputs" type="checkbox">
					<span>repositionInputs</span>
				</label>
				<label class="demo-toggle">
					<input v-model="fixed" type="checkbox">
					<span>fixed</span>
				</label>
				<label class="demo-toggle">
					<input v-model="preventScroll" type="checkbox">
					<span>preventScroll</span>
				</label>
				<label class="demo-toggle">
					<input v-model="noBodyStyles" type="checkbox">
					<span>noBodyStyles</span>
				</label>
				<label class="demo-toggle">
					<input v-model="preventScrollRestoration" type="checkbox">
					<span>preventScrollRestoration</span>
				</label>
				<button class="demo-button demo-button--full" type="button" @click="open = true">
					Open iOS drawer
				</button>
			</form>

			<dl class="demo-metrics ios-lab-panel">
				<div>
					<dt>scrollY</dt>
					<dd>{{ viewportSnapshot.scrollY }}</dd>
				</div>
				<div>
					<dt>innerHeight</dt>
					<dd>{{ viewportSnapshot.innerHeight }}</dd>
				</div>
				<div>
					<dt>visualViewport</dt>
					<dd>{{ viewportSnapshot.visualViewportHeight || 'n/a' }}</dd>
				</div>
				<div>
					<dt>body position</dt>
					<dd>{{ viewportSnapshot.bodyPosition }}</dd>
				</div>
				<div>
					<dt>body top</dt>
					<dd>{{ viewportSnapshot.bodyTop }}</dd>
				</div>
				<div>
					<dt>overscroll</dt>
					<dd>{{ viewportSnapshot.htmlOverscrollY }} / {{ viewportSnapshot.bodyOverscrollY }}</dd>
				</div>
			</dl>
		</div>

		<div class="ios-lab-page">
			<label class="demo-form">
				<span>Page input before opening</span>
				<input placeholder="Focus this, scroll the page, then open the drawer">
			</label>

			<p v-for="row in pageRows" :key="row">
				Page row {{ row }} · Background content makes document scroll visible while the drawer is open and after it closes.
			</p>
		</div>

		<DrawerRoot
			v-model:open="open"
			:modal="modal"
			:auto-focus="false"
			:reposition-inputs="repositionInputs"
			:fixed="fixed"
			:prevent-scroll="preventScroll"
			:no-body-styles="noBodyStyles"
			:prevent-scroll-restoration="preventScrollRestoration"
		>
			<DrawerPortal>
				<DrawerOverlay :class="overlay" />
				<DrawerContent :class="content">
					<div class="scroll-body-header">
						<DrawerHandle :class="props.styled ? 'demo-handle demo-handle--styled' : 'demo-handle'" />
						<DrawerTitle class="demo-title">Keyboard and scroll check</DrawerTitle>
						<DrawerDescription class="demo-description">
							Focus the lower inputs on iOS Safari, scroll this body, then close and check that the page position is restored.
						</DrawerDescription>
					</div>

					<div class="scroll-body-content ios-lab-drawer-body" data-drawer-scroll-axis="y">
						<form class="demo-form" @submit.prevent>
							<label>
								<span>Top input</span>
								<input placeholder="Should not jump the page">
							</label>

							<p v-for="row in drawerRows" :key="row">
								Drawer row {{ row }} · Enough content to test internal scroll momentum and edge dragging.
							</p>

							<label>
								<span>Bottom input</span>
								<input placeholder="Keyboard should leave this reachable">
							</label>

							<label>
								<span>Notes</span>
								<input placeholder="Close with keyboard open, then check restoration">
							</label>
						</form>
					</div>
				</DrawerContent>
			</DrawerPortal>
		</DrawerRoot>
	</section>
</template>
