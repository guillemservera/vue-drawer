<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watchEffect } from 'vue'
import AllPropsExample from './examples/AllPropsExample.vue'
import BasicBottomExample from './examples/BasicBottomExample.vue'
import FormDrawerExample from './examples/FormDrawerExample.vue'
import IosScrollLockExample from './examples/IosScrollLockExample.vue'
import NestedDrawersExample from './examples/NestedDrawersExample.vue'
import NonDismissibleExample from './examples/NonDismissibleExample.vue'
import NoDragZonesExample from './examples/NoDragZonesExample.vue'
import NonModalDrawerExample from './examples/NonModalDrawerExample.vue'
import RightSideExample from './examples/RightSideExample.vue'
import ScrollBodyExample from './examples/ScrollBodyExample.vue'
import SnapPointsExample from './examples/SnapPointsExample.vue'

const examples = [
	{ id: 'props', label: 'Props lab', component: AllPropsExample },
	{ id: 'basic', label: 'Basic', component: BasicBottomExample },
	{ id: 'right', label: 'Sides', component: RightSideExample },
	{ id: 'scroll-body', label: 'Scroll body', component: ScrollBodyExample },
	{ id: 'ios-scroll', label: 'iOS scroll', component: IosScrollLockExample },
	{ id: 'snap-points', label: 'Snap points', component: SnapPointsExample },
	{ id: 'nested', label: 'Nested', component: NestedDrawersExample },
	{ id: 'form', label: 'Form', component: FormDrawerExample },
	{ id: 'locked', label: 'Locked', component: NonDismissibleExample },
	{ id: 'non-modal', label: 'Non-modal', component: NonModalDrawerExample },
	{ id: 'no-drag', label: 'No-drag zones', component: NoDragZonesExample },
] as const

const activeId = ref<(typeof examples)[number]['id']>('basic')
const demoStyle = ref<'styled' | 'unstyled'>('styled')
const theme = ref<'light' | 'dark'>('light')
const activeExample = computed(() => examples.find(example => example.id === activeId.value) ?? examples[0])

watchEffect(() => {
	if (typeof document === 'undefined') return
	document.documentElement.dataset.demoTheme = theme.value
})

onBeforeUnmount(() => {
	if (typeof document === 'undefined') return
	delete document.documentElement.dataset.demoTheme
})
</script>

<template>
	<main class="page">
		<header class="header">
			<div>
				<p class="eyebrow">VueDrawer</p>
				<h1>Headless drawer behavior for Vue 3</h1>
			</div>

			<div class="header-controls">
				<div class="style-toggle" role="group" aria-label="Demo style">
					<button
						type="button"
						:data-active="demoStyle === 'styled' ? 'true' : 'false'"
						@click="demoStyle = 'styled'"
					>
						Styled
					</button>
					<button
						type="button"
						:data-active="demoStyle === 'unstyled' ? 'true' : 'false'"
						@click="demoStyle = 'unstyled'"
					>
						Unstyled
					</button>
				</div>

				<div class="style-toggle" role="group" aria-label="Demo theme">
					<button
						type="button"
						:data-active="theme === 'light' ? 'true' : 'false'"
						@click="theme = 'light'"
					>
						Light
					</button>
					<button
						type="button"
						:data-active="theme === 'dark' ? 'true' : 'false'"
						@click="theme = 'dark'"
					>
						Dark
					</button>
				</div>
			</div>
		</header>

		<nav class="tabs" aria-label="Examples">
			<button
				v-for="example in examples"
				:key="example.id"
				type="button"
				:data-active="example.id === activeId ? 'true' : 'false'"
				@click="activeId = example.id"
			>
				{{ example.label }}
			</button>
		</nav>

		<section class="panel">
			<component :is="activeExample.component" :styled="demoStyle === 'styled'" />
		</section>
	</main>
</template>

<style>
:root {
	--demo-accent: #155f55;
	--demo-accent-fg: #ffffff;
	--demo-bg: #f4f0e8;
	--demo-border: #d8d2c6;
	--demo-card: #ffffff;
	--demo-control-border: #cfd8d1;
	--demo-control-muted: #54615a;
	--demo-drawer-radius: 22px;
	--demo-fg: #17201c;
	--demo-field: #39443e;
	--demo-handle: #9aa79f;
	--demo-muted: #5c6760;
	--demo-overlay: rgba(12, 17, 16, 0.42);
	--demo-panel: #fffdf8;
	--demo-primary: #17201c;
	--demo-primary-fg: #ffffff;
	--demo-row: #f7f8f4;
	--demo-shadow: 0 24px 80px rgba(23, 32, 28, 0.28);
	color-scheme: light;
}

:root[data-demo-theme='dark'] {
	--demo-accent: #4cc3a8;
	--demo-accent-fg: #0b1713;
	--demo-bg: #101412;
	--demo-border: #334039;
	--demo-card: #1b231f;
	--demo-control-border: #46544c;
	--demo-control-muted: #9aa9a1;
	--demo-drawer-radius: 22px;
	--demo-fg: #eaf2ed;
	--demo-field: #d7e2dc;
	--demo-handle: #75877d;
	--demo-muted: #a2afa8;
	--demo-overlay: rgba(0, 0, 0, 0.56);
	--demo-panel: #151b18;
	--demo-primary: #d8f3e6;
	--demo-primary-fg: #102019;
	--demo-row: #202a25;
	--demo-shadow: 0 24px 90px rgba(0, 0, 0, 0.46);
	color-scheme: dark;
}

* {
	box-sizing: border-box;
}

html {
	min-height: 100%;
	overflow-y: scroll;
	scrollbar-gutter: stable;
}

body {
	margin: 0;
	background: var(--demo-bg);
	color: var(--demo-fg);
	font-family:
		Inter,
		ui-sans-serif,
		system-ui,
		-apple-system,
		BlinkMacSystemFont,
		"Segoe UI",
		sans-serif;
	transition: background-color 180ms ease, color 180ms ease;
}

#app {
	min-height: 100%;
}

button,
input,
select {
	font: inherit;
}

.page {
	display: grid;
	gap: 22px;
	margin: 0 auto;
	max-width: 980px;
	min-height: 125dvh;
	padding: 28px 18px 56px;
}

.header {
	align-items: end;
	display: flex;
	gap: 18px;
	justify-content: space-between;
}

.header-controls {
	align-items: end;
	display: flex;
	flex-wrap: wrap;
	gap: 10px;
	justify-content: flex-end;
}

.eyebrow {
	color: var(--demo-control-muted);
	font-size: 13px;
	font-weight: 700;
	letter-spacing: 0;
	margin: 0 0 6px;
	text-transform: uppercase;
}

.header h1 {
	font-size: 44px;
	line-height: 1.02;
	margin: 0;
	max-width: 680px;
}

.style-toggle,
.tabs {
	display: flex;
	flex-wrap: wrap;
	gap: 8px;
}

.style-toggle {
	background: var(--demo-card);
	border: 1px solid var(--demo-border);
	border-radius: 8px;
	padding: 4px;
}

.style-toggle button,
.tabs button {
	border: 1px solid transparent;
	border-radius: 7px;
	cursor: pointer;
	min-height: 38px;
}

.style-toggle button {
	background: transparent;
	color: var(--demo-control-muted);
	padding: 7px 11px;
}

.style-toggle button[data-active='true'] {
	background: var(--demo-primary);
	color: var(--demo-primary-fg);
}

.tabs button {
	background: var(--demo-card);
	border-color: var(--demo-border);
	color: var(--demo-field);
	padding: 8px 12px;
}

.tabs button[data-active='true'] {
	background: var(--demo-accent);
	border-color: var(--demo-accent);
	color: var(--demo-accent-fg);
}

.panel {
	background: var(--demo-panel);
	border: 1px solid var(--demo-border);
	border-radius: 8px;
	min-height: 360px;
	padding: 22px;
}

.demo-stack {
	display: grid;
	gap: 20px;
}

.demo-copy {
	display: grid;
	gap: 8px;
	max-width: 680px;
}

.demo-copy h2,
.demo-title {
	font-size: 24px;
	line-height: 1.15;
	margin: 0;
}

.demo-copy p,
.demo-description {
	color: var(--demo-muted);
	line-height: 1.6;
	margin: 0;
}

.demo-button,
.demo-choice,
.demo-chip {
	align-items: center;
	background: var(--demo-primary);
	border: 1px solid var(--demo-primary);
	border-radius: 7px;
	color: var(--demo-primary-fg);
	cursor: pointer;
	display: inline-flex;
	font-weight: 700;
	justify-content: center;
	min-height: 42px;
	padding: 9px 14px;
	text-align: center;
}

.demo-button--secondary,
.demo-choice,
.demo-chip {
	background: var(--demo-card);
	border-color: var(--demo-control-border);
	color: var(--demo-fg);
}

.demo-button--full {
	width: 100%;
}

.demo-inline-actions,
.demo-grid {
	display: flex;
	flex-wrap: wrap;
	gap: 10px;
}

.demo-segmented {
	background: var(--demo-bg);
	border: 1px solid var(--demo-border);
	border-radius: 8px;
	display: grid;
	gap: 4px;
	grid-template-columns: repeat(2, minmax(0, 1fr));
	max-width: 360px;
	padding: 4px;
}

.demo-segmented--triple {
	grid-template-columns: repeat(auto-fit, minmax(82px, 1fr));
	max-width: 560px;
}

.demo-segmented button {
	background: transparent;
	border: 1px solid transparent;
	border-radius: 6px;
	color: var(--demo-control-muted);
	cursor: pointer;
	min-height: 34px;
}

.demo-segmented button[data-active='true'] {
	background: var(--demo-primary);
	color: var(--demo-primary-fg);
}

.demo-grid {
	display: grid;
	grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
}

.demo-overlay {
	position: fixed;
	inset: 0;
	z-index: 40;
}

.demo-overlay--nested {
	z-index: 60;
}

.demo-overlay--styled {
	background: var(--demo-overlay);
}

.demo-content {
	outline: none;
	position: fixed;
	z-index: 50;
}

.demo-content--nested {
	z-index: 70;
}

.demo-content--nested-parent {
	min-height: min(76vh, 620px);
}

.demo-content--bottom {
	bottom: 0;
	inset-inline: 0;
	margin-inline: auto;
	max-height: min(88vh, 680px);
	width: 100vw;
}

.demo-content[data-snap-points='true'].demo-content--bottom {
	height: 100dvh;
	max-height: 100dvh;
}

.demo-content--right {
	bottom: 0;
	max-width: 360px;
	right: 0;
	top: 0;
	width: min(84vw, 360px);
}

.demo-content--left {
	bottom: 0;
	left: 0;
	max-width: 360px;
	top: 0;
	width: min(84vw, 360px);
}

.demo-content--top {
	inset-inline: 0;
	margin-inline: auto;
	top: 0;
	width: 100vw;
}

.demo-content[data-snap-points='true'].demo-content--top {
	height: 100dvh;
	max-height: 100dvh;
}

.demo-content[data-snap-points='true'].demo-content--left,
.demo-content[data-snap-points='true'].demo-content--right {
	max-width: min(84dvw, 480px);
	width: min(84dvw, 480px);
}

.demo-content--styled {
	background: var(--demo-card);
	border: 0;
	box-shadow: var(--demo-shadow);
	color: var(--demo-fg);
	display: grid;
	gap: 12px;
	padding: 12px 18px 18px;
}

.demo-content--bottom.demo-content--styled {
	border-radius: var(--demo-drawer-radius) var(--demo-drawer-radius) 0 0;
}

.demo-content--top.demo-content--styled {
	border-radius: 0 0 var(--demo-drawer-radius) var(--demo-drawer-radius);
}

.demo-content--right.demo-content--styled {
	border-radius: var(--demo-drawer-radius) 0 0 var(--demo-drawer-radius);
}

.demo-content--left.demo-content--styled {
	border-radius: 0 var(--demo-drawer-radius) var(--demo-drawer-radius) 0;
}

.demo-content--side-sidebar.demo-content--styled {
	border-radius: 0;
	box-shadow: 10px 0 36px rgba(23, 32, 28, 0.12);
	max-width: 320px;
	padding: 22px;
	width: min(78vw, 320px);
}

:root[data-demo-theme='dark'] .demo-content--side-sidebar.demo-content--styled {
	box-shadow: 10px 0 44px rgba(0, 0, 0, 0.28);
}

.demo-content--right.demo-content--side-sidebar.demo-content--styled {
	box-shadow: -10px 0 36px rgba(23, 32, 28, 0.12);
}

:root[data-demo-theme='dark'] .demo-content--right.demo-content--side-sidebar.demo-content--styled {
	box-shadow: -10px 0 44px rgba(0, 0, 0, 0.28);
}

.demo-content--side-drawer.demo-content--styled {
	max-width: 360px;
	padding: 18px;
	width: min(82vw, 360px);
}

.demo-content--side-floating {
	bottom: 16px;
	top: 16px;
}

.demo-content--left.demo-content--side-floating {
	left: 16px;
}

.demo-content--right.demo-content--side-floating {
	right: 16px;
}

.demo-content--side-floating.demo-content--styled {
	border-radius: 18px;
	max-width: 340px;
	padding: 18px;
	width: min(calc(100vw - 48px), 340px);
}

.demo-content--scroll-body {
	display: flex;
	flex-direction: column;
	max-height: min(86dvh, 680px);
	overflow: hidden;
}

.demo-content--left.demo-content--scroll-body,
.demo-content--right.demo-content--scroll-body {
	max-height: none;
	overflow: hidden;
}

.scroll-body-header {
	background: inherit;
	flex: 0 0 auto;
	display: grid;
	gap: 8px;
	padding-bottom: 4px;
}

.scroll-body-content {
	flex: 1 1 auto;
	min-height: 0;
	overflow-y: auto;
	-webkit-overflow-scrolling: touch;
	overscroll-behavior-y: contain;
	padding-right: 2px;
}

.demo-content--unstyled {
	display: grid;
	gap: 12px;
	padding: 14px;
}

.demo-content--unstyled.demo-content--scroll-body {
	display: flex;
}

.demo-handle {
	justify-self: center;
}

.demo-handle--styled {
	background: var(--demo-handle);
	border-radius: 999px;
	height: 5px;
	width: 46px;
}

.demo-metrics {
	display: grid;
	gap: 10px;
	margin: 0;
}

.demo-metrics div {
	align-items: center;
	border-bottom: 1px solid var(--demo-border);
	display: flex;
	justify-content: space-between;
	padding-block: 10px;
}

.demo-metrics dt {
	color: var(--demo-muted);
}

.demo-metrics dd {
	font-weight: 800;
	margin: 0;
}

.demo-long-list {
	display: grid;
	gap: 8px;
	padding: 0;
}

.demo-long-list p {
	background: var(--demo-row);
	border: 1px solid var(--demo-border);
	border-radius: 7px;
	margin: 0;
	padding: 10px;
}

.demo-form {
	display: grid;
	gap: 12px;
}

.demo-form label,
label.demo-form {
	display: grid;
	gap: 6px;
}

.demo-form span {
	color: var(--demo-field);
	font-weight: 700;
}

.demo-form input,
.demo-form select {
	background: var(--demo-card);
	border: 1px solid var(--demo-control-border);
	border-radius: 7px;
	color: var(--demo-fg);
	min-height: 42px;
	padding: 8px 10px;
	width: 100%;
}

.demo-horizontal-strip {
	display: flex;
	gap: 8px;
	max-width: 100%;
	overflow-x: auto;
	padding-bottom: 6px;
}

.demo-chip {
	flex: 0 0 auto;
	min-width: 72px;
}

.side-demo-grid {
	display: grid;
	gap: 10px;
	grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
}

.side-demo-card {
	background: var(--demo-card);
	border: 1px solid var(--demo-border);
	border-radius: 8px;
	color: var(--demo-fg);
	cursor: pointer;
	display: grid;
	gap: 6px;
	padding: 14px;
	text-align: left;
}

.side-demo-card span {
	font-weight: 800;
}

.side-demo-card small {
	color: var(--demo-muted);
	line-height: 1.45;
}

.side-nav-list {
	display: grid;
	gap: 8px;
}

.side-nav-item {
	background: var(--demo-row);
	border: 1px solid var(--demo-border);
	border-radius: 7px;
	color: var(--demo-fg);
	cursor: pointer;
	min-height: 40px;
	padding: 9px 10px;
	text-align: left;
}

.ios-lab-layout {
	display: grid;
	gap: 12px;
	grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
}

.ios-lab-panel,
.ios-lab-page {
	background: var(--demo-card);
	border: 1px solid var(--demo-border);
	border-radius: 8px;
	padding: 14px;
}

.ios-lab-panel {
	display: grid;
	gap: 12px;
}

.ios-lab-panel h3 {
	font-size: 16px;
	margin: 0;
}

.ios-lab-page {
	display: grid;
	gap: 10px;
}

.ios-lab-page p,
.ios-lab-drawer-body p {
	background: var(--demo-row);
	border: 1px solid var(--demo-border);
	border-radius: 7px;
	margin: 0;
	padding: 10px;
}

.demo-content--ios-lab {
	--ios-lab-drawer-height: min(86vh, 680px);
	height: var(--ios-lab-drawer-height);
	max-height: var(--ios-lab-drawer-height);
}

@supports (height: 100svh) {
	.demo-content--ios-lab {
		--ios-lab-drawer-height: min(86svh, 680px);
	}
}

.ios-lab-drawer-body {
	display: grid;
	gap: 10px;
	padding-bottom: max(16px, env(safe-area-inset-bottom));
}

@media (max-width: 680px) {
	.page {
		padding: 18px 12px 40px;
	}

	.header {
		align-items: start;
		flex-direction: column;
	}

	.panel {
		padding: 14px;
	}

	.header h1 {
		font-size: 32px;
	}

	.tabs button {
		flex: 1 1 auto;
	}
}
</style>
