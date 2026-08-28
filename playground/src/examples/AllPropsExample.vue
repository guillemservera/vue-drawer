<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import type { DrawerAnimation, DrawerDirection, DrawerRootProps, DrawerSnapPoint } from '@guillemservera/vue-drawer'
import {
	DrawerContent,
	DrawerDescription,
	DrawerHandle,
	DrawerOverlay,
	DrawerPortal,
	DrawerRoot,
	DrawerRootNested,
	DrawerTitle,
} from '@guillemservera/vue-drawer'
import { contentClass, fadeTimingStyle, handleClass, overlayClass } from './demoClasses'

const props = defineProps<{ styled: boolean }>()

interface SnapPreset {
	id: string
	label: string
	points: DrawerSnapPoint[]
}

const directions: DrawerDirection[] = ['bottom', 'right', 'top', 'left']
const animations: DrawerAnimation[] = ['slide', 'fade']
const snapPresets: SnapPreset[] = [
	{ id: 'mixed', label: 'Mixed', points: ['160px', 0.55, 0.92] },
	{ id: 'percent', label: 'Percent', points: [0.25, 0.55, 1] },
	{ id: 'pixels', label: 'Pixels', points: ['120px', '320px', '560px'] },
]

const drawerKey = ref(0)
const controlledOpen = ref(true)
const open = ref(false)
const defaultOpen = ref(false)
const observedOpen = ref(false)

const direction = ref<DrawerDirection>('bottom')
const animation = ref<DrawerAnimation>('slide')
const closeAnimation = ref<DrawerAnimation>('slide')
const fadeEnterDuration = ref(260)
const fadeLeaveDuration = ref(180)
const fadeOffset = ref(0)
const modal = ref(true)
const dismissible = ref(true)
const instantClose = ref(false)
const autoFocus = ref(false)
const handleOnly = ref(false)
const repositionInputs = ref(true)
const fixed = ref(false)
const preventScroll = ref(true)
const noBodyStyles = ref(false)
const preventScrollRestoration = ref(false)
const closeThreshold = ref(0.25)
const scrollLockTimeout = ref(500)
const renderOverlay = ref(true)
const renderHandle = ref(true)

const snapPointsEnabled = ref(true)
const snapToSequentialPoint = ref(false)
const controlledSnapPoint = ref(true)
const selectedSnapPresetId = ref('mixed')
const activeSnapPointIndex = ref(0)
const defaultSnapPointIndex = ref(0)
const observedActiveSnapPoint = ref<DrawerSnapPoint | null>('160px')
const fadeFromIndex = ref(-1)

const nestedEnabled = ref(true)
const nestedOpen = ref(false)

const selectedSnapPreset = computed(() => {
	return snapPresets.find(preset => preset.id === selectedSnapPresetId.value) ?? snapPresets[0]!
})
const currentSnapPoints = computed(() => snapPointsEnabled.value ? selectedSnapPreset.value.points : undefined)
const activeSnapPoint = computed(() => currentSnapPoints.value?.[activeSnapPointIndex.value] ?? null)
const defaultSnapPoint = computed(() => currentSnapPoints.value?.[defaultSnapPointIndex.value] ?? null)
const resolvedFadeFromIndex = computed(() => {
	const points = currentSnapPoints.value
	if (!points?.length || fadeFromIndex.value < 0) return undefined
	return Math.min(fadeFromIndex.value, points.length - 1)
})
const rootProps = computed<DrawerRootProps>(() => {
	const config: DrawerRootProps = {
		modal: modal.value,
		dismissible: dismissible.value,
		instantClose: instantClose.value,
		autoFocus: autoFocus.value,
		handleOnly: handleOnly.value,
		repositionInputs: repositionInputs.value,
		fixed: fixed.value,
		preventScroll: preventScroll.value,
		noBodyStyles: noBodyStyles.value,
		animation: animation.value,
		closeAnimation: closeAnimation.value,
		direction: direction.value,
		closeThreshold: closeThreshold.value,
		scrollLockTimeout: scrollLockTimeout.value,
		preventScrollRestoration: preventScrollRestoration.value,
		snapToSequentialPoint: snapToSequentialPoint.value,
	}

	if (controlledOpen.value) {
		config.open = open.value
	}
	else {
		config.defaultOpen = defaultOpen.value
	}

	if (currentSnapPoints.value) {
		config.snapPoints = currentSnapPoints.value
		config.fadeFromIndex = resolvedFadeFromIndex.value
		if (controlledSnapPoint.value) {
			config.activeSnapPoint = activeSnapPoint.value
		}
		else {
			config.defaultSnapPoint = defaultSnapPoint.value
		}
	}

	return config
})
const content = computed(() => contentClass(props.styled, direction.value))
const nestedContent = computed(() => `${contentClass(props.styled, direction.value)} demo-content--nested`)
const shouldRenderOverlay = computed(() => renderOverlay.value && modal.value)
const usesFadeAnimation = computed(() => animation.value === 'fade' || closeAnimation.value === 'fade')
const contentStyle = computed(() => {
	if (!usesFadeAnimation.value) return undefined
	return fadeTimingStyle({
		enterDuration: fadeEnterDuration.value,
		leaveDuration: fadeLeaveDuration.value,
		offset: fadeOffset.value,
	})
})
const overlay = computed(() => overlayClass(props.styled))
const nestedOverlay = computed(() => `${overlayClass(props.styled)} demo-overlay--nested`)
const handle = computed(() => handleClass(props.styled))
const openModeLabel = computed(() => controlledOpen.value ? 'controlled' : 'defaultOpen')
const activeSnapPointLabel = computed(() => formatSnapPoint(observedActiveSnapPoint.value))
const fadeLabel = computed(() => resolvedFadeFromIndex.value === undefined ? 'default' : String(resolvedFadeFromIndex.value))

watch(selectedSnapPresetId, () => {
	activeSnapPointIndex.value = 0
	defaultSnapPointIndex.value = 0
	observedActiveSnapPoint.value = activeSnapPoint.value
	resetDrawer()
})

watch(snapPointsEnabled, (enabled) => {
	observedActiveSnapPoint.value = enabled ? activeSnapPoint.value : null
	resetDrawer()
})

watch(controlledOpen, () => {
	resetDrawer()
})

watch(defaultOpen, () => {
	if (!controlledOpen.value) resetDrawer()
})

watch(open, (value) => {
	if (controlledOpen.value) observedOpen.value = value
})

watch(defaultSnapPointIndex, () => {
	if (!controlledSnapPoint.value) resetDrawer()
})

watch(controlledSnapPoint, (controlled) => {
	if (!controlled) defaultSnapPointIndex.value = activeSnapPointIndex.value
	resetDrawer()
})

function openDrawer() {
	if (controlledOpen.value) {
		open.value = true
		return
	}

	defaultOpen.value = true
	resetDrawer()
}

function closeDrawer() {
	if (controlledOpen.value) {
		open.value = false
		return
	}

	defaultOpen.value = false
	resetDrawer()
}

function resetDrawer() {
	nestedOpen.value = false
	observedOpen.value = controlledOpen.value ? open.value : defaultOpen.value
	drawerKey.value += 1
}

function handleOpenUpdate(value: boolean) {
	observedOpen.value = value
	if (controlledOpen.value) {
		open.value = value
	}
}

function handleActiveSnapPointUpdate(value: DrawerSnapPoint | null) {
	observedActiveSnapPoint.value = value
	if (!controlledSnapPoint.value) return

	const index = currentSnapPoints.value?.findIndex(snapPoint => snapPoint === value) ?? -1
	if (index >= 0) {
		activeSnapPointIndex.value = index
	}
}

function updateActiveSnapPoint(index: number) {
	activeSnapPointIndex.value = index
	if (controlledSnapPoint.value) {
		observedActiveSnapPoint.value = activeSnapPoint.value
		return
	}

	defaultSnapPointIndex.value = index
	observedActiveSnapPoint.value = defaultSnapPoint.value
	resetDrawer()
}

function handleActiveSnapPointSelect(event: Event) {
	const target = event.target
	if (!(target instanceof HTMLSelectElement)) return
	updateActiveSnapPoint(Number(target.value))
}

function formatSnapPoint(snapPoint: DrawerSnapPoint | null) {
	if (snapPoint === null) return 'none'
	return typeof snapPoint === 'number' ? String(snapPoint) : snapPoint
}
</script>

<template>
	<section class="demo-stack">
		<div class="demo-copy">
			<h2>Props lab</h2>
			<p>Control every DrawerRoot option from one place, including controlled state, snap points, dismissal and nested behavior.</p>
		</div>

		<div class="props-lab">
			<form class="props-panel" @submit.prevent>
				<fieldset class="props-group">
					<legend>State</legend>
					<label class="demo-toggle">
						<input v-model="controlledOpen" type="checkbox">
						<span>open controlled</span>
					</label>
					<label class="demo-toggle">
						<input v-model="defaultOpen" type="checkbox">
						<span>defaultOpen</span>
					</label>
					<div class="demo-inline-actions">
						<button class="demo-button" type="button" @click="openDrawer">
							Open
						</button>
						<button class="demo-choice" type="button" @click="closeDrawer">
							Close
						</button>
						<button class="demo-choice" type="button" @click="resetDrawer">
							Reset root
						</button>
					</div>
				</fieldset>

				<fieldset class="props-group">
					<legend>Behavior</legend>
					<div class="demo-segmented" role="group" aria-label="Direction">
						<button
							v-for="option in directions"
							:key="option"
							type="button"
							:data-active="direction === option ? 'true' : 'false'"
							@click="direction = option"
						>
							{{ option }}
						</button>
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
					<div
						class="demo-segmented"
						role="group"
						aria-label="Close animation"
					>
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
					<label v-if="usesFadeAnimation" class="demo-field">
						<span>fade in: {{ fadeEnterDuration }}ms</span>
						<input v-model.number="fadeEnterDuration" type="range" min="160" max="520" step="10">
					</label>
					<label v-if="usesFadeAnimation" class="demo-field">
						<span>fade out: {{ fadeLeaveDuration }}ms</span>
						<input v-model.number="fadeLeaveDuration" type="range" min="120" max="420" step="10">
					</label>
					<label v-if="usesFadeAnimation" class="demo-field">
						<span>fade offset: {{ fadeOffset }}px</span>
						<input v-model.number="fadeOffset" type="range" min="0" max="12" step="1">
					</label>
					<label class="demo-toggle">
						<input v-model="modal" type="checkbox">
						<span>modal</span>
					</label>
					<label class="demo-toggle">
						<input v-model="dismissible" type="checkbox">
						<span>dismissible</span>
					</label>
					<label class="demo-toggle">
						<input v-model="instantClose" type="checkbox">
						<span>instantClose</span>
					</label>
					<label class="demo-toggle">
						<input v-model="autoFocus" type="checkbox">
						<span>autoFocus</span>
					</label>
					<label class="demo-toggle">
						<input v-model="handleOnly" type="checkbox">
						<span>handleOnly</span>
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
					<label class="demo-field">
						<span>closeThreshold: {{ closeThreshold.toFixed(2) }}</span>
						<input v-model.number="closeThreshold" type="range" min="0.05" max="0.8" step="0.05">
					</label>
					<label class="demo-field">
						<span>scrollLockTimeout</span>
						<input v-model.number="scrollLockTimeout" type="number" min="0" max="2500" step="50">
					</label>
				</fieldset>

				<fieldset class="props-group">
					<legend>Parts</legend>
					<label class="demo-toggle">
						<input v-model="renderOverlay" type="checkbox">
						<span>DrawerOverlay</span>
					</label>
					<label class="demo-toggle">
						<input v-model="renderHandle" type="checkbox">
						<span>DrawerHandle</span>
					</label>
				</fieldset>

				<fieldset class="props-group">
					<legend>Snap points</legend>
					<label class="demo-toggle">
						<input v-model="snapPointsEnabled" type="checkbox">
						<span>snapPoints</span>
					</label>
					<label class="demo-field">
						<span>preset</span>
						<select v-model="selectedSnapPresetId">
							<option v-for="preset in snapPresets" :key="preset.id" :value="preset.id">
								{{ preset.label }}
							</option>
						</select>
					</label>
					<label class="demo-toggle">
						<input v-model="controlledSnapPoint" type="checkbox">
						<span>activeSnapPoint controlled</span>
					</label>
					<label class="demo-toggle">
						<input v-model="snapToSequentialPoint" type="checkbox">
						<span>snapToSequentialPoint</span>
					</label>
					<label class="demo-field">
						<span>activeSnapPoint</span>
						<select
							:value="activeSnapPointIndex"
							:disabled="!snapPointsEnabled"
							@change="handleActiveSnapPointSelect"
						>
							<option v-for="(snapPoint, index) in currentSnapPoints" :key="`${snapPoint}-${index}`" :value="index">
								{{ formatSnapPoint(snapPoint) }}
							</option>
						</select>
					</label>
					<label class="demo-field">
						<span>defaultSnapPoint</span>
						<select v-model.number="defaultSnapPointIndex" :disabled="!snapPointsEnabled || controlledSnapPoint">
							<option v-for="(snapPoint, index) in currentSnapPoints" :key="`${snapPoint}-${index}`" :value="index">
								{{ formatSnapPoint(snapPoint) }}
							</option>
						</select>
					</label>
					<label class="demo-field">
						<span>fadeFromIndex</span>
						<select v-model.number="fadeFromIndex" :disabled="!snapPointsEnabled">
							<option :value="-1">default</option>
							<option v-for="(_, index) in currentSnapPoints" :key="index" :value="index">
								{{ index }}
							</option>
						</select>
					</label>
				</fieldset>

				<fieldset class="props-group">
					<legend>Nested</legend>
					<label class="demo-toggle">
						<input v-model="nestedEnabled" type="checkbox">
						<span>DrawerRootNested</span>
					</label>
				</fieldset>
			</form>

			<div class="props-preview">
				<DrawerRoot
					:key="drawerKey"
					v-bind="rootProps"
					@update:open="handleOpenUpdate"
					@update:active-snap-point="handleActiveSnapPointUpdate"
				>
					<div class="demo-inline-actions">
						<button class="demo-button" type="button" @click="openDrawer">
							Open configured drawer
						</button>
						<button class="demo-choice" type="button" @click="resetDrawer">
							Reset root
						</button>
					</div>

					<dl class="demo-metrics props-readout">
						<div>
							<dt>open</dt>
							<dd>{{ observedOpen }}</dd>
						</div>
						<div>
							<dt>open mode</dt>
							<dd>{{ openModeLabel }}</dd>
						</div>
						<div>
							<dt>activeSnapPoint</dt>
							<dd>{{ activeSnapPointLabel }}</dd>
						</div>
						<div>
							<dt>fadeFromIndex</dt>
							<dd>{{ fadeLabel }}</dd>
						</div>
					</dl>

					<DrawerPortal>
						<DrawerOverlay v-if="shouldRenderOverlay" :class="overlay" />
						<DrawerContent :class="content" :style="contentStyle">
							<DrawerHandle v-if="renderHandle" :class="handle" />
							<DrawerTitle class="demo-title">Configured drawer</DrawerTitle>
							<DrawerDescription class="demo-description">
								{{ direction }} · {{ modal ? 'modal' : 'non-modal' }} · {{ dismissible ? 'dismissible' : 'locked' }}
							</DrawerDescription>

							<dl class="demo-metrics">
								<div>
									<dt>closeThreshold</dt>
									<dd>{{ closeThreshold.toFixed(2) }}</dd>
								</div>
								<div>
									<dt>animation</dt>
									<dd>{{ animation }}</dd>
								</div>
								<div>
									<dt>closeAnimation</dt>
									<dd>{{ closeAnimation }}</dd>
								</div>
								<div>
									<dt>scrollLockTimeout</dt>
									<dd>{{ scrollLockTimeout }}ms</dd>
								</div>
								<div>
									<dt>snapToSequentialPoint</dt>
									<dd>{{ snapToSequentialPoint }}</dd>
								</div>
								<div>
									<dt>instantClose</dt>
									<dd>{{ instantClose }}</dd>
								</div>
								<div>
									<dt>autoFocus</dt>
									<dd>{{ autoFocus }}</dd>
								</div>
								<div>
									<dt>handleOnly</dt>
									<dd>{{ handleOnly }}</dd>
								</div>
								<div>
									<dt>repositionInputs</dt>
									<dd>{{ repositionInputs }}</dd>
								</div>
								<div>
									<dt>fixed</dt>
									<dd>{{ fixed }}</dd>
								</div>
								<div>
									<dt>preventScroll</dt>
									<dd>{{ preventScroll }}</dd>
								</div>
								<div>
									<dt>noBodyStyles</dt>
									<dd>{{ noBodyStyles }}</dd>
								</div>
							</dl>

							<div v-if="snapPointsEnabled" class="demo-grid">
								<button
									v-for="(snapPoint, index) in currentSnapPoints"
									:key="`${snapPoint}-${index}`"
									class="demo-choice"
									type="button"
									@click="updateActiveSnapPoint(index)"
								>
									{{ formatSnapPoint(snapPoint) }}
								</button>
							</div>

							<div class="demo-long-list">
								<p v-for="index in 8" :key="index">
									Drawer row {{ index }}
								</p>
							</div>

							<DrawerRootNested
								v-if="nestedEnabled"
								v-model:open="nestedOpen"
								:direction="direction"
								:dismissible="dismissible"
								:modal="modal"
							>
								<button class="demo-button demo-button--full" type="button" @click="nestedOpen = true">
									Open nested drawer
								</button>

								<DrawerPortal>
									<DrawerOverlay v-if="shouldRenderOverlay" :class="nestedOverlay" />
									<DrawerContent :class="nestedContent" :style="contentStyle">
										<DrawerHandle v-if="renderHandle" :class="handle" />
										<DrawerTitle class="demo-title">Nested configured drawer</DrawerTitle>
										<DrawerDescription class="demo-description">
											Nested root uses the same direction, modal and dismissible settings.
										</DrawerDescription>
										<button class="demo-button demo-button--full" type="button" @click="nestedOpen = false">
											Close nested drawer
										</button>
									</DrawerContent>
								</DrawerPortal>
							</DrawerRootNested>

							<button class="demo-button demo-button--full" type="button" @click="closeDrawer">
								Close drawer
							</button>
						</DrawerContent>
					</DrawerPortal>
				</DrawerRoot>
			</div>
		</div>
	</section>
</template>

<style scoped>
.props-lab {
	display: grid;
	gap: 18px;
	grid-template-columns: minmax(260px, 340px) 1fr;
}

.props-panel,
.props-preview {
	display: grid;
	gap: 14px;
}

.props-group {
	background: var(--demo-card);
	border: 1px solid var(--demo-border);
	border-radius: 8px;
	display: grid;
	gap: 12px;
	margin: 0;
	padding: 14px;
}

.props-group legend {
	color: var(--demo-fg);
	font-size: 13px;
	font-weight: 800;
	padding-inline: 4px;
}

.demo-field,
.demo-toggle {
	color: var(--demo-field);
	display: grid;
	font-size: 14px;
	font-weight: 700;
	gap: 7px;
}

.demo-toggle {
	align-items: center;
	grid-template-columns: 18px 1fr;
}

.demo-field input,
.demo-field select {
	background: var(--demo-card);
	border: 1px solid var(--demo-control-border);
	border-radius: 7px;
	color: var(--demo-fg);
	min-height: 38px;
	padding: 7px 9px;
	width: 100%;
}

.demo-field input[type='range'] {
	min-height: 24px;
	padding: 0;
}

.props-readout {
	background: var(--demo-card);
	border: 1px solid var(--demo-border);
	border-radius: 8px;
	padding: 12px;
}

@media (max-width: 680px) {
	.props-lab {
		grid-template-columns: 1fr;
	}
}
</style>
