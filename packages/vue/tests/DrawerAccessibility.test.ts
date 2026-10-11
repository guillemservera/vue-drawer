import { mount } from '@vue/test-utils'
import { defineComponent, nextTick, ref } from 'vue'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import DrawerClose from '../src/components/DrawerClose.vue'
import DrawerContent from '../src/components/DrawerContent.vue'
import DrawerDescription from '../src/components/DrawerDescription.vue'
import DrawerPortal from '../src/components/DrawerPortal.vue'
import DrawerRoot from '../src/components/DrawerRoot.vue'
import DrawerTitle from '../src/components/DrawerTitle.vue'
import DrawerTrigger from '../src/components/DrawerTrigger.vue'
import { clearEscapeLayersForTest } from '../src/composables/useDrawerEscapeLayer'
import { clearDrawerDismissableLayersForTest } from '../src/composables/useDrawerDismissableLayer'

vi.mock('../src/composables/useDrawerScrollLock', () => ({
	useDrawerScrollLock: () => undefined,
}))

describe('Drawer accessibility primitives', () => {
	beforeEach(() => {
		vi.spyOn(console, 'warn').mockImplementation(() => undefined)
	})

	afterEach(() => {
		clearEscapeLayersForTest()
		clearDrawerDismissableLayersForTest()
		vi.restoreAllMocks()
	})

	it('links title and description to dialog content automatically', async () => {
		const Harness = defineComponent({
			components: {
				DrawerContent,
				DrawerDescription,
				DrawerRoot,
				DrawerTitle,
			},
			template: `
				<DrawerRoot default-open>
					<DrawerContent>
						<DrawerTitle>Portfolio filters</DrawerTitle>
						<DrawerDescription>Choose the visible market filters.</DrawerDescription>
					</DrawerContent>
				</DrawerRoot>
			`,
		})

		const wrapper = mount(Harness, {
			global: {
				stubs: {
					Transition: false,
				},
			},
		})

		await nextTick()
		await nextTick()

		const content = wrapper.get('[data-drawer-content]')
		const title = wrapper.get('h2')
		const description = wrapper.get('p')

		expect(content.attributes('role')).toBe('dialog')
		expect(content.attributes('aria-modal')).toBe('true')
		expect(content.attributes('aria-labelledby')).toBe(title.attributes('id'))
		expect(content.attributes('aria-describedby')).toBe(description.attributes('id'))
	})

	it('opens with DrawerTrigger and closes with DrawerClose', async () => {
		const Harness = defineComponent({
			components: {
				DrawerClose,
				DrawerContent,
				DrawerRoot,
				DrawerTrigger,
			},
			setup() {
				const open = ref(false)
				return { open }
			},
			template: `
				<DrawerRoot v-model:open="open">
					<DrawerTrigger class="open-button">Open</DrawerTrigger>
					<DrawerContent>
						<DrawerClose class="close-button">Close</DrawerClose>
					</DrawerContent>
				</DrawerRoot>
			`,
		})

		const wrapper = mount(Harness, {
			global: {
				stubs: {
					Transition: false,
				},
			},
		})

		const trigger = wrapper.get('[data-drawer-trigger]')
		expect(trigger.attributes('aria-haspopup')).toBe('dialog')
		expect(trigger.attributes('aria-expanded')).toBe('false')

		await trigger.trigger('click')
		await nextTick()

		expect((wrapper.vm as unknown as { open: boolean }).open).toBe(true)
		expect(wrapper.get('[data-drawer-trigger]').attributes('aria-expanded')).toBe('true')
		expect(wrapper.get('[data-drawer-trigger]').attributes('aria-controls')).toBe(wrapper.get('[data-drawer-content]').attributes('id'))

		await wrapper.get('[data-drawer-close]').trigger('click')
		await nextTick()

		expect((wrapper.vm as unknown as { open: boolean }).open).toBe(false)
	})

	it.each([
		['keyboard shortcut', '.keyboard-origin', 'keydown'],
		['menu item', '.menu-origin', 'click'],
	] as const)('restores focus to the %s origin after close', async (_name, selector, eventType) => {
		const Harness = defineComponent({
			components: {
				DrawerClose,
				DrawerContent,
				DrawerRoot,
			},
			setup() {
				const open = ref(false)
				function openFromShortcut(event: KeyboardEvent) {
					if ((event.metaKey || event.ctrlKey) && event.key === '/') open.value = true
				}
				return { open, openFromShortcut }
			},
			template: `
				<button class="keyboard-origin" type="button" @keydown="openFromShortcut">Keyboard origin</button>
				<button class="menu-origin" type="button" @click="open = true">Menu origin</button>
				<DrawerRoot v-model:open="open">
					<DrawerContent>
						<DrawerClose>Close</DrawerClose>
					</DrawerContent>
				</DrawerRoot>
			`,
		})
		const wrapper = mount(Harness, {
			attachTo: document.body,
			global: {
				stubs: {
					Transition: false,
				},
			},
		})
		const origin = wrapper.get(selector).element as HTMLButtonElement
		origin.focus()

		if (eventType === 'keydown') {
			origin.dispatchEvent(new KeyboardEvent('keydown', { key: '/', metaKey: true, bubbles: true }))
		}
		else {
			await wrapper.get(selector).trigger('click')
		}
		await nextTick()
		await nextTick()
		await wrapper.get('[data-drawer-close]').trigger('click')
		await nextTick()
		await nextTick()

		expect(document.activeElement).toBe(origin)
		wrapper.unmount()
	})

	it('teleports to a configured portal target', async () => {
		const target = document.createElement('div')
		target.id = 'drawer-test-portal'
		document.body.appendChild(target)

		const Harness = defineComponent({
			components: {
				DrawerContent,
				DrawerPortal,
				DrawerRoot,
			},
			template: `
				<DrawerRoot default-open>
					<DrawerPortal to="#drawer-test-portal">
						<DrawerContent />
					</DrawerPortal>
				</DrawerRoot>
			`,
		})

		const wrapper = mount(Harness, {
			attachTo: document.body,
			global: {
				stubs: {
					Transition: false,
				},
			},
		})

		await nextTick()

		expect(target.querySelector('[data-drawer-content]')).toBeTruthy()

		wrapper.unmount()
		target.remove()
	})

	it('hides outside content from assistive tech while a modal drawer is open', async () => {
		const outside = document.createElement('main')
		outside.id = 'outside-app'
		document.body.appendChild(outside)

		const Harness = defineComponent({
			components: {
				DrawerContent,
				DrawerRoot,
			},
			setup() {
				const open = ref(true)
				return { open }
			},
			template: `
				<DrawerRoot v-model:open="open">
					<DrawerContent />
				</DrawerRoot>
			`,
		})

		const wrapper = mount(Harness, {
			attachTo: document.body,
			global: {
				stubs: {
					Transition: false,
				},
			},
		})

		await nextTick()
		expect(outside.getAttribute('aria-hidden')).toBe('true')

		;(wrapper.vm as unknown as { open: boolean }).open = false
		await nextTick()
		expect(outside.hasAttribute('aria-hidden')).toBe(false)

		wrapper.unmount()
		outside.remove()
	})

	it('allows outside pointer dismissal to be prevented', async () => {
		const outside = document.createElement('button')
		outside.type = 'button'
		document.body.appendChild(outside)

		const Harness = defineComponent({
			components: {
				DrawerContent,
				DrawerRoot,
			},
			setup() {
				const open = ref(true)
				return { open }
			},
			template: `
				<DrawerRoot v-model:open="open">
					<DrawerContent @pointer-down-outside="$event.preventDefault()" />
				</DrawerRoot>
			`,
		})

		const wrapper = mount(Harness, {
			attachTo: document.body,
			global: {
				stubs: {
					Transition: false,
				},
			},
		})

		await nextTick()
		outside.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true }))
		await nextTick()

		expect((wrapper.vm as unknown as { open: boolean }).open).toBe(true)

		wrapper.unmount()
		outside.remove()
	})

	it('dismisses from outside pointer events without requiring an overlay', async () => {
		const outside = document.createElement('button')
		outside.type = 'button'
		document.body.appendChild(outside)
		const pointerDownOutside = vi.fn()
		const interactOutside = vi.fn()

		const Harness = defineComponent({
			components: {
				DrawerContent,
				DrawerRoot,
			},
			setup() {
				const open = ref(true)
				return {
					interactOutside,
					open,
					pointerDownOutside,
				}
			},
			template: `
				<DrawerRoot v-model:open="open">
					<DrawerContent
						@pointer-down-outside="pointerDownOutside"
						@interact-outside="interactOutside"
					/>
				</DrawerRoot>
			`,
		})

		const wrapper = mount(Harness, {
			attachTo: document.body,
			global: {
				stubs: {
					Transition: false,
				},
			},
		})

		await nextTick()
		const pointerEvent = new PointerEvent('pointerdown', { bubbles: true, cancelable: true })
		outside.dispatchEvent(pointerEvent)
		await nextTick()

		expect(pointerDownOutside).toHaveBeenCalledTimes(1)
		expect(interactOutside).toHaveBeenCalledTimes(1)
		expect(pointerEvent.defaultPrevented).toBe(true)
		expect((wrapper.vm as unknown as { open: boolean }).open).toBe(false)

		wrapper.unmount()
		outside.remove()
	})

	it('treats drawer branch portals as inside the modal drawer', async () => {
		const branch = document.createElement('button')
		branch.type = 'button'
		branch.setAttribute('data-drawer-branch', '')
		document.body.appendChild(branch)
		const pointerDownOutside = vi.fn()
		const focusOutside = vi.fn()

		const Harness = defineComponent({
			components: {
				DrawerContent,
				DrawerRoot,
			},
			setup() {
				const open = ref(true)
				return {
					focusOutside,
					open,
					pointerDownOutside,
				}
			},
			template: `
				<DrawerRoot v-model:open="open">
					<DrawerContent
						@focus-outside="focusOutside"
						@pointer-down-outside="pointerDownOutside"
					>
						<button type="button">Inside drawer</button>
					</DrawerContent>
				</DrawerRoot>
			`,
		})

		const wrapper = mount(Harness, {
			attachTo: document.body,
			global: {
				stubs: {
					Transition: false,
				},
			},
		})

		await nextTick()

		const pointerEvent = new PointerEvent('pointerdown', { bubbles: true, cancelable: true })
		branch.dispatchEvent(pointerEvent)
		await nextTick()

		branch.focus()
		await nextTick()
		await Promise.resolve()

		const escapeEvent = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })
		branch.dispatchEvent(escapeEvent)
		await nextTick()

		expect(pointerDownOutside).not.toHaveBeenCalled()
		expect(focusOutside).not.toHaveBeenCalled()
		expect(pointerEvent.defaultPrevented).toBe(false)
		expect(escapeEvent.defaultPrevented).toBe(false)
		expect(document.activeElement).toBe(branch)
		expect((wrapper.vm as unknown as { open: boolean }).open).toBe(true)

		wrapper.unmount()
		branch.remove()
	})

	it('stops Escape from reaching listeners behind the drawer once a layer handles it', async () => {
		const outside = document.createElement('button')
		outside.type = 'button'
		document.body.appendChild(outside)
		// Stands in for an Escape consumer behind the drawer (page-level shortcut,
		// enclosing dialog). The escape layer captures on `document`, so a handled
		// Escape must never reach this bubble-phase listener.
		const behindDrawer = vi.fn()
		document.addEventListener('keydown', behindDrawer)

		const Harness = defineComponent({
			components: {
				DrawerContent,
				DrawerRoot,
			},
			setup() {
				const open = ref(true)
				return { open }
			},
			template: `
				<DrawerRoot v-model:open="open">
					<DrawerContent aria-label="Account filters" />
				</DrawerRoot>
			`,
		})

		const wrapper = mount(Harness, {
			attachTo: document.body,
			global: {
				stubs: {
					Transition: false,
				},
			},
		})

		await nextTick()
		const escapeEvent = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })
		outside.dispatchEvent(escapeEvent)
		document.removeEventListener('keydown', behindDrawer)
		await nextTick()

		expect(behindDrawer).not.toHaveBeenCalled()
		expect((wrapper.vm as unknown as { open: boolean }).open).toBe(false)

		wrapper.unmount()
		outside.remove()
	})

	it('does not dismiss or block outside pointer defaults for non-modal drawers', async () => {
		const outside = document.createElement('button')
		outside.type = 'button'
		document.body.appendChild(outside)
		const pointerDownOutside = vi.fn()

		const Harness = defineComponent({
			components: {
				DrawerContent,
				DrawerRoot,
			},
			setup() {
				const open = ref(true)
				return {
					open,
					pointerDownOutside,
				}
			},
			template: `
				<DrawerRoot v-model:open="open" :modal="false">
					<DrawerContent @pointer-down-outside="pointerDownOutside" />
				</DrawerRoot>
			`,
		})

		const wrapper = mount(Harness, {
			attachTo: document.body,
			global: {
				stubs: {
					Transition: false,
				},
			},
		})

		await nextTick()
		const pointerEvent = new PointerEvent('pointerdown', { bubbles: true, cancelable: true })
		outside.dispatchEvent(pointerEvent)
		await nextTick()

		expect(pointerDownOutside).toHaveBeenCalledTimes(1)
		expect(pointerEvent.defaultPrevented).toBe(false)
		expect((wrapper.vm as unknown as { open: boolean }).open).toBe(true)

		wrapper.unmount()
		outside.remove()
	})

	it('does not dismiss from outside focus for non-modal drawers', async () => {
		const outside = document.createElement('button')
		outside.type = 'button'
		document.body.appendChild(outside)

		const focusOutside = vi.fn()

		const Harness = defineComponent({
			components: {
				DrawerContent,
				DrawerRoot,
			},
			setup() {
				const open = ref(true)
				return {
					focusOutside,
					open,
				}
			},
			template: `
				<DrawerRoot v-model:open="open" :modal="false">
					<DrawerContent @focus-outside="focusOutside" />
				</DrawerRoot>
			`,
		})

		const wrapper = mount(Harness, {
			attachTo: document.body,
			global: {
				stubs: {
					Transition: false,
				},
			},
		})

		await nextTick()
		outside.dispatchEvent(new FocusEvent('focusin', { bubbles: true, cancelable: true }))
		await nextTick()

		expect(focusOutside).toHaveBeenCalledTimes(1)
		expect((wrapper.vm as unknown as { open: boolean }).open).toBe(true)

		wrapper.unmount()
		outside.remove()
	})

	it('emits focus outside for modal drawers without dismissing from focus trap churn', async () => {
		const outside = document.createElement('button')
		outside.type = 'button'
		document.body.appendChild(outside)
		const focusOutside = vi.fn()

		const Harness = defineComponent({
			components: {
				DrawerContent,
				DrawerRoot,
			},
			setup() {
				const open = ref(true)
				return {
					focusOutside,
					open,
				}
			},
			template: `
				<DrawerRoot v-model:open="open">
					<DrawerContent @focus-outside="focusOutside">
						<button class="inside-button" type="button">Inside</button>
					</DrawerContent>
				</DrawerRoot>
			`,
		})

		const wrapper = mount(Harness, {
			attachTo: document.body,
			global: {
				stubs: {
					Transition: false,
				},
			},
		})

		await nextTick()
		outside.focus()
		await nextTick()
		await nextTick()

		expect(focusOutside).toHaveBeenCalledTimes(1)
		expect((wrapper.vm as unknown as { open: boolean }).open).toBe(true)

		wrapper.unmount()
		outside.remove()
	})

	it('keeps programmatic focus inside modal content', async () => {
		const outside = document.createElement('button')
		outside.type = 'button'
		document.body.appendChild(outside)

		const Harness = defineComponent({
			components: {
				DrawerContent,
				DrawerRoot,
			},
			template: `
				<DrawerRoot default-open>
					<DrawerContent>
						<button class="inside-button" type="button">Inside</button>
					</DrawerContent>
				</DrawerRoot>
			`,
		})

		const wrapper = mount(Harness, {
			attachTo: document.body,
			global: {
				stubs: {
					Transition: false,
				},
			},
		})

		await nextTick()
		outside.focus()
		await nextTick()

		expect(document.activeElement).toBe(wrapper.get('.inside-button').element)

		wrapper.unmount()
		outside.remove()
	})

	it('warns in dev when content opens without an accessible name', async () => {
		const Harness = defineComponent({
			components: {
				DrawerContent,
				DrawerRoot,
			},
			template: `
				<DrawerRoot default-open>
					<DrawerContent />
				</DrawerRoot>
			`,
		})

		const wrapper = mount(Harness, {
			global: {
				stubs: {
					Transition: false,
				},
			},
		})

		await nextTick()
		await nextTick()
		await nextTick()

		expect(console.warn).toHaveBeenCalledWith(expect.stringContaining('accessible name'))

		wrapper.unmount()
	})

	it('does not warn when content has an aria-label name', async () => {
		const Harness = defineComponent({
			components: {
				DrawerContent,
				DrawerRoot,
			},
			template: `
				<DrawerRoot default-open>
					<DrawerContent aria-label="Account filters" />
				</DrawerRoot>
			`,
		})

		const wrapper = mount(Harness, {
			global: {
				stubs: {
					Transition: false,
				},
			},
		})

		await nextTick()
		await nextTick()
		await nextTick()

		expect(console.warn).not.toHaveBeenCalled()

		wrapper.unmount()
	})
})
