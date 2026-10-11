import { mount } from '@vue/test-utils'
import { defineComponent, nextTick, ref } from 'vue'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useDrawerInputReposition } from '../src/composables/useDrawerInputReposition'

interface MockVisualViewport extends EventTarget {
	height: number
	offsetTop: number
}

function createMockVisualViewport() {
	const viewport = new EventTarget() as MockVisualViewport
	viewport.height = 800
	viewport.offsetTop = 0
	return viewport
}

const Harness = defineComponent({
	setup(_, { expose }) {
		const open = ref(true)
		const modal = ref(true)
		const nested = ref(false)
		const direction = ref<'bottom' | 'top' | 'left' | 'right'>('bottom')
		const repositionInputs = ref(true)
		const fixed = ref(false)
		const content = ref<HTMLElement | null>(null)

		useDrawerInputReposition({
			open,
			modal,
			nested,
			direction,
			repositionInputs,
			fixed,
			contentElement: content,
		})

		expose({
			open,
			repositionInputs,
			fixed,
			content,
		})

		return {
			content,
		}
	},
	template: `
		<div ref="content" class="drawer">
			<input class="field">
		</div>
	`,
})

describe('useDrawerInputReposition', () => {
	let originalVisualViewport: VisualViewport | undefined
	let viewport: MockVisualViewport

	beforeEach(() => {
		originalVisualViewport = window.visualViewport ?? undefined
		viewport = createMockVisualViewport()
		Object.defineProperty(window, 'innerHeight', { configurable: true, value: 800 })
		Object.defineProperty(window, 'visualViewport', { configurable: true, value: viewport })
		vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback: FrameRequestCallback) => {
			callback(0)
			return 1
		})
		vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => undefined)
	})

	afterEach(() => {
		Object.defineProperty(window, 'visualViewport', {
			configurable: true,
			value: originalVisualViewport,
		})
		vi.restoreAllMocks()
	})

	it('moves and resizes a bottom drawer when the iOS keyboard covers the focused input', async () => {
		const wrapper = mount(Harness, { attachTo: document.body })
		const content = wrapper.get('.drawer').element as HTMLElement
		const input = wrapper.get('.field').element as HTMLInputElement

		vi.spyOn(content, 'getBoundingClientRect').mockReturnValue({
			bottom: 640,
			height: 620,
			left: 0,
			right: 320,
			top: 20,
			width: 320,
			x: 0,
			y: 20,
			toJSON: () => ({}),
		} as DOMRect)
		vi.spyOn(input, 'getBoundingClientRect').mockReturnValue({
			bottom: 650,
			height: 40,
			left: 20,
			right: 300,
			top: 610,
			width: 280,
			x: 20,
			y: 610,
			toJSON: () => ({}),
		} as DOMRect)

		input.focus()
		viewport.height = 420
		viewport.dispatchEvent(new Event('resize'))
		await nextTick()

		expect(content.style.bottom).toBe('380px')
		expect(content.style.height).toBe('396px')
		expect(content.style.maxHeight).toBe('396px')

		wrapper.unmount()
	})

	it('restores inline keyboard styles when the drawer closes', async () => {
		const wrapper = mount(Harness, { attachTo: document.body })
		const exposed = wrapper.vm.$.exposed as unknown as {
			open: { value: boolean }
		}
		const content = wrapper.get('.drawer').element as HTMLElement
		const input = wrapper.get('.field').element as HTMLInputElement

		content.style.bottom = '0px'
		vi.spyOn(content, 'getBoundingClientRect').mockReturnValue({
			bottom: 640,
			height: 620,
			left: 0,
			right: 320,
			top: 20,
			width: 320,
			x: 0,
			y: 20,
			toJSON: () => ({}),
		} as DOMRect)
		vi.spyOn(input, 'getBoundingClientRect').mockReturnValue({
			bottom: 650,
			height: 40,
			left: 20,
			right: 300,
			top: 610,
			width: 280,
			x: 20,
			y: 610,
			toJSON: () => ({}),
		} as DOMRect)

		input.focus()
		viewport.height = 420
		viewport.dispatchEvent(new Event('resize'))
		await nextTick()
		expect(content.style.bottom).toBe('380px')

		exposed.open.value = false
		await nextTick()

		expect(content.style.bottom).toBe('0px')
		expect(content.style.height).toBe('')
		expect(content.style.maxHeight).toBe('')

		wrapper.unmount()
	})

	it('uses the fixed mode to shrink from the initial drawer height', async () => {
		const wrapper = mount(Harness, { attachTo: document.body })
		const exposed = wrapper.vm.$.exposed as unknown as {
			fixed: { value: boolean }
		}
		const content = wrapper.get('.drawer').element as HTMLElement
		const input = wrapper.get('.field').element as HTMLInputElement

		exposed.fixed.value = true
		vi.spyOn(content, 'getBoundingClientRect').mockReturnValue({
			bottom: 640,
			height: 620,
			left: 0,
			right: 320,
			top: 20,
			width: 320,
			x: 0,
			y: 20,
			toJSON: () => ({}),
		} as DOMRect)
		vi.spyOn(input, 'getBoundingClientRect').mockReturnValue({
			bottom: 650,
			height: 40,
			left: 20,
			right: 300,
			top: 610,
			width: 280,
			x: 20,
			y: 610,
			toJSON: () => ({}),
		} as DOMRect)

		input.focus()
		viewport.height = 420
		viewport.dispatchEvent(new Event('resize'))
		await nextTick()

		expect(content.style.height).toBe('240px')
		expect(content.style.maxHeight).toBe('240px')

		wrapper.unmount()
	})
})
