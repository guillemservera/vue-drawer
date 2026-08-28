import { mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, nextTick, ref } from 'vue'
import { useDrawerScrollLock } from '../src/composables/useDrawerScrollLock'

const TestHarness = defineComponent({
	setup(_, { expose }) {
		const open = ref(false)
		const modal = ref(true)
			const nested = ref(false)
			const hasBeenOpened = ref(true)
			const preventScroll = ref(true)
			const preventScrollRestoration = ref(false)
			const noBodyStyles = ref(false)
			const contentElement = ref<HTMLElement | null>(null)

			useDrawerScrollLock({
			open,
				modal,
				nested,
				hasBeenOpened,
				preventScroll,
				preventScrollRestoration,
				noBodyStyles,
				contentElement,
			})

		expose({
			setOpen(value: boolean) {
				open.value = value
			},
				setModal(value: boolean) {
					modal.value = value
				},
				setPreventScroll(value: boolean) {
					preventScroll.value = value
				},
				setNoBodyStyles(value: boolean) {
					noBodyStyles.value = value
				},
			})

		return {
			contentElement,
			open,
		}
	},
	template: `
		<div ref="contentElement" data-drawer-content :data-state="open ? 'open' : 'closed'">
			<div class="y-scroll" data-drawer-scroll-axis="y" style="overflow-y:auto;">
				<div class="y-scroll-child" />
			</div>
			<div class="root-y-scroll" data-drawer-scroll-axis="y" style="overflow-y:auto;" />
			<div class="plain-y-scroll" style="overflow-y:auto;">
				<div class="plain-y-scroll-child" />
			</div>
			<div class="empty-y-scroll" style="overflow-y:auto;">
				<div class="empty-y-scroll-child" />
			</div>
			<div class="x-scroll" data-drawer-scroll-axis="x" style="overflow-x:auto; touch-action:pan-x;">
				<div class="x-scroll-child" style="width:240px; height:24px;" />
			</div>
			<label class="no-drag" data-drawer-no-drag>
				<input class="no-drag-input" type="range" />
			</label>
			<input class="text-input" />
			<select class="native-select">
				<option>One</option>
			</select>
		</div>
	`,
})

function createTouchEvent(type: 'touchstart' | 'touchmove' | 'touchend', pageX: number, pageY: number) {
	const event = new Event(type, { bubbles: true, cancelable: true }) as TouchEvent
	Object.defineProperty(event, 'changedTouches', {
		configurable: true,
		value: [{ pageX, pageY }],
	})
	return event
}

function stubSafariIOS() {
	vi.stubGlobal('matchMedia', vi.fn().mockReturnValue({
		matches: false,
		media: '(display-mode: standalone)',
		addEventListener: vi.fn(),
		removeEventListener: vi.fn(),
		addListener: vi.fn(),
		removeListener: vi.fn(),
		dispatchEvent: vi.fn(),
	}))

	Object.defineProperty(window.navigator, 'userAgent', {
		configurable: true,
		value: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
	})

	Object.defineProperty(window.navigator, 'platform', {
		configurable: true,
		value: 'iPhone',
	})

	Object.defineProperty(window.navigator, 'maxTouchPoints', {
		configurable: true,
		value: 5,
	})
}

function stubDesktopChrome() {
	vi.stubGlobal('matchMedia', vi.fn().mockReturnValue({
		matches: false,
		media: '(display-mode: standalone)',
		addEventListener: vi.fn(),
		removeEventListener: vi.fn(),
		addListener: vi.fn(),
		removeListener: vi.fn(),
		dispatchEvent: vi.fn(),
	}))

	Object.defineProperty(window.navigator, 'userAgent', {
		configurable: true,
		value: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36',
	})

	Object.defineProperty(window.navigator, 'platform', {
		configurable: true,
		value: 'Linux x86_64',
	})

	Object.defineProperty(window.navigator, 'maxTouchPoints', {
		configurable: true,
		value: 0,
	})
}

describe('useDrawerScrollLock', () => {
	beforeEach(() => {
		vi.restoreAllMocks()
		stubSafariIOS()
		Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1024 })
		Object.defineProperty(document.documentElement, 'clientWidth', { configurable: true, value: 1024 })
		document.body.style.cssText = ''
		document.documentElement.style.cssText = ''
	})

	it('registers the iOS touch scroll guard when a modal drawer opens', async () => {
		const addEventListenerSpy = vi.spyOn(document, 'addEventListener')
		const wrapper = mount(TestHarness, { attachTo: document.body })
		addEventListenerSpy.mockClear()

		;(wrapper.vm as unknown as { setOpen: (value: boolean) => void }).setOpen(true)
		await nextTick()

		expect(addEventListenerSpy).toHaveBeenCalledWith('touchstart', expect.any(Function), {
			passive: false,
			capture: true,
		})
		expect(addEventListenerSpy).toHaveBeenCalledWith('touchmove', expect.any(Function), {
			passive: false,
			capture: true,
		})
		expect(addEventListenerSpy).toHaveBeenCalledWith('touchend', expect.any(Function), {
			passive: false,
			capture: true,
		})
		expect(addEventListenerSpy).toHaveBeenCalledWith('focus', expect.any(Function), true)

		wrapper.unmount()
	})

	it('removes the iOS touch scroll guard when the modal drawer closes', async () => {
		const removeEventListenerSpy = vi.spyOn(document, 'removeEventListener')
		const wrapper = mount(TestHarness, { attachTo: document.body })
		;(wrapper.vm as unknown as { setOpen: (value: boolean) => void }).setOpen(true)
		await nextTick()
		removeEventListenerSpy.mockClear()

		;(wrapper.vm as unknown as { setOpen: (value: boolean) => void }).setOpen(false)
		await nextTick()

		expect(removeEventListenerSpy).toHaveBeenCalledWith('touchstart', expect.any(Function), true)
		expect(removeEventListenerSpy).toHaveBeenCalledWith('touchmove', expect.any(Function), true)
		expect(removeEventListenerSpy).toHaveBeenCalledWith('touchend', expect.any(Function), true)
		expect(removeEventListenerSpy).toHaveBeenCalledWith('focus', expect.any(Function), true)

		wrapper.unmount()
	})

	it('removes the iOS touch scroll guard when modal mode is disabled', async () => {
		const removeEventListenerSpy = vi.spyOn(document, 'removeEventListener')
		const wrapper = mount(TestHarness)
		;(wrapper.vm as unknown as { setOpen: (value: boolean) => void }).setOpen(true)
		await nextTick()
		removeEventListenerSpy.mockClear()

		;(wrapper.vm as unknown as { setModal: (value: boolean) => void }).setModal(false)
		await nextTick()

		expect(removeEventListenerSpy).toHaveBeenCalledWith('touchstart', expect.any(Function), true)
		expect(removeEventListenerSpy).toHaveBeenCalledWith('touchmove', expect.any(Function), true)
		expect(removeEventListenerSpy).toHaveBeenCalledWith('touchend', expect.any(Function), true)
		expect(removeEventListenerSpy).toHaveBeenCalledWith('focus', expect.any(Function), true)

		wrapper.unmount()
	})

	it('does not install scroll locks when preventScroll is disabled', async () => {
		const addEventListenerSpy = vi.spyOn(document, 'addEventListener')
		const wrapper = mount(TestHarness)
		addEventListenerSpy.mockClear()

		;(wrapper.vm as unknown as { setPreventScroll: (value: boolean) => void }).setPreventScroll(false)
		;(wrapper.vm as unknown as { setOpen: (value: boolean) => void }).setOpen(true)
		await nextTick()

		expect(addEventListenerSpy).not.toHaveBeenCalledWith('touchstart', expect.any(Function), expect.any(Object))
		expect(addEventListenerSpy).not.toHaveBeenCalledWith('touchmove', expect.any(Function), expect.any(Object))
		expect(document.documentElement.style.overscrollBehaviorY).toBe('')
		expect(document.body.style.overscrollBehaviorY).toBe('')
		expect(document.documentElement.style.overflow).toBe('')
		expect(document.body.style.overflow).toBe('')
		expect(document.body.style.position).toBe('')

		wrapper.unmount()
	})

	it('uses the iOS body fix without forcing document overflow', async () => {
		const wrapper = mount(TestHarness)

		;(wrapper.vm as unknown as { setOpen: (value: boolean) => void }).setOpen(true)
		await nextTick()

		expect(document.documentElement.style.overflow).toBe('')
		expect(document.body.style.overflow).toBe('')
		expect(document.body.style.position).toBe('fixed')

		wrapper.unmount()
	})

	it('restores iOS body position styles when an open drawer unmounts', async () => {
		document.body.style.position = 'relative'
		document.body.style.top = '3px'
		document.body.style.left = '4px'
		document.body.style.right = '5px'
		document.body.style.height = '6px'
		const wrapper = mount(TestHarness, { attachTo: document.body })

		;(wrapper.vm as unknown as { setOpen: (value: boolean) => void }).setOpen(true)
		await nextTick()
		expect(document.body.style.position).toBe('fixed')

		wrapper.unmount()

		expect(document.body.style.position).toBe('relative')
		expect(document.body.style.top).toBe('3px')
		expect(document.body.style.left).toBe('4px')
		expect(document.body.style.right).toBe('5px')
		expect(document.body.style.height).toBe('6px')
	})

	it('restores the locked window scroll if iOS moves the root viewport', async () => {
		vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback: FrameRequestCallback) => {
			callback(0)
			return 1
		})
		Object.defineProperty(window, 'scrollX', { configurable: true, value: 0 })
		Object.defineProperty(window, 'scrollY', { configurable: true, value: 120 })

		const wrapper = mount(TestHarness)
		;(wrapper.vm as unknown as { setOpen: (value: boolean) => void }).setOpen(true)
		await nextTick()

		expect(document.body.style.top).toBe('-120px')
		vi.mocked(window.scrollTo).mockClear()

		Object.defineProperty(window, 'scrollY', { configurable: true, value: 188 })
		window.dispatchEvent(new Event('scroll'))

		expect(window.scrollTo).toHaveBeenCalledWith(0, 120)

		wrapper.unmount()
	})

	it('locks document overflow on non-iOS browsers', async () => {
		stubDesktopChrome()
		const wrapper = mount(TestHarness)

		;(wrapper.vm as unknown as { setOpen: (value: boolean) => void }).setOpen(true)
		await nextTick()

		expect(document.documentElement.style.overflow).toBe('hidden')
		expect(document.body.style.overflow).toBe('hidden')
		expect(document.body.style.position).toBe('')

		wrapper.unmount()
	})

	it('compensates desktop scrollbar width while document scroll is locked', async () => {
		stubDesktopChrome()
		Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1200 })
		Object.defineProperty(document.documentElement, 'clientWidth', { configurable: true, value: 1184 })
		document.body.style.paddingRight = '4px'
		const wrapper = mount(TestHarness)

		;(wrapper.vm as unknown as { setOpen: (value: boolean) => void }).setOpen(true)
		await nextTick()

		expect(document.body.style.paddingRight).toBe('20px')
		expect(document.documentElement.style.getPropertyValue('--vuedrawer-scrollbar-width')).toBe('16px')

		;(wrapper.vm as unknown as { setOpen: (value: boolean) => void }).setOpen(false)
		await nextTick()

		expect(document.body.style.paddingRight).toBe('4px')
		expect(document.documentElement.style.getPropertyValue('--vuedrawer-scrollbar-width')).toBe('')

		wrapper.unmount()
	})

	it('temporarily removes stable root scrollbar gutter while desktop scroll is locked', async () => {
		stubDesktopChrome()
		Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1200 })
		Object.defineProperty(document.documentElement, 'clientWidth', { configurable: true, value: 1184 })
		document.documentElement.style.setProperty('scrollbar-gutter', 'stable')
		const wrapper = mount(TestHarness)

		;(wrapper.vm as unknown as { setOpen: (value: boolean) => void }).setOpen(true)
		await nextTick()

		expect(document.documentElement.style.getPropertyValue('scrollbar-gutter')).toBe('auto')
		expect(document.body.style.paddingRight).toBe('16px')
		expect(document.documentElement.style.getPropertyValue('--vuedrawer-scrollbar-width')).toBe('16px')

		;(wrapper.vm as unknown as { setOpen: (value: boolean) => void }).setOpen(false)
		await nextTick()

		expect(document.documentElement.style.getPropertyValue('scrollbar-gutter')).toBe('stable')
		expect(document.body.style.paddingRight).toBe('')
		expect(document.documentElement.style.getPropertyValue('--vuedrawer-scrollbar-width')).toBe('')

		wrapper.unmount()
	})

	it('restores page scrolling when a non-iOS modal drawer closes', async () => {
		stubDesktopChrome()
		document.documentElement.style.overflow = 'auto'
		document.body.style.overflow = 'scroll'

		const wrapper = mount(TestHarness)

		;(wrapper.vm as unknown as { setOpen: (value: boolean) => void }).setOpen(true)
		await nextTick()
		;(wrapper.vm as unknown as { setOpen: (value: boolean) => void }).setOpen(false)
		await nextTick()

		expect(document.documentElement.style.overflow).toBe('auto')
		expect(document.body.style.overflow).toBe('scroll')
		expect(document.body.style.position).toBe('')

		wrapper.unmount()
	})

	it('keeps iOS touch guards but skips body position styles when noBodyStyles is enabled', async () => {
		const addEventListenerSpy = vi.spyOn(document, 'addEventListener')
		const wrapper = mount(TestHarness)
		addEventListenerSpy.mockClear()

		;(wrapper.vm as unknown as { setNoBodyStyles: (value: boolean) => void }).setNoBodyStyles(true)
		;(wrapper.vm as unknown as { setOpen: (value: boolean) => void }).setOpen(true)
		await nextTick()

		expect(addEventListenerSpy).toHaveBeenCalledWith('touchstart', expect.any(Function), {
			passive: false,
			capture: true,
		})
		expect(addEventListenerSpy).toHaveBeenCalledWith('touchmove', expect.any(Function), {
			passive: false,
			capture: true,
		})
		expect(addEventListenerSpy).toHaveBeenCalledWith('touchend', expect.any(Function), {
			passive: false,
			capture: true,
		})
		expect(addEventListenerSpy).toHaveBeenCalledWith('focus', expect.any(Function), true)
		expect(document.documentElement.style.overscrollBehaviorY).toBe('none')
		expect(document.body.style.overscrollBehaviorY).toBe('none')
		expect(document.documentElement.style.overflow).toBe('')
		expect(document.body.style.overflow).toBe('')
		expect(document.body.style.position).toBe('')

		wrapper.unmount()
	})

	it('focuses text inputs without letting Mobile Safari scroll the page first', async () => {
		vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback: FrameRequestCallback) => {
			callback(0)
			return 1
		})
		const wrapper = mount(TestHarness, { attachTo: document.body })
		;(wrapper.vm as unknown as { setOpen: (value: boolean) => void }).setOpen(true)
		await nextTick()

		const input = wrapper.get('.text-input').element as HTMLInputElement
		const focusSpy = vi.spyOn(input, 'focus')

		const touchEndEvent = createTouchEvent('touchend', 40, 80)
		input.dispatchEvent(touchEndEvent)

		expect(touchEndEvent.defaultPrevented).toBe(true)
		expect(focusSpy).toHaveBeenCalled()
		expect(input.style.transform).toBe('')

		wrapper.unmount()
	})

	it('does not prevent native select touchend events', async () => {
		const wrapper = mount(TestHarness, { attachTo: document.body })
		;(wrapper.vm as unknown as { setOpen: (value: boolean) => void }).setOpen(true)
		await nextTick()

		const select = wrapper.get('.native-select').element as HTMLSelectElement

		const touchEndEvent = createTouchEvent('touchend', 40, 80)
		select.dispatchEvent(touchEndEvent)

		expect(touchEndEvent.defaultPrevented).toBe(false)

		wrapper.unmount()
	})

	it('does not prevent horizontal pan gestures inside horizontal scrollers', async () => {
		const wrapper = mount(TestHarness)
		;(wrapper.vm as unknown as { setOpen: (value: boolean) => void }).setOpen(true)
		await nextTick()

		const xScroll = wrapper.get('.x-scroll').element as HTMLDivElement
		const xScrollChild = wrapper.get('.x-scroll-child').element as HTMLDivElement
		Object.defineProperty(xScroll, 'scrollWidth', { configurable: true, value: 320 })
		Object.defineProperty(xScroll, 'clientWidth', { configurable: true, value: 120 })

		xScrollChild.dispatchEvent(createTouchEvent('touchstart', 20, 80))
		const moveEvent = createTouchEvent('touchmove', 80, 86)
		xScrollChild.dispatchEvent(moveEvent)

		expect(moveEvent.defaultPrevented).toBe(false)

		wrapper.unmount()
	})

	it('does not prevent touchmove when a vertical scroller has no vertical overflow', async () => {
		const wrapper = mount(TestHarness)
		;(wrapper.vm as unknown as { setOpen: (value: boolean) => void }).setOpen(true)
		await nextTick()

		const yScroll = wrapper.get('.y-scroll').element as HTMLDivElement
		const yScrollChild = wrapper.get('.y-scroll-child').element as HTMLDivElement
		Object.defineProperty(yScroll, 'scrollHeight', { configurable: true, value: 120 })
		Object.defineProperty(yScroll, 'clientHeight', { configurable: true, value: 120 })
		Object.defineProperty(yScroll, 'scrollTop', { configurable: true, value: 0, writable: true })

		yScrollChild.dispatchEvent(createTouchEvent('touchstart', 40, 80))
		const moveEvent = createTouchEvent('touchmove', 40, 116)
		yScrollChild.dispatchEvent(moveEvent)

		expect(moveEvent.defaultPrevented).toBe(false)

		wrapper.unmount()
	})

	it('allows the marked drawer content itself to act as the vertical scroller', async () => {
		const wrapper = mount(TestHarness)
		;(wrapper.vm as unknown as { setOpen: (value: boolean) => void }).setOpen(true)
		await nextTick()

		const rootScroll = wrapper.get('.root-y-scroll').element as HTMLDivElement
		Object.defineProperty(rootScroll, 'scrollHeight', { configurable: true, value: 420 })
		Object.defineProperty(rootScroll, 'clientHeight', { configurable: true, value: 160 })
		Object.defineProperty(rootScroll, 'scrollTop', { configurable: true, value: 80, writable: true })

		rootScroll.dispatchEvent(createTouchEvent('touchstart', 40, 120))
		const moveEvent = createTouchEvent('touchmove', 40, 84)
		rootScroll.dispatchEvent(moveEvent)

		expect(moveEvent.defaultPrevented).toBe(false)

		wrapper.unmount()
	})

	it('detects an unmarked scrollable body as the vertical scroller, even when touched directly', async () => {
		const wrapper = mount(TestHarness, { attachTo: document.body })
		;(wrapper.vm as unknown as { setOpen: (value: boolean) => void }).setOpen(true)
		await nextTick()

		const plainScroll = wrapper.get('.plain-y-scroll').element as HTMLDivElement
		Object.defineProperty(plainScroll, 'scrollHeight', { configurable: true, value: 420 })
		Object.defineProperty(plainScroll, 'clientHeight', { configurable: true, value: 160 })
		Object.defineProperty(plainScroll, 'scrollTop', { configurable: true, value: 80, writable: true })

		// Touch lands on the scroll container itself (its padding/gaps), not a child.
		// No data-drawer-scroll-axis attribute: computed overflow + scroll room must
		// be enough for the guard to let it scroll instead of blocking the touch.
		plainScroll.dispatchEvent(createTouchEvent('touchstart', 40, 120))
		const moveEvent = createTouchEvent('touchmove', 40, 84)
		plainScroll.dispatchEvent(moveEvent)

		expect(moveEvent.defaultPrevented).toBe(false)

		wrapper.unmount()
	})

	it('walks past unmarked overflow:auto wrappers that have no scroll room', async () => {
		const wrapper = mount(TestHarness, { attachTo: document.body })
		;(wrapper.vm as unknown as { setOpen: (value: boolean) => void }).setOpen(true)
		await nextTick()

		const emptyScroll = wrapper.get('.empty-y-scroll').element as HTMLDivElement
		const emptyScrollChild = wrapper.get('.empty-y-scroll-child').element as HTMLDivElement
		Object.defineProperty(emptyScroll, 'scrollHeight', { configurable: true, value: 120 })
		Object.defineProperty(emptyScroll, 'clientHeight', { configurable: true, value: 120 })
		Object.defineProperty(emptyScroll, 'scrollTop', { configurable: true, value: 0, writable: true })

		// overflow-y:auto but no overflowing content and no attribute: it is not a
		// real scroller, so detection falls through to the document and the guard
		// prevents the touch from chaining into viewport scroll.
		emptyScrollChild.dispatchEvent(createTouchEvent('touchstart', 40, 120))
		const moveEvent = createTouchEvent('touchmove', 40, 84)
		emptyScrollChild.dispatchEvent(moveEvent)

		expect(moveEvent.defaultPrevented).toBe(true)

		wrapper.unmount()
	})

	it('does not prevent touchmove inside no-drag controls', async () => {
		const wrapper = mount(TestHarness)
		;(wrapper.vm as unknown as { setOpen: (value: boolean) => void }).setOpen(true)
		await nextTick()

		const input = wrapper.get('.no-drag-input').element as HTMLInputElement

		input.dispatchEvent(createTouchEvent('touchstart', 40, 80))
		const moveEvent = createTouchEvent('touchmove', 100, 82)
		input.dispatchEvent(moveEvent)

		expect(moveEvent.defaultPrevented).toBe(false)

		wrapper.unmount()
	})

	it('allows scrolling inside drawer branch portals', async () => {
		const wrapper = mount(TestHarness)
		;(wrapper.vm as unknown as { setOpen: (value: boolean) => void }).setOpen(true)
		await nextTick()

		const branch = document.createElement('div')
		branch.setAttribute('data-drawer-branch', '')
		const branchScroll = document.createElement('div')
		branchScroll.style.overflowY = 'auto'
		const branchChild = document.createElement('div')
		branchScroll.appendChild(branchChild)
		branch.appendChild(branchScroll)
		document.body.appendChild(branch)

		Object.defineProperty(branchScroll, 'scrollHeight', { configurable: true, value: 420 })
		Object.defineProperty(branchScroll, 'clientHeight', { configurable: true, value: 160 })
		Object.defineProperty(branchScroll, 'scrollTop', { configurable: true, value: 80, writable: true })

		branchChild.dispatchEvent(createTouchEvent('touchstart', 40, 120))
		const moveEvent = createTouchEvent('touchmove', 40, 84)
		branchChild.dispatchEvent(moveEvent)

		expect(moveEvent.defaultPrevented).toBe(false)

		branch.remove()
		wrapper.unmount()
	})

	it('ignores touches that belong to another open drawer', async () => {
		const wrapper = mount(TestHarness)
		;(wrapper.vm as unknown as { setOpen: (value: boolean) => void }).setOpen(true)
		await nextTick()

		const otherDrawer = document.createElement('div')
		otherDrawer.setAttribute('data-drawer-content', '')
		otherDrawer.setAttribute('data-state', 'open')
		const otherDrawerChild = document.createElement('div')
		otherDrawer.appendChild(otherDrawerChild)
		document.body.appendChild(otherDrawer)

		otherDrawerChild.dispatchEvent(createTouchEvent('touchstart', 12, 24))
		const moveEvent = createTouchEvent('touchmove', 12, 56)
		otherDrawerChild.dispatchEvent(moveEvent)

		expect(moveEvent.defaultPrevented).toBe(false)

		otherDrawer.remove()
		wrapper.unmount()
	})

	it('removes its touch guard on unmount even when another drawer is open', async () => {
		const removeEventListenerSpy = vi.spyOn(document, 'removeEventListener')
		const wrapper = mount(TestHarness)
		;(wrapper.vm as unknown as { setOpen: (value: boolean) => void }).setOpen(true)
		await nextTick()
		removeEventListenerSpy.mockClear()

		const otherDrawer = document.createElement('div')
		otherDrawer.setAttribute('data-drawer-content', '')
		otherDrawer.setAttribute('data-state', 'open')
		document.body.appendChild(otherDrawer)

		wrapper.unmount()

		expect(removeEventListenerSpy).toHaveBeenCalledWith('touchstart', expect.any(Function), true)
		expect(removeEventListenerSpy).toHaveBeenCalledWith('touchmove', expect.any(Function), true)

		otherDrawer.remove()
	})
})
