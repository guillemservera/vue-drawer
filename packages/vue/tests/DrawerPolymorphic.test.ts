import { mount } from '@vue/test-utils'
import { defineComponent, ref } from 'vue'
import { describe, expect, it, vi } from 'vitest'

import DrawerClose from '../src/components/DrawerClose.vue'
import DrawerRoot from '../src/components/DrawerRoot.vue'
import DrawerTrigger from '../src/components/DrawerTrigger.vue'

vi.mock('../src/composables/useDrawerScrollLock', () => ({
	useDrawerScrollLock: () => undefined,
}))

const TriggerAsHarness = defineComponent({
	components: {
		DrawerRoot,
		DrawerTrigger,
	},
	setup() {
		const open = ref(false)
		return { open }
	},
	template: `
		<DrawerRoot v-model:open="open">
			<DrawerTrigger
				as="a"
				class="trigger-link"
				href="#drawer"
			>
				Open
			</DrawerTrigger>
		</DrawerRoot>
	`,
})

const TriggerAsChildHarness = defineComponent({
	components: {
		DrawerRoot,
		DrawerTrigger,
	},
	setup() {
		const open = ref(false)
		const childClicks = ref(0)
		return {
			childClicks,
			open,
		}
	},
	template: `
		<DrawerRoot v-model:open="open">
			<DrawerTrigger as-child class="trigger-shell">
				<button class="trigger-button" @click="childClicks += 1">
					Open
				</button>
			</DrawerTrigger>
		</DrawerRoot>
	`,
})

const PreventedTriggerAsChildHarness = defineComponent({
	components: {
		DrawerRoot,
		DrawerTrigger,
	},
	setup() {
		const open = ref(false)
		return { open }
	},
	template: `
		<DrawerRoot v-model:open="open">
			<DrawerTrigger as-child>
				<button class="prevented-trigger" @click.prevent>
					Open
				</button>
			</DrawerTrigger>
		</DrawerRoot>
	`,
})

const CloseAsChildHarness = defineComponent({
	components: {
		DrawerClose,
		DrawerRoot,
	},
	setup() {
		const open = ref(true)
		const childClicks = ref(0)
		return {
			childClicks,
			open,
		}
	},
	template: `
		<DrawerRoot v-model:open="open">
			<DrawerClose as-child class="close-shell">
				<button class="close-button" @click="childClicks += 1">
					Close
				</button>
			</DrawerClose>
		</DrawerRoot>
	`,
})

describe('polymorphic drawer parts', () => {
	it('renders DrawerTrigger as a custom element with drawer behavior', async () => {
		const wrapper = mount(TriggerAsHarness)
		const trigger = wrapper.get('.trigger-link')

		expect(trigger.element.tagName).toBe('A')
		expect(trigger.attributes('data-drawer-trigger')).toBe('')
		expect(trigger.attributes('aria-haspopup')).toBe('dialog')
		expect(trigger.attributes('aria-expanded')).toBe('false')
		expect(trigger.attributes('type')).toBeUndefined()

		await trigger.trigger('click')

		expect((wrapper.vm as unknown as { open: boolean }).open).toBe(true)
		expect(trigger.attributes('aria-expanded')).toBe('true')
	})

	it('merges DrawerTrigger behavior into a single child when asChild is enabled', async () => {
		const wrapper = mount(TriggerAsChildHarness)
		const trigger = wrapper.get('.trigger-button')

		expect(wrapper.findAll('button')).toHaveLength(1)
		expect(trigger.classes()).toContain('trigger-button')
		expect(trigger.classes()).toContain('trigger-shell')
		expect(trigger.attributes('data-drawer-trigger')).toBe('')
		expect(trigger.attributes('type')).toBe('button')

		await trigger.trigger('click')

		expect((wrapper.vm as unknown as { childClicks: number }).childClicks).toBe(1)
		expect((wrapper.vm as unknown as { open: boolean }).open).toBe(true)
	})

	it('respects prevented child click events before opening an asChild trigger', async () => {
		const wrapper = mount(PreventedTriggerAsChildHarness)

		await wrapper.get('.prevented-trigger').trigger('click')

		expect((wrapper.vm as unknown as { open: boolean }).open).toBe(false)
	})

	it('merges DrawerClose behavior into a single child when asChild is enabled', async () => {
		const wrapper = mount(CloseAsChildHarness)
		const close = wrapper.get('.close-button')

		expect(wrapper.findAll('button')).toHaveLength(1)
		expect(close.classes()).toContain('close-button')
		expect(close.classes()).toContain('close-shell')
		expect(close.attributes('data-drawer-close')).toBe('')
		expect(close.attributes('type')).toBe('button')

		await close.trigger('click')

		expect((wrapper.vm as unknown as { childClicks: number }).childClicks).toBe(1)
		expect((wrapper.vm as unknown as { open: boolean }).open).toBe(false)
	})
})
