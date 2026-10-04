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

const FocusHarness = defineComponent({
	components: {
		DrawerContent,
		DrawerRoot,
		DrawerRootNested,
	},
	setup() {
		const open = ref(true)
		const childOpen = ref(false)
		const childModal = ref(true)

		return {
			open,
			childOpen,
			childModal,
		}
	},
	template: `
		<DrawerRoot v-model:open="open">
			<DrawerContent aria-label="Parent drawer">
				<button class="parent-button">Parent</button>
			</DrawerContent>
			<DrawerRootNested v-model:open="childOpen" :modal="childModal">
				<DrawerContent aria-label="Nested drawer">
					<select class="child-select"><option>One</option></select>
				</DrawerContent>
			</DrawerRootNested>
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
		expect(content.style.transform).toContain('translate(0, -16px)')
		expect(content.classList.contains('drawer-content--nested-parent')).toBe(true)

		;(wrapper.vm as unknown as { childOpen: boolean }).childOpen = false
		await nextTick()

		expect(content.style.transform).toBe('translate(0, 0px)')
		expect(content.classList.contains('drawer-content--nested-parent')).toBe(false)

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
		expect(content.style.transform).toContain('translate(0, -8px)')

		parentProbe.root.onNestedRelease(true)

		expect(content.style.transform).toContain('translate(0, -16px)')

		parentProbe.root.onNestedDrag(0.5)
		parentProbe.root.onNestedRelease(false)

		expect(content.style.transform).toBe('translate(0, 0px)')

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

	it('leaves focus inside an open nested drawer to the nested drawer', async () => {
		const wrapper = mount(FocusHarness, { attachTo: document.body })
		await nextTick()

		;(wrapper.vm as unknown as { childOpen: boolean }).childOpen = true
		await nextTick()
		await nextTick()

		// The child's content is outside the parent's: a portal in real use.
		// The parent's trap must not take focus at all: even a round trip (parent, then the child's trap pulling it
		// back) closes a native select's picker as it opens.
		const select = document.querySelector<HTMLSelectElement>('.child-select')!
		const parentButton = document.querySelector<HTMLButtonElement>('.parent-button')!
		const parentFocus = vi.fn()
		parentButton.addEventListener('focus', parentFocus)
		select.focus()
		await Promise.resolve()
		await Promise.resolve()
		expect(parentFocus).not.toHaveBeenCalled()
		expect(document.activeElement).toBe(select)
		parentButton.removeEventListener('focus', parentFocus)

		// Once the child closes, the parent traps focus again.
		;(wrapper.vm as unknown as { childOpen: boolean }).childOpen = false
		await nextTick()
		const outside = document.createElement('button')
		document.body.append(outside)
		outside.focus()
		await Promise.resolve()
		await Promise.resolve()
		expect(document.activeElement).toBe(parentButton)

		outside.remove()
		wrapper.unmount()
	})

	it('keeps the parent trapping focus while a non-modal nested drawer is open', async () => {
		const wrapper = mount(FocusHarness, { attachTo: document.body })
		await nextTick()

		;(wrapper.vm as unknown as { childModal: boolean }).childModal = false
		;(wrapper.vm as unknown as { childOpen: boolean }).childOpen = true
		await nextTick()
		await nextTick()

		// The non-modal child has no trap of its own: focus leaving both drawers comes back to the parent.
		const outside = document.createElement('button')
		document.body.append(outside)
		outside.focus()
		await Promise.resolve()
		await Promise.resolve()
		expect(document.activeElement).toBe(document.querySelector('.parent-button'))

		outside.remove()
		wrapper.unmount()
	})
})
