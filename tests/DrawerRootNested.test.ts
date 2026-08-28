import { mount } from '@vue/test-utils'
import { defineComponent, nextTick, ref } from 'vue'
import { describe, expect, it, vi } from 'vitest'

import DrawerClose from '../src/components/DrawerClose.vue'
import DrawerContent from '../src/components/DrawerContent.vue'
import DrawerOverlay from '../src/components/DrawerOverlay.vue'
import { useDrawerRootContext } from '../src/utils/drawerContext'
import DrawerRoot from '../src/components/DrawerRoot.vue'
import DrawerRootNested from '../src/components/DrawerRootNested.vue'

vi.mock('../src/composables/useDrawerScrollLock', () => ({
	useDrawerScrollLock: () => undefined,
}))

const Harness = defineComponent({
	components: {
		DrawerContent,
		DrawerOverlay,
		DrawerRoot,
		DrawerRootNested,
	},
	setup() {
		const open = ref(true)
		const childOpen = ref(true)

		return {
			open,
			childOpen,
		}
	},
	template: `
		<DrawerRoot v-model:open="open">
			<DrawerOverlay />
			<DrawerContent aria-label="Parent drawer" />
			<DrawerRootNested v-model:open="childOpen">
				<DrawerOverlay />
				<DrawerContent aria-label="Nested drawer" />
				<div />
			</DrawerRootNested>
		</DrawerRoot>
	`,
})

const ContextProbe = defineComponent({
	setup(_, { expose }) {
		const root = useDrawerRootContext()
		expose({ root })
		return () => null
	},
})

const NestedInstantHarness = defineComponent({
	components: {
		ContextProbe,
		DrawerContent,
		DrawerOverlay,
		DrawerRoot,
		DrawerRootNested,
	},
	setup() {
		const open = ref(true)
		const childOpen = ref(true)

		return {
			open,
			childOpen,
		}
	},
	template: `
		<DrawerRoot v-model:open="open">
			<DrawerOverlay />
			<DrawerContent aria-label="Parent drawer" />
			<ContextProbe ref="parentProbe" />
			<DrawerRootNested v-model:open="childOpen">
				<DrawerOverlay />
				<DrawerContent aria-label="Nested drawer" />
				<ContextProbe ref="childProbe" />
			</DrawerRootNested>
		</DrawerRoot>
	`,
})

const CloseScopeHarness = defineComponent({
	components: {
		DrawerClose,
		DrawerContent,
		DrawerOverlay,
		DrawerRoot,
		DrawerRootNested,
	},
	setup() {
		const open = ref(true)
		const childOpen = ref(true)

		return {
			open,
			childOpen,
		}
	},
	template: `
		<DrawerRoot v-model:open="open">
			<DrawerOverlay />
			<DrawerContent aria-label="Parent drawer">
				<DrawerRootNested v-model:open="childOpen">
					<DrawerOverlay />
					<DrawerContent aria-label="Nested drawer">
						<DrawerClose class="close-current">Close nested</DrawerClose>
						<DrawerClose class="close-all" scope="all">Close all</DrawerClose>
					</DrawerContent>
				</DrawerRootNested>
			</DrawerContent>
		</DrawerRoot>
	`,
})

describe('DrawerRootNested', () => {
	it('forces nested drawers closed when the parent drawer closes', async () => {
		const wrapper = mount(Harness)

		expect((wrapper.vm as unknown as { childOpen: boolean }).childOpen).toBe(true)

		;(wrapper.vm as unknown as { open: boolean }).open = false
		await nextTick()
		await nextTick()

		expect((wrapper.vm as unknown as { childOpen: boolean }).childOpen).toBe(false)
	})

	it('keeps DrawerClose scoped to the current nested drawer by default', async () => {
		const wrapper = mount(CloseScopeHarness)

		await wrapper.get('.close-current').trigger('click')
		await nextTick()

		expect((wrapper.vm as unknown as { open: boolean }).open).toBe(true)
		expect((wrapper.vm as unknown as { childOpen: boolean }).childOpen).toBe(false)
	})

	it('lets DrawerClose close the whole nested stack with scope all', async () => {
		const wrapper = mount(CloseScopeHarness)

		await wrapper.get('.close-all').trigger('click')
		await nextTick()
		await nextTick()

		expect((wrapper.vm as unknown as { open: boolean }).open).toBe(false)
		expect((wrapper.vm as unknown as { childOpen: boolean }).childOpen).toBe(false)
	})

	it('scales the parent drawer while a nested child is open', async () => {
		const wrapper = mount(NestedInstantHarness, {
			attachTo: document.body,
			global: {
				stubs: {
					Transition: false,
				},
			},
		})

		await nextTick()

		const probes = wrapper.findAllComponents(ContextProbe)
		const parentProbe = probes[0]!.vm.$.exposed as {
			root: ReturnType<typeof useDrawerRootContext>
		}
		const content = parentProbe.root.contentElement.value!

		expect(content.style.transform).toContain('scale(')
		expect(content.style.transform).toContain('translate3d(0, -16px, 0)')

		;(wrapper.vm as unknown as { childOpen: boolean }).childOpen = false
		await nextTick()

		expect(content.style.transform).toBe('translate3d(0, 0px, 0)')

		wrapper.unmount()
	})

	it('syncs the parent transform while a nested child is gesture-dragged', async () => {
		const wrapper = mount(NestedInstantHarness, {
			attachTo: document.body,
			global: {
				stubs: {
					Transition: false,
				},
			},
		})

		await nextTick()

		const probes = wrapper.findAllComponents(ContextProbe)
		const parentProbe = probes[0]!.vm.$.exposed as {
			root: ReturnType<typeof useDrawerRootContext>
		}
		const content = parentProbe.root.contentElement.value!

		parentProbe.root.onNestedDrag(0.5)

		expect(content.style.transition).toBe('none')
		expect(content.style.transform).toContain('translate3d(0, -8px, 0)')

		parentProbe.root.onNestedRelease(true)

		expect(content.style.transform).toContain('translate3d(0, -16px, 0)')

		parentProbe.root.onNestedDrag(0.5)
		parentProbe.root.onNestedRelease(false)

		expect(content.style.transform).toBe('translate3d(0, 0px, 0)')

		wrapper.unmount()
	})

	it('forces an already-closing nested drawer to finish instantly when the parent closes', async () => {
		const wrapper = mount(NestedInstantHarness, {
			attachTo: document.body,
			global: {
				stubs: {
					Transition: false,
				},
			},
		})

		await nextTick()

		const probes = wrapper.findAllComponents(ContextProbe)
		const childProbe = probes[1]!.vm.$.exposed as {
			root: ReturnType<typeof useDrawerRootContext>
		}

		;(wrapper.vm as unknown as { childOpen: boolean }).childOpen = false
		await nextTick()
		expect(childProbe.root.open.value).toBe(false)

		const childContent = document.createElement('div')
		const childOverlay = document.createElement('div')
		childProbe.root.registerContentElement(childContent)
		childProbe.root.registerOverlayElement(childOverlay)

		;(wrapper.vm as unknown as { open: boolean }).open = false
		await nextTick()

		expect(childProbe.root.skipCloseAnimation.value).toBe(true)
		expect(childContent.style.transition).toContain('1ms')
		expect(childOverlay.style.transition).toContain('1ms')

		wrapper.unmount()
	})
})
