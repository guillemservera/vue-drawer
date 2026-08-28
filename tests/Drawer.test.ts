import { mount } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, h, nextTick, ref } from 'vue'
import DrawerHandle from '../src/components/DrawerHandle.vue'
import DrawerOverlay from '../src/components/DrawerOverlay.vue'
import DrawerPortal from '../src/components/DrawerPortal.vue'
import DrawerContent from '../src/components/DrawerContent.vue'
import DrawerRoot from '../src/components/DrawerRoot.vue'
import { clearDrawerDismissableLayersForTest } from '../src/composables/useDrawerDismissableLayer'
import { clearEscapeLayersForTest } from '../src/composables/useDrawerEscapeLayer'
import type { DrawerSnapPoint } from '../src/utils/drawerTypes'

vi.mock('../src/composables/useDrawerScrollLock', () => ({
	useDrawerScrollLock: () => undefined,
}))

function createPointerEvent(type: string, pointerId: number, pageY: number) {
	const event = new PointerEvent(type, {
		bubbles: true,
		cancelable: true,
		clientX: 0,
		clientY: pageY,
	})

	Object.defineProperties(event, {
		pageY: {
			configurable: true,
			value: pageY,
		},
		pointerId: {
			configurable: true,
			value: pointerId,
		},
		pointerType: {
			configurable: true,
			value: 'mouse',
		},
	})

	return event
}

const PortableDemoHarness = defineComponent({
	components: {
		DrawerContent,
		DrawerHandle,
		DrawerOverlay,
		DrawerPortal,
		DrawerRoot,
	},
	setup() {
		const open = ref(true)
		const activeSnapPoint = ref<DrawerSnapPoint | null>('160px')
		const snapPoints: DrawerSnapPoint[] = ['160px', 0.55, 0.92]

		return {
			activeSnapPoint,
			open,
			snapPoints,
		}
	},
	template: `
		<DrawerRoot
			v-model:open="open"
			v-model:active-snap-point="activeSnapPoint"
			:snap-points="snapPoints"
			default-snap-point="160px"
			:fade-from-index="1"
		>
			<DrawerPortal>
				<DrawerOverlay class="demo-overlay" />
				<DrawerContent class="demo-content" aria-label="Portable demo drawer">
					<DrawerHandle class="demo-handle" />
					<button class="demo-focus-target" type="button">Focusable content</button>
				</DrawerContent>
			</DrawerPortal>
		</DrawerRoot>
	`,
})

describe('Drawer', () => {
	afterEach(() => {
		clearDrawerDismissableLayersForTest()
		clearEscapeLayersForTest()
		vi.useRealTimers()
	})

	it('emits content:error and closes when a child throws during render', async () => {
		const Boom = defineComponent({
			name: 'Boom',
			setup() {
				return () => {
					throw new Error('drawer content render failed')
				}
			},
		})

		const wrapper = mount(DrawerRoot, {
			props: {
				defaultOpen: true,
			},
			slots: {
				default: () => h(DrawerContent, null, {
					default: () => h(Boom),
				}),
			},
			global: {
				stubs: {
					Transition: false,
				},
			},
		})

		await nextTick()

		expect(wrapper.emitted('content:error')).toBeTruthy()
		expect(wrapper.emitted('update:open')?.at(-1)).toEqual([false])
	})

	it('supports portal demo dismissal through Escape, overlay pointerdown, and handle drag', async () => {
		vi.useFakeTimers()

		const wrapper = mount(PortableDemoHarness, {
			attachTo: document.body,
			global: {
				stubs: {
					Transition: false,
				},
			},
		})

		await nextTick()

		document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }))
		await nextTick()

		expect((wrapper.vm as unknown as { open: boolean }).open).toBe(false)

		;(wrapper.vm as unknown as { open: boolean }).open = true
		await nextTick()

		const overlay = document.querySelector<HTMLElement>('[data-drawer-overlay]')!
		const overlayPointerDown = new PointerEvent('pointerdown', { bubbles: true, cancelable: true })
		overlay.dispatchEvent(overlayPointerDown)
		await nextTick()

		expect(overlayPointerDown.defaultPrevented).toBe(true)
		expect((wrapper.vm as unknown as { open: boolean }).open).toBe(false)

		;(wrapper.vm as unknown as { open: boolean }).open = true
		await nextTick()
		vi.advanceTimersByTime(600)

		const content = document.querySelector<HTMLElement>('[data-drawer-content]')!
		const handle = document.querySelector<HTMLElement>('[data-drawer-handle]')!

		Object.defineProperties(content, {
			getBoundingClientRect: {
				configurable: true,
				value: () => ({
					bottom: 640,
					height: 640,
					left: 0,
					right: 360,
					top: 0,
					width: 360,
					x: 0,
					y: 0,
					toJSON: () => ({}),
				}),
			},
			offsetHeight: {
				configurable: true,
				value: 640,
			},
		})

		handle.dispatchEvent(createPointerEvent('pointerdown', 1, 0))
		handle.dispatchEvent(createPointerEvent('pointermove', 1, 180))
		handle.dispatchEvent(createPointerEvent('pointerup', 1, 180))
		await nextTick()

		expect((wrapper.vm as unknown as { open: boolean }).open).toBe(false)

		wrapper.unmount()
		vi.useRealTimers()
	})
})
