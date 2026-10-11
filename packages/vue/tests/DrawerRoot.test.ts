import { mount } from '@vue/test-utils'
import { defineComponent, nextTick, ref } from 'vue'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useDrawerRootContext } from '../src/utils/drawerContext'
import DrawerContent from '../src/components/DrawerContent.vue'
import DrawerOverlay from '../src/components/DrawerOverlay.vue'
import DrawerRoot from '../src/components/DrawerRoot.vue'

const scrollLockHarness = vi.hoisted(() => ({
	calls: [] as Array<{ open: { value: boolean } }>,
}))

vi.mock('../src/composables/useDrawerScrollLock', () => ({
	useDrawerScrollLock: (options: { open: { value: boolean } }) => {
		scrollLockHarness.calls.push(options)
	},
}))

const ContextProbe = defineComponent({
	setup(_, { expose }) {
		const root = useDrawerRootContext()
		expose({ root })
		return () => null
	},
})

const Harness = defineComponent({
	components: {
		ContextProbe,
		DrawerContent,
		DrawerOverlay,
		DrawerRoot,
	},
	setup() {
		const open = ref(true)
		return {
			open,
		}
	},
	template: `
		<DrawerRoot v-model:open="open">
			<DrawerOverlay />
			<DrawerContent aria-label="Test drawer" />
			<ContextProbe ref="probe" />
		</DrawerRoot>
	`,
})

const UncontrolledHarness = defineComponent({
	components: {
		ContextProbe,
		DrawerContent,
		DrawerOverlay,
		DrawerRoot,
	},
	template: `
		<DrawerRoot default-open>
			<DrawerOverlay />
			<DrawerContent aria-label="Test drawer" />
			<ContextProbe ref="probe" />
		</DrawerRoot>
	`,
})

const InstantCloseHarness = defineComponent({
	components: {
		ContextProbe,
		DrawerContent,
		DrawerOverlay,
		DrawerRoot,
	},
	setup() {
		const open = ref(true)
		return {
			open,
		}
	},
	template: `
		<DrawerRoot v-model:open="open">
			<DrawerOverlay style="--drawer-duration: 1ms; --drawer-duration-ms: 1;" />
			<DrawerContent aria-label="Test drawer" style="--drawer-duration: 1ms; --drawer-duration-ms: 1;" />
			<ContextProbe ref="probe" />
		</DrawerRoot>
	`,
})

const ForcedInstantCloseHarness = defineComponent({
	components: {
		ContextProbe,
		DrawerContent,
		DrawerOverlay,
		DrawerRoot,
	},
	setup() {
		const open = ref(true)
		return {
			open,
		}
	},
	template: `
		<DrawerRoot
			v-model:open="open"
			:instant-close="true"
		>
			<DrawerOverlay />
			<DrawerContent aria-label="Test drawer" />
			<ContextProbe ref="probe" />
		</DrawerRoot>
	`,
})

const FadeAnimationHarness = defineComponent({
	components: {
		ContextProbe,
		DrawerContent,
		DrawerOverlay,
		DrawerRoot,
	},
	setup() {
		const open = ref(true)
		return {
			open,
		}
	},
	template: `
		<DrawerRoot
			v-model:open="open"
			animation="fade"
		>
			<DrawerOverlay />
			<DrawerContent aria-label="Test drawer" />
			<ContextProbe ref="probe" />
		</DrawerRoot>
	`,
})

const CloseDurationHarness = defineComponent({
	components: {
		ContextProbe,
		DrawerContent,
		DrawerOverlay,
		DrawerRoot,
	},
	template: `
		<DrawerRoot default-open>
			<DrawerOverlay
				style="--drawer-duration-ms: 180; --drawer-ease: ease-out; --drawer-close-duration-ms: 140; --drawer-close-ease: ease-in;"
			/>
			<DrawerContent
				aria-label="Test drawer"
				style="--drawer-duration-ms: 420; --drawer-ease: ease; --drawer-close-duration-ms: 240; --drawer-close-ease: ease-out;"
			/>
			<ContextProbe ref="probe" />
		</DrawerRoot>
	`,
})

const SnapPointsHarness = defineComponent({
	components: {
		ContextProbe,
		DrawerContent,
		DrawerOverlay,
		DrawerRoot,
	},
	template: `
		<DrawerRoot
			default-open
			:snap-points="['80px', 0.5, 1]"
			:default-snap-point="1"
		>
			<DrawerOverlay />
			<DrawerContent aria-label="Test drawer" />
			<ContextProbe ref="probe" />
		</DrawerRoot>
	`,
})

const ControlledSnapPointsHarness = defineComponent({
	components: {
		ContextProbe,
		DrawerContent,
		DrawerOverlay,
		DrawerRoot,
	},
	setup() {
		const activeSnapPoint = ref<number | string | null>('80px')
		return {
			activeSnapPoint,
		}
	},
	template: `
		<DrawerRoot
			default-open
			v-model:active-snap-point="activeSnapPoint"
			:snap-points="['80px', 0.5, 1]"
			:fade-from-index="1"
		>
			<DrawerOverlay />
			<DrawerContent aria-label="Test drawer" />
			<ContextProbe ref="probe" />
		</DrawerRoot>
	`,
})

const ContainerSnapPointsHarness = defineComponent({
	components: {
		ContextProbe,
		DrawerContent,
		DrawerOverlay,
		DrawerRoot,
	},
	setup() {
		const container = ref<HTMLElement | null>(null)
		const activeSnapPoint = ref<number | string | null>('80px')
		return {
			activeSnapPoint,
			container,
		}
	},
	template: `
		<div ref="container" class="snap-container">
			<DrawerRoot
				default-open
				:container="container"
				v-model:active-snap-point="activeSnapPoint"
				:snap-points="['80px', 0.5, 1]"
			>
				<DrawerOverlay />
				<DrawerContent aria-label="Test drawer" />
				<ContextProbe ref="probe" />
			</DrawerRoot>
		</div>
	`,
})

function createTouchPointerEvent(type: string, clientY: number) {
	const event = new PointerEvent(type, {
		bubbles: true,
		cancelable: true,
		clientX: 0,
		clientY,
	})

	Object.defineProperty(event, 'pointerId', {
		configurable: true,
		value: 1,
	})
	Object.defineProperty(event, 'pointerType', {
		configurable: true,
		value: 'touch',
	})

	return event
}

describe('DrawerRoot', () => {
	beforeEach(() => {
		vi.useFakeTimers()
		vi.setSystemTime(new Date('2026-03-20T12:00:00.000Z'))
		scrollLockHarness.calls = []
	})

	afterEach(() => {
		vi.useRealTimers()
	})

	it('detects instant close timing when the drawer is closed externally', async () => {
		const wrapper = mount(InstantCloseHarness, {
			attachTo: document.body,
			global: {
				stubs: {
					Transition: false,
				},
			},
		})

		await nextTick()

		const probe = wrapper.getComponent(ContextProbe).vm.$.exposed as {
			root: ReturnType<typeof useDrawerRootContext>
		}

		;(wrapper.vm as unknown as { open: boolean }).open = false
		await nextTick()

		expect(probe.root.skipCloseAnimation.value).toBe(true)

		wrapper.unmount()
	})

	it('keeps scroll lock active until the close transition finishes', async () => {
		const wrapper = mount(UncontrolledHarness, {
			attachTo: document.body,
			global: {
				stubs: {
					Transition: false,
				},
			},
		})

		await nextTick()

		const probe = wrapper.getComponent(ContextProbe).vm.$.exposed as {
			root: ReturnType<typeof useDrawerRootContext>
		}
		const scrollLockOpen = scrollLockHarness.calls.at(-1)?.open

		expect(scrollLockOpen?.value).toBe(true)

		probe.root.requestOpenChange(false)
		expect(probe.root.open.value).toBe(false)
		expect(scrollLockOpen?.value).toBe(true)

		probe.root.handleAfterClose()
		expect(scrollLockOpen?.value).toBe(false)

		wrapper.unmount()
	})

	it('forces instant close when the root opts into it explicitly', async () => {
		const wrapper = mount(ForcedInstantCloseHarness, {
			attachTo: document.body,
			global: {
				stubs: {
					Transition: false,
				},
			},
		})

		await nextTick()

		const probe = wrapper.getComponent(ContextProbe).vm.$.exposed as {
			root: ReturnType<typeof useDrawerRootContext>
		}

		;(wrapper.vm as unknown as { open: boolean }).open = false
		await nextTick()

		expect(probe.root.skipCloseAnimation.value).toBe(true)

		wrapper.unmount()
	})

	it('exposes fade content animation as a root option', async () => {
		const wrapper = mount(FadeAnimationHarness, {
			attachTo: document.body,
			global: {
				stubs: {
					Transition: false,
				},
			},
		})

		await nextTick()

		const probe = wrapper.getComponent(ContextProbe).vm.$.exposed as {
			root: ReturnType<typeof useDrawerRootContext>
		}

		expect(probe.root.animation.value).toBe('fade')
		expect(wrapper.get('[data-drawer-content]').attributes('data-animation')).toBe('fade')

		wrapper.unmount()
	})

	it('keeps backdrop timing independent from drawer movement', async () => {
		const wrapper = mount(CloseDurationHarness, {
			attachTo: document.body,
			global: {
				stubs: {
					Transition: false,
				},
			},
		})

		await nextTick()

		const probe = wrapper.getComponent(ContextProbe).vm.$.exposed as {
			root: ReturnType<typeof useDrawerRootContext>
		}

		expect(probe.root.getContentTransition()).toBe('transform 420ms ease')
		expect(probe.root.getContentTransition({ close: true })).toBe('transform 240ms ease-out')
		expect(probe.root.getOverlayTransition()).toBe('opacity 180ms ease-out')
		expect(probe.root.getOverlayTransition({ close: true })).toBe('opacity 140ms ease-in')

		wrapper.unmount()
	})

	it('closes from a real content swipe gesture', async () => {
		const wrapper = mount(Harness, {
			attachTo: document.body,
			global: {
				stubs: {
					Transition: false,
				},
			},
		})

		await nextTick()
		vi.advanceTimersByTime(600)

		const content = wrapper.get('[data-drawer-content]').element as HTMLElement
		vi.spyOn(content, 'getBoundingClientRect').mockReturnValue({
			bottom: 320,
			height: 320,
			left: 0,
			right: 320,
			top: 0,
			width: 320,
			x: 0,
			y: 0,
			toJSON: () => ({}),
		} as DOMRect)

		content.dispatchEvent(createTouchPointerEvent('pointerdown', 0))
		content.dispatchEvent(createTouchPointerEvent('pointermove', 140))
		content.dispatchEvent(createTouchPointerEvent('pointerup', 140))
		await nextTick()

		expect((wrapper.vm as unknown as { open: boolean }).open).toBe(false)

		wrapper.unmount()
	})

	it('defaults snap point overlay fade to the last snap point like Vaul', async () => {
		const wrapper = mount(SnapPointsHarness, {
			attachTo: document.body,
			global: {
				stubs: {
					Transition: false,
				},
			},
		})

		await nextTick()

		const probe = wrapper.getComponent(ContextProbe).vm.$.exposed as {
			root: ReturnType<typeof useDrawerRootContext>
		}

		expect(probe.root.fadeFromIndex.value).toBe(2)
		expect(probe.root.shouldFadeOverlay.value).toBe(true)
		expect(wrapper.get('[data-drawer-overlay]').attributes('data-snap-points-overlay')).toBe('true')

		wrapper.unmount()
	})

	it('animates controlled snap point changes with the destination overlay opacity', async () => {
		Object.defineProperty(window, 'innerHeight', { configurable: true, value: 800 })
		const wrapper = mount(ControlledSnapPointsHarness, {
			attachTo: document.body,
			global: {
				stubs: {
					Transition: false,
				},
			},
		})

		await nextTick()

		const content = wrapper.get('[data-drawer-content]').element as HTMLElement
		const overlay = wrapper.get('[data-drawer-overlay]').element as HTMLElement

		vi.spyOn(content, 'getBoundingClientRect').mockReturnValue({
			bottom: 600,
			height: 600,
			left: 0,
			right: 320,
			top: 0,
			width: 320,
			x: 0,
			y: 0,
			toJSON: () => ({}),
		} as DOMRect)

		;(wrapper.vm as unknown as { activeSnapPoint: number | string | null }).activeSnapPoint = 0.5
		await nextTick()

		expect(content.style.transition).toContain('transform')
		expect(content.style.transform).toContain('400px')
		expect(content.style.getPropertyValue('--drawer-rest-offset')).toBe('400px')
		expect(overlay.style.transition).toContain('opacity')
		expect(overlay.style.opacity).toBe('1')
		expect(overlay.style.getPropertyValue('--drawer-rest-overlay-opacity')).toBe('1')

		wrapper.unmount()
	})

	it('uses the custom container axis as the snap point percentage base', async () => {
		Object.defineProperty(window, 'innerHeight', { configurable: true, value: 800 })
		const wrapper = mount(ContainerSnapPointsHarness, {
			attachTo: document.body,
			global: {
				stubs: {
					Transition: false,
				},
			},
		})

		await nextTick()

		const container = wrapper.get('.snap-container').element as HTMLElement
		vi.spyOn(container, 'getBoundingClientRect').mockReturnValue({
			bottom: 500,
			height: 500,
			left: 0,
			right: 320,
			top: 0,
			width: 320,
			x: 0,
			y: 0,
			toJSON: () => ({}),
		} as DOMRect)

		;(wrapper.vm as unknown as { activeSnapPoint: number | string | null }).activeSnapPoint = 0.5
		await nextTick()

		const content = wrapper.get('[data-drawer-content]').element as HTMLElement
		expect(content.style.transform).toContain('250px')
		expect(content.style.getPropertyValue('--drawer-rest-offset')).toBe('250px')

		wrapper.unmount()
	})
})
