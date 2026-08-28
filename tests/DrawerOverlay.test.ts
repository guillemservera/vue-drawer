import { mount } from '@vue/test-utils'
import { defineComponent, nextTick, ref } from 'vue'
import { describe, expect, it, vi } from 'vitest'

import DrawerContent from '../src/components/DrawerContent.vue'
import DrawerOverlay from '../src/components/DrawerOverlay.vue'
import DrawerRoot from '../src/components/DrawerRoot.vue'
import { useDrawerRootContext } from '../src/utils/drawerContext'

vi.mock('../src/composables/useDrawerScrollLock', () => ({
	useDrawerScrollLock: () => undefined,
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

const ClassHarness = defineComponent({
	components: {
		DrawerOverlay,
		DrawerRoot,
	},
	template: `
		<DrawerRoot default-open>
			<DrawerOverlay class="consumer-overlay" />
		</DrawerRoot>
	`,
})

describe('DrawerOverlay', () => {
	it('preserves consumer classes while adding overlay behavior classes', async () => {
		const wrapper = mount(ClassHarness, {
			global: {
				stubs: {
					Transition: false,
				},
			},
		})

		await nextTick()

		const classes = wrapper.get('[data-drawer-overlay]').classes()
		expect(classes).toContain('consumer-overlay')
		expect(classes).toContain('drawer-overlay')
		expect(classes).not.toContain('drawer-overlay--non-modal')

		wrapper.unmount()
	})

	it('absorbs overlay pointerdown and dismisses immediately', async () => {
		const wrapper = mount(Harness, {
			attachTo: document.body,
			global: {
				stubs: {
					Transition: false,
				},
			},
		})

		await nextTick()

		const overlay = wrapper.get('[data-drawer-overlay]')
		const pointerDown = new Event('pointerdown', { bubbles: true, cancelable: true })
		overlay.element.dispatchEvent(pointerDown)
		await nextTick()

		expect(pointerDown.defaultPrevented).toBe(true)
		expect((wrapper.vm as unknown as { open: boolean }).open).toBe(false)
		const probe = wrapper.getComponent(ContextProbe).vm.$.exposed as {
			root: ReturnType<typeof useDrawerRootContext>
		}
		expect(probe.root.closeAnimation.value).toBe('slide')
		expect(overlay.attributes('data-close-animation')).toBe('slide')

		wrapper.unmount()
	})
})
