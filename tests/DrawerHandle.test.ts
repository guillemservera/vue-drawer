import { mount } from '@vue/test-utils'
import { defineComponent, nextTick, ref } from 'vue'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { DrawerSnapPoint } from '../src/utils/drawerTypes'
import DrawerContent from '../src/components/DrawerContent.vue'
import DrawerHandle from '../src/components/DrawerHandle.vue'
import DrawerOverlay from '../src/components/DrawerOverlay.vue'
import DrawerRoot from '../src/components/DrawerRoot.vue'

vi.mock('../src/composables/useDrawerScrollLock', () => ({
	useDrawerScrollLock: () => undefined,
}))

const Harness = defineComponent({
	components: {
		DrawerContent,
		DrawerHandle,
		DrawerOverlay,
		DrawerRoot,
	},
	props: {
		preventCycle: {
			type: Boolean,
			default: false,
		},
	},
	setup() {
		const open = ref(true)
		const activeSnapPoint = ref<DrawerSnapPoint | null>('80px')
		const snapPoints: DrawerSnapPoint[] = ['80px', 0.5, 1]

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
		>
			<DrawerOverlay />
			<DrawerContent aria-label="Test drawer">
				<DrawerHandle :prevent-cycle="preventCycle" />
			</DrawerContent>
		</DrawerRoot>
	`,
})

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

describe('DrawerHandle', () => {
	beforeEach(() => {
		vi.useFakeTimers()
	})

	afterEach(() => {
		vi.useRealTimers()
	})

	async function mountHarness(preventCycle = false) {
		const wrapper = mount(Harness, {
			attachTo: document.body,
			props: {
				preventCycle,
			},
			global: {
				stubs: {
					Transition: false,
				},
			},
		})

		await nextTick()
		return wrapper
	}

	it('cycles to the next snap point when clicked', async () => {
		const wrapper = await mountHarness()

		await wrapper.get('[data-drawer-handle]').trigger('click')
		vi.advanceTimersByTime(120)
		await nextTick()

		expect((wrapper.vm as unknown as { activeSnapPoint: DrawerSnapPoint | null }).activeSnapPoint).toBe(0.5)

		wrapper.unmount()
	})

	it('closes from the last snap point when the drawer is dismissible', async () => {
		const wrapper = await mountHarness()
		;(wrapper.vm as unknown as { activeSnapPoint: DrawerSnapPoint | null }).activeSnapPoint = 1
		await nextTick()

		await wrapper.get('[data-drawer-handle]').trigger('click')
		vi.advanceTimersByTime(120)
		await nextTick()

		expect((wrapper.vm as unknown as { open: boolean }).open).toBe(false)

		wrapper.unmount()
	})

	it('respects preventCycle', async () => {
		const wrapper = await mountHarness(true)

		await wrapper.get('[data-drawer-handle]').trigger('click')
		vi.advanceTimersByTime(120)
		await nextTick()

		expect((wrapper.vm as unknown as { activeSnapPoint: DrawerSnapPoint | null }).activeSnapPoint).toBe('80px')

		wrapper.unmount()
	})

	it('cancels handle cycling after a long press', async () => {
		const wrapper = await mountHarness()
		const handle = wrapper.get('[data-drawer-handle]')

		await handle.trigger('pointerdown', { pageX: 0, pageY: 0 })
		vi.advanceTimersByTime(250)
		await handle.trigger('pointerup', { pageX: 0, pageY: 0 })
		await handle.trigger('click')
		vi.advanceTimersByTime(120)
		await nextTick()

		expect((wrapper.vm as unknown as { activeSnapPoint: DrawerSnapPoint | null }).activeSnapPoint).toBe('80px')

		wrapper.unmount()
	})

	it('closes from a desktop handle drag', async () => {
		const wrapper = await mountHarness()
		const content = wrapper.get('[data-drawer-content]').element as HTMLElement
		const handle = wrapper.get('[data-drawer-handle]').element as HTMLElement

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

		vi.advanceTimersByTime(600)

		handle.dispatchEvent(createPointerEvent('pointerdown', 1, 0))
		handle.dispatchEvent(createPointerEvent('pointermove', 1, 120))
		handle.dispatchEvent(createPointerEvent('pointerup', 1, 120))
		await nextTick()

		expect((wrapper.vm as unknown as { open: boolean }).open).toBe(false)

		wrapper.unmount()
	})
})
