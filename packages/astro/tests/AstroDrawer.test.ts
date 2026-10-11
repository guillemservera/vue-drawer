import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AstroDrawer } from '../src/index'

const flush = () => new Promise(resolve => setTimeout(resolve, 0))

function mount(attrs = '') {
	document.body.insertAdjacentHTML('beforeend', `
		<astro-drawer id="d" ${attrs}>
			<dialog aria-label="Menu"><div data-drawer-handle></div><p>Content</p></dialog>
		</astro-drawer>`)
	const drawer = document.body.lastElementChild as AstroDrawer
	const dialog = drawer.querySelector('dialog')!
	return { drawer, dialog }
}

// Only `Date` is faked: vue's drag guards (recently opened, scroll-lock timeout) read it, and a drag in a test starts right after opening.
beforeEach(() => {
	vi.useFakeTimers({ toFake: ['Date'] })
})

function pointer(target: Element, type: string, y: number, timeStamp: number, x = 0) {
	// Each press comes after the guards' windows, unless a test says otherwise by pressing twice within one `timeStamp` window.
	if (type === 'pointerdown') vi.setSystemTime(Date.now() + 600)
	const event = new PointerEvent(type, { bubbles: true, clientX: x, clientY: y, button: 0, isPrimary: true })
	Object.defineProperty(event, 'timeStamp', { value: timeStamp })
	target.dispatchEvent(event)
}

const isLocked = () => document.documentElement.style.overflow === 'hidden'

afterEach(async () => {
	document.body.innerHTML = ''
	await flush()
	vi.restoreAllMocks()
	vi.useRealTimers()
})

describe('astro-drawer', () => {
	it('registers the element', () => {
		expect(customElements.get('astro-drawer')).toBe(AstroDrawer)
	})

	it('opens and closes through show()/close(), the property and the attribute', async () => {
		const { drawer, dialog } = mount()
		const onClose = vi.fn()
		drawer.addEventListener('close', onClose)

		drawer.show()
		expect(dialog.open).toBe(true)
		expect(drawer.dataset.state).toBe('open')
		expect(isLocked()).toBe(true)

		drawer.close()
		await flush()
		expect(dialog.open).toBe(false)
		expect(drawer.open).toBe(false)
		expect(drawer.dataset.state).toBeUndefined()
		expect(onClose).toHaveBeenCalledTimes(1)
		expect(isLocked()).toBe(false)

		drawer.open = true
		expect(dialog.open).toBe(true)
		drawer.removeAttribute('open')
		await flush()
		expect(dialog.open).toBe(false)
		expect(onClose).toHaveBeenCalledTimes(2)
	})

	it('opens on connect when rendered with the open attribute', () => {
		const { dialog } = mount('open')
		expect(dialog.open).toBe(true)
		expect(isLocked()).toBe(true)
	})

	it('waits for the close transition before closing the dialog', async () => {
		const { drawer, dialog } = mount('open')
		let finish!: () => void
		const finished = new Promise<void>((resolve) => { finish = resolve })
		dialog.getAnimations = () => [{ effect: { target: dialog }, finished } as unknown as Animation]

		drawer.close()
		await flush()
		expect(dialog.open).toBe(true)
		expect(drawer.dataset.state).toBeUndefined()

		finish()
		await flush()
		expect(dialog.open).toBe(false)
	})

	it('keeps the dialog open when reopened during the close transition', async () => {
		const { drawer, dialog } = mount('open')
		let finish!: () => void
		const finished = new Promise<void>((resolve) => { finish = resolve })
		dialog.getAnimations = () => [{ effect: { target: dialog }, finished } as unknown as Animation]

		drawer.close()
		drawer.show()
		finish()
		await flush()
		expect(dialog.open).toBe(true)
		expect(drawer.dataset.state).toBe('open')
	})

	it('closes on Escape (dialog cancel) with the animated path', async () => {
		const { drawer, dialog } = mount('open')
		const cancel = new Event('cancel', { cancelable: true })
		dialog.dispatchEvent(cancel)
		expect(cancel.defaultPrevented).toBe(true)
		await flush()
		expect(drawer.open).toBe(false)
		expect(dialog.open).toBe(false)
	})

	it('cleans up when the dialog closes natively', async () => {
		const { drawer, dialog } = mount('open')
		dialog.removeAttribute('open')
		dialog.dispatchEvent(new Event('close'))
		expect(drawer.open).toBe(false)
		expect(isLocked()).toBe(false)
	})

	it('closes on backdrop click only', async () => {
		const { drawer, dialog } = mount('open')
		vi.spyOn(dialog, 'getBoundingClientRect').mockReturnValue({ top: 300, bottom: 800, left: 0, right: 400 } as DOMRect)

		dialog.dispatchEvent(new MouseEvent('click', { bubbles: true, clientX: 100, clientY: 400 }))
		dialog.querySelector('p')!.dispatchEvent(new MouseEvent('click', { bubbles: true, clientX: 100, clientY: 100 }))
		await flush()
		expect(dialog.open).toBe(true)

		dialog.dispatchEvent(new MouseEvent('click', { bubbles: true, clientX: 100, clientY: 100 }))
		await flush()
		expect(dialog.open).toBe(false)
	})

	describe('drag to dismiss', () => {
		function setup() {
			const mounted = mount('open')
			Object.defineProperty(mounted.dialog, 'offsetHeight', { configurable: true, value: 400 })
			return { ...mounted, handle: mounted.dialog.querySelector('[data-drawer-handle]')! }
		}

		it('ignores moves under the activation distance and upward drags', () => {
			const { dialog, handle } = setup()
			pointer(handle, 'pointerdown', 100, 0)
			pointer(handle, 'pointermove', 104, 10)
			expect(dialog.style.transform).toBe('')
			pointer(handle, 'pointermove', 50, 20)
			pointer(handle, 'pointermove', 200, 30)
			expect(dialog.style.transform).toBe('')
		})

		it('follows the pointer and snaps back under the distance and velocity thresholds', async () => {
			const { dialog, handle } = setup()
			pointer(handle, 'pointerdown', 100, 0)
			pointer(handle, 'pointermove', 190, 500)
			expect(dialog.style.transform).toBe('translateY(90px)')
			pointer(handle, 'pointerup', 190, 1000) // 90px < 25% of 400px, 0.09px/ms
			await flush()
			expect(dialog.open).toBe(true)
			expect(dialog.style.transform).toBe('')
		})

		it('dismisses past the distance threshold', async () => {
			const { dialog, handle } = setup()
			pointer(handle, 'pointerdown', 100, 0)
			pointer(handle, 'pointermove', 250, 1000)
			pointer(handle, 'pointerup', 250, 2000)
			await flush()
			expect(dialog.open).toBe(false)
		})

		it('dismisses a short fast flick', async () => {
			const { dialog } = setup()
			const content = dialog.querySelector('p')!
			pointer(content, 'pointerdown', 100, 0)
			pointer(content, 'pointermove', 140, 40)
			pointer(content, 'pointerup', 150, 50) // 1px/ms
			await flush()
			expect(dialog.open).toBe(false)
		})

		it('does not drag from the backdrop', () => {
			const { dialog } = setup()
			vi.spyOn(dialog, 'getBoundingClientRect').mockReturnValue({ top: 300, bottom: 800, left: 0, right: 400 } as DOMRect)
			pointer(dialog, 'pointerdown', 100, 0, 50)
			pointer(dialog, 'pointermove', 250, 10, 50)
			expect(dialog.style.transform).toBe('')
		})

		it('does not dismiss on pointercancel', async () => {
			const { dialog, handle } = setup()
			pointer(handle, 'pointerdown', 100, 0)
			pointer(handle, 'pointermove', 300, 10)
			pointer(handle, 'pointercancel', 300, 20)
			await flush()
			expect(dialog.open).toBe(true)
			expect(dialog.style.transform).toBe('')
		})

		it('lets scrolled content and no-drag zones keep the gesture', () => {
			const { dialog } = setup()
			const content = dialog.querySelector('p')!
			Object.defineProperty(dialog, 'scrollTop', { configurable: true, value: 20 })
			pointer(content, 'pointerdown', 100, 0)
			pointer(content, 'pointermove', 200, 10)
			expect(dialog.style.transform).toBe('')

			const handle = dialog.querySelector('[data-drawer-handle]')!
			pointer(handle, 'pointerdown', 100, 0)
			pointer(handle, 'pointermove', 200, 10)
			expect(dialog.style.transform).toBe('translateY(100px)') // the handle always drags
			pointer(handle, 'pointercancel', 200, 20)

			Object.defineProperty(dialog, 'scrollTop', { configurable: true, value: 0 })
			content.setAttribute('data-drawer-no-drag', '')
			pointer(content, 'pointerdown', 100, 0)
			pointer(content, 'pointermove', 200, 10)
			expect(dialog.style.transform).toBe('')
		})
	})

	describe('direction', () => {
		function setup(direction: string) {
			const mounted = mount(`open direction="${direction}"`)
			Object.defineProperty(mounted.dialog, 'offsetWidth', { configurable: true, value: 300 })
			Object.defineProperty(mounted.dialog, 'offsetHeight', { configurable: true, value: 400 })
			return { ...mounted, content: mounted.dialog.querySelector('p')! }
		}
		const drag = (target: Element, [x0, y0]: number[], [x1, y1]: number[], end = 'pointerup') => {
			pointer(target, 'pointerdown', y0, 0, x0)
			pointer(target, 'pointermove', y1, 1000, x1)
			pointer(target, end, y1, 2000, x1)
		}

		it.each([
			['right', [100, 0], [190, 0], 'translateX(90px)'],
			['left', [200, 0], [110, 0], 'translateX(-90px)'],
			['top', [0, 200], [0, 110], 'translateY(-90px)'],
			['bogus', [0, 100], [0, 190], 'translateY(90px)'], // unknown values fall back to bottom
		])('%s follows the pointer toward its closing edge only', (direction, from, to, transform) => {
			const { dialog, content } = setup(direction)
			pointer(content, 'pointerdown', from[1], 0, from[0])
			pointer(content, 'pointermove', to[1], 500, to[0])
			expect(dialog.style.transform).toBe(transform)
			pointer(content, 'pointercancel', to[1], 600, to[0])

			// The opposite way never starts a drag.
			pointer(content, 'pointerdown', to[1], 0, to[0])
			pointer(content, 'pointermove', from[1], 500, from[0])
			expect(dialog.style.transform).toBe('')
		})

		it('ignores cross-axis drags on a sidebar and sizes the threshold by its width', async () => {
			const { dialog, content } = setup('right')
			pointer(content, 'pointerdown', 100, 0, 100)
			pointer(content, 'pointermove', 300, 10, 100)
			expect(dialog.style.transform).toBe('')

			drag(content, [100, 0], [170, 0]) // 70px < 25% of 300px
			await flush()
			expect(dialog.open).toBe(true)
			drag(content, [100, 0], [180, 0]) // 80px > 75px
			await flush()
			expect(dialog.open).toBe(false)
		})

		it('lets sidebars pan vertically and non-scrolling sheets block panning', () => {
			expect(mount('open direction="left"').dialog.style.touchAction).toBe('pan-y pinch-zoom')
			expect(mount('open direction="top"').dialog.style.touchAction).toBe('pinch-zoom')
			expect(mount('open').dialog.style.touchAction).toBe('pinch-zoom')
		})

		it('lets content scrolled away from the closing edge keep the gesture', () => {
			const scroll = (el: Element, values: Record<string, number>) => {
				for (const [key, value] of Object.entries(values)) Object.defineProperty(el, key, { configurable: true, value })
			}
			const blocked = (dialog: HTMLDialogElement, target: Element, from: number[], to: number[]) => {
				pointer(target, 'pointerdown', from[1], 0, from[0])
				pointer(target, 'pointermove', to[1], 10, to[0])
				const ok = dialog.style.transform === ''
				pointer(target, 'pointercancel', to[1], 20, to[0])
				return ok
			}

			// right: any horizontal scroll offset owns the drag
			let { dialog, content } = setup('right')
			scroll(dialog, { scrollLeft: 30 })
			expect(blocked(dialog, content, [100, 0], [200, 0])).toBe(true)
			expect(blocked(dialog, dialog.querySelector('[data-drawer-handle]')!, [100, 0], [200, 0])).toBe(false)
			scroll(dialog, { scrollLeft: 0, scrollTop: 50 }) // vertical scroll does not matter to a sidebar
			expect(blocked(dialog, content, [100, 0], [200, 0])).toBe(false)
			dialog.closest('astro-drawer')!.remove();

			// left: a horizontal scroller not at its end owns the drag; an ellipsized (overflow: hidden) label does not
			({ dialog, content } = setup('left'))
			content.style.overflowX = 'auto'
			scroll(content, { scrollWidth: 500, clientWidth: 200, scrollLeft: 0 })
			expect(blocked(dialog, content, [200, 0], [100, 0])).toBe(true)
			scroll(content, { scrollLeft: 300 })
			expect(blocked(dialog, content, [200, 0], [100, 0])).toBe(false)
			content.style.overflowX = 'hidden'
			scroll(content, { scrollLeft: 0 })
			expect(blocked(dialog, content, [200, 0], [100, 0])).toBe(false)
			dialog.closest('astro-drawer')!.remove();

			// top: content that can still scroll down owns the upward drag
			({ dialog, content } = setup('top'))
			dialog.style.overflowY = 'auto'
			scroll(dialog, { scrollHeight: 900, clientHeight: 400, scrollTop: 0 })
			expect(blocked(dialog, content, [0, 300], [0, 200])).toBe(true)
			scroll(dialog, { scrollTop: 500 })
			expect(blocked(dialog, content, [0, 300], [0, 200])).toBe(false)
		})
	})

	describe('dismissible="false"', () => {
		it('ignores Escape, backdrop clicks and drags but still closes explicitly', async () => {
			const { drawer, dialog } = mount('open dismissible="false"')
			Object.defineProperty(dialog, 'offsetHeight', { configurable: true, value: 400 })
			vi.spyOn(dialog, 'getBoundingClientRect').mockReturnValue({ top: 300, bottom: 800, left: 0, right: 400 } as DOMRect)
			expect(dialog.getAttribute('closedby')).toBe('none')

			const cancel = new Event('cancel', { cancelable: true })
			dialog.dispatchEvent(cancel)
			expect(cancel.defaultPrevented).toBe(true)
			dialog.dispatchEvent(new MouseEvent('click', { bubbles: true, clientX: 100, clientY: 100 }))
			const handle = dialog.querySelector('[data-drawer-handle]')!
			pointer(handle, 'pointerdown', 400, 0, 100)
			pointer(handle, 'pointermove', 700, 10, 100)
			expect(dialog.style.transform).toBe('')
			pointer(handle, 'pointerup', 700, 20, 100)
			await flush()
			expect(drawer.open).toBe(true)
			expect(dialog.open).toBe(true)

			drawer.close()
			await flush()
			expect(dialog.open).toBe(false)
		})

		it('follows attribute changes', () => {
			const { drawer, dialog } = mount('open dismissible="false"')
			drawer.removeAttribute('dismissible')
			expect(dialog.hasAttribute('closedby')).toBe(false)
			drawer.setAttribute('dismissible', 'false')
			expect(dialog.getAttribute('closedby')).toBe('none')
		})

		it.each(['', 'dismissible="false"'])('closes from [data-drawer-close] (%s) unless the click is prevented', async (attrs) => {
			const { dialog } = mount(`open ${attrs}`)
			dialog.insertAdjacentHTML('beforeend', '<button data-drawer-close><span>Done</span></button>')
			const span = dialog.querySelector('[data-drawer-close] span')!
			span.addEventListener('click', event => event.preventDefault(), { once: true })
			span.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
			await flush()
			expect(dialog.open).toBe(true)
			span.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
			await flush()
			expect(dialog.open).toBe(false)
		})
	})

	describe('scroll lock', () => {
		it('releases the lock when the element is removed while open', async () => {
			const { drawer } = mount('open')
			expect(isLocked()).toBe(true)
			drawer.remove()
			expect(isLocked()).toBe(false)
		})

		it('releases only its own lock (close then removal, removal then the queued close)', async () => {
			const a = mount('open')
			const b = mount('open')
			const c = mount('open')
			a.drawer.close()
			await flush()
			a.drawer.remove()
			c.drawer.remove()
			await flush()
			expect(isLocked()).toBe(true)
			b.drawer.close()
			await flush()
			expect(isLocked()).toBe(false)
		})

		it('reopens after removal and re-insertion', () => {
			const { drawer, dialog } = mount('open')
			drawer.remove()
			document.body.append(drawer)
			expect(dialog.open).toBe(true)
			expect(isLocked()).toBe(true)
		})

		it('pins the body and guards touches on iOS Safari', async () => {
			vi.spyOn(window.navigator, 'userAgent', 'get').mockReturnValue('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1')
			vi.spyOn(window.navigator, 'platform', 'get').mockReturnValue('iPhone')
			window.matchMedia = vi.fn().mockReturnValue({ matches: false }) as typeof window.matchMedia
			Object.defineProperty(window, 'scrollY', { configurable: true, value: 250 })
			const addListener = vi.spyOn(document, 'addEventListener')

			const { drawer } = mount('open')
			expect(document.body.style.position).toBe('fixed')
			expect(document.body.style.top).toBe('-250px')
			expect(isLocked()).toBe(false) // iOS relies on the body pin, not root overflow
			expect(addListener).toHaveBeenCalledWith('touchmove', expect.any(Function), expect.objectContaining({ passive: false }))

			drawer.remove()
			expect(document.body.style.position).toBe('')
			expect(document.body.style.top).toBe('')
			Object.defineProperty(window, 'scrollY', { configurable: true, value: 0 })
		})

		it('does not scroll the next page when a client router swapped the body while it was pinned', () => {
			vi.spyOn(window.navigator, 'userAgent', 'get').mockReturnValue('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1')
			vi.spyOn(window.navigator, 'platform', 'get').mockReturnValue('iPhone')
			window.matchMedia = vi.fn().mockReturnValue({ matches: false }) as typeof window.matchMedia
			Object.defineProperty(window, 'scrollY', { configurable: true, value: 250 })
			const scrollTo = vi.spyOn(window, 'scrollTo')

			mount('open')
			expect(document.body.style.position).toBe('fixed')
			document.documentElement.replaceChild(document.createElement('body'), document.body) // the router's swap
			expect(scrollTo).not.toHaveBeenCalled()
			expect(document.body.style.position).toBe('')
			Object.defineProperty(window, 'scrollY', { configurable: true, value: 0 })
		})
	})

	describe('snap points', () => {
		// jsdom's viewport is 1024x768.
		function setup(attrs = '') {
			const mounted = mount(`open snap-points="200px, 0.5, 0.9" ${attrs}`)
			return { ...mounted, handle: mounted.dialog.querySelector('[data-drawer-handle]')! }
		}
		const rest = (dialog: HTMLDialogElement) => dialog.style.getPropertyValue('--drawer-rest')
		const drag = (target: Element, y0: number, y1: number, ms: number, end = 'pointerup') => {
			pointer(target, 'pointerdown', y0, 0)
			pointer(target, 'pointermove', y1, ms / 2)
			pointer(target, end, y1, ms)
		}

		it('rests on the active snap point, the first by default or when unknown', () => {
			const { drawer, dialog } = setup()
			expect(rest(dialog)).toBe('translateY(568px)') // 768 - 200px
			drawer.setAttribute('active-snap-point', '0.5')
			expect(rest(dialog)).toBe('translateY(384px)')
			drawer.setAttribute('active-snap-point', '0.50') // same value, vue's === on parsed numbers
			expect(rest(dialog)).toBe('translateY(384px)')
			drawer.setAttribute('active-snap-point', 'bogus')
			expect(rest(dialog)).toBe('translateY(568px)')
			expect(mount('open').dialog.style.getPropertyValue('--drawer-rest')).toBe('translateY(0px)')
		})

		it('measures sidebars on the viewport width and top sheets on its height, all hiding toward their own edge', () => {
			const { dialog } = mount('open direction="right" snap-points="0.25, 1"')
			expect(rest(dialog)).toBe('translateX(768px)') // 1024 - 256
			expect(rest(mount('open direction="left" snap-points="0.25, 1"').dialog)).toBe('translateX(-768px)')
			expect(rest(mount('open direction="top" snap-points="0.25, 1"').dialog)).toBe('translateY(-576px)') // 768 - 192
		})

		it('shows the backdrop from fade-from-index (default: the last snap point)', () => {
			const { drawer } = setup()
			expect(drawer.hasAttribute('data-backdrop-hidden')).toBe(true)
			drawer.setAttribute('active-snap-point', '0.9')
			expect(drawer.hasAttribute('data-backdrop-hidden')).toBe(false)
			const faded = setup('fade-from-index="1" active-snap-point="0.5"').drawer
			expect(faded.hasAttribute('data-backdrop-hidden')).toBe(false)
			expect(setup('fade-from-index="0"').drawer.hasAttribute('data-backdrop-hidden')).toBe(false)
			expect(mount('open').drawer.hasAttribute('data-backdrop-hidden')).toBe(false)
		})

		it('lets overflowing content scroll on touch only at the last snap point', () => {
			const { drawer, dialog } = setup()
			Object.defineProperty(dialog, 'scrollHeight', { configurable: true, value: 2000 })
			Object.defineProperty(dialog, 'clientHeight', { configurable: true, value: 768 })
			drawer.setAttribute('active-snap-point', '0.5')
			expect(dialog.style.touchAction).toBe('pinch-zoom')
			drawer.setAttribute('active-snap-point', '0.9')
			expect(dialog.style.touchAction).toBe('')
		})

		it('drags between snap points: a slow release lands on the nearest and announces it', () => {
			const { drawer, dialog, handle } = setup()
			const onChange = vi.fn()
			drawer.addEventListener('snap-point-change', event => onChange((event as CustomEvent).detail))

			pointer(handle, 'pointerdown', 600, 0)
			pointer(handle, 'pointermove', 400, 1000) // up toward 0.5 (offset 368)
			expect(dialog.style.transform).toBe('translateY(368px)')
			pointer(handle, 'pointerup', 400, 2000)
			expect(drawer.getAttribute('active-snap-point')).toBe('0.5')
			expect(onChange).toHaveBeenCalledWith(0.5)
			expect(dialog.style.transform).toBe('')
			expect(rest(dialog)).toBe('translateY(384px)')

			drag(handle, 600, 590, 2000) // a small slow drag stays put, no event
			expect(drawer.getAttribute('active-snap-point')).toBe('0.5')
			expect(onChange).toHaveBeenCalledTimes(1)

			drawer.setAttribute('active-snap-point', '0.9') // set from outside: moves, no event
			expect(rest(dialog)).toBe(`translateY(${768 - 768 * 0.9}px)`)
			expect(onChange).toHaveBeenCalledTimes(1)
		})

		it('only drags toward the open edge below the last snap point, and never past it', () => {
			const { drawer, dialog, handle } = setup('active-snap-point="0.9"')
			pointer(handle, 'pointerdown', 300, 0)
			pointer(handle, 'pointermove', 200, 500)
			expect(dialog.style.transform).toBe('')
			pointer(handle, 'pointerup', 200, 600)

			drawer.setAttribute('active-snap-point', '0.5')
			pointer(handle, 'pointerdown', 300, 0)
			pointer(handle, 'pointermove', -500, 500)
			expect(dialog.style.transform).toBe(`translateY(${768 - 768 * 0.9}px)`) // clamped at 0.9
			pointer(handle, 'pointercancel', -500, 600)
			expect(drawer.getAttribute('active-snap-point')).toBe('0.5')
		})

		it('dismisses below the first snap point, or stops there when not dismissible', async () => {
			const { dialog, handle } = setup()
			drag(handle, 600, 660, 2000) // 60px > 25% of the 200px visible
			await flush()
			expect(dialog.open).toBe(false)

			const locked = setup('dismissible="false"')
			drag(locked.handle, 600, 900, 2000)
			pointer(locked.handle, 'pointerdown', 600, 0)
			pointer(locked.handle, 'pointermove', 900, 1000)
			expect(locked.dialog.style.transform).toBe('translateY(568px)') // clamped at the first snap point
			pointer(locked.handle, 'pointerup', 900, 2000)
			await flush()
			expect(locked.dialog.open).toBe(true)
			pointer(locked.handle, 'pointerdown', 600, 0) // still drags up between snap points
			pointer(locked.handle, 'pointermove', 400, 1000)
			pointer(locked.handle, 'pointerup', 400, 2000)
			expect(locked.drawer.getAttribute('active-snap-point')).toBe('0.5')
		})

		it('snaps by velocity: a flick moves one snap point, a hard one skips to the end unless sequential', async () => {
			const { drawer, dialog, handle } = setup('active-snap-point="0.9"')
			drag(handle, 100, 150, 50) // within 25% of the top snap point: stays, whatever the speed
			expect(drawer.getAttribute('active-snap-point')).toBe('0.9')
			drag(handle, 100, 300, 200) // 1px/ms down
			expect(drawer.getAttribute('active-snap-point')).toBe('0.5')
			drag(handle, 400, 360, 40) // 1px/ms up
			expect(drawer.getAttribute('active-snap-point')).toBe('0.9')

			const sequential = setup('active-snap-point="0.9" snap-to-sequential-point')
			drag(sequential.handle, 100, 400, 20) // 15px/ms
			expect(sequential.drawer.getAttribute('active-snap-point')).toBe('0.5')
			await flush()
			expect(sequential.dialog.open).toBe(true)

			drag(handle, 100, 400, 20) // 15px/ms from the top snap point
			await flush()
			expect(dialog.open).toBe(false)
		})
	})

	describe('nested drawers', () => {
		function mountNested(parentAttrs = '', childAttrs = '') {
			document.body.insertAdjacentHTML('beforeend', `
				<astro-drawer id="p" open ${parentAttrs}>
					<dialog aria-label="Parent"><div data-drawer-handle></div><p>Parent</p>
						<astro-drawer id="c" ${childAttrs}>
							<dialog aria-label="Child"><div data-drawer-handle></div><p>Child</p><button data-drawer-close>Done</button></dialog>
						</astro-drawer>
					</dialog>
				</astro-drawer>`)
			const parent = document.getElementById('p') as AstroDrawer
			const child = document.getElementById('c') as AstroDrawer
			const parentDialog = parent.querySelector('dialog')!
			const childDialog = child.querySelector('dialog')!
			for (const d of [parentDialog, childDialog]) Object.defineProperty(d, 'offsetHeight', { configurable: true, value: 400 })
			child.show()
			return { parent, child, parentDialog, childDialog }
		}

		it('scales the parent back with the CSS scale property only when both open from the same side', async () => {
			const { child, parentDialog } = mountNested()
			expect(parentDialog.style.scale).toBe(`${1 - 16 / 1024}`)
			expect(parentDialog.style.translate).toBe('0 -16px')
			expect(parentDialog.style.transform).toBe('')
			child.close()
			expect(parentDialog.style.scale).toBe('') // scales back up as the child starts closing
			expect(parentDialog.style.translate).toBe('')
			document.body.innerHTML = ''

			const side = mountNested('', 'direction="right"')
			expect(side.parentDialog.style.scale).toBe('')
			document.body.innerHTML = ''

			const right = mountNested('direction="right"', 'direction="right"')
			expect(right.parentDialog.style.translate).toBe('-16px')
		})

		it('keeps the child\'s events away from the parent', async () => {
			const { parentDialog, childDialog } = mountNested()
			const childHandle = childDialog.querySelector('[data-drawer-handle]')!
			pointer(childHandle, 'pointerdown', 100, 0)
			pointer(childHandle, 'pointermove', 190, 500)
			expect(childDialog.style.transform).toBe('translateY(90px)')
			expect(parentDialog.style.transform).toBe('')
			pointer(childHandle, 'pointercancel', 190, 600)

			vi.spyOn(childDialog, 'getBoundingClientRect').mockReturnValue({ top: 300, bottom: 800, left: 0, right: 400 } as DOMRect)
			childDialog.dispatchEvent(new MouseEvent('click', { bubbles: true, clientX: 100, clientY: 100 })) // child backdrop
			await flush()
			expect(childDialog.open).toBe(false)
			expect(parentDialog.open).toBe(true)
		})

		it('closes only the child from its [data-drawer-close]', async () => {
			const { parent, child, childDialog, parentDialog } = mountNested()
			childDialog.querySelector('button')!.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
			await flush()
			expect(child.open).toBe(false)
			expect(parent.open).toBe(true)
			expect(parentDialog.open).toBe(true)
			expect(isLocked()).toBe(true)
		})

		it.each([
			['close()', (parent: AstroDrawer) => parent.close()],
			['open attribute removal', (parent: AstroDrawer) => parent.removeAttribute('open')],
			['a native close', (parent: AstroDrawer) => parent.querySelector('dialog')!.close()],
			['element removal', (parent: AstroDrawer) => parent.remove()],
		])('closes the child and releases every lock on the parent\'s %s', async (_, closeParent) => {
			const other = mount('open') // a third, unrelated open drawer keeps one lock
			const { parent, child, childDialog, parentDialog } = mountNested()
			const onChildClose = vi.fn()
			child.addEventListener('close', onChildClose)
			closeParent(parent)
			await flush()
			expect(childDialog.open).toBe(false)
			expect(parentDialog.open).toBe(false)
			expect(parentDialog.style.scale).toBe('')
			// A removed drawer keeps its `open` attribute (re-insertion reopens it) and fires no `close`, like a lone one.
			if (parent.isConnected) {
				expect(child.open).toBe(false)
				expect(onChildClose).toHaveBeenCalledTimes(1)
			}
			expect(isLocked()).toBe(true)
			other.drawer.close()
			await flush()
			expect(isLocked()).toBe(false)
		})

		it('scales the parent again when the child reopens during its close transition', async () => {
			const { child, childDialog, parentDialog } = mountNested()
			let finish!: () => void
			const finished = new Promise<void>((resolve) => { finish = resolve })
			childDialog.getAnimations = () => [{ effect: { target: childDialog }, finished } as unknown as Animation]
			child.close()
			expect(parentDialog.style.scale).toBe('')
			child.show()
			finish()
			await flush()
			expect(childDialog.open).toBe(true)
			expect(parentDialog.style.scale).toBe(`${1 - 16 / 1024}`)
		})

		it('restores the parent when an open child is removed', () => {
			const { child, parentDialog } = mountNested()
			child.remove()
			expect(parentDialog.style.scale).toBe('')
			expect(isLocked()).toBe(true)
		})
	})

	it('opens from a declarative trigger', () => {
		const { dialog } = mount()
		document.body.insertAdjacentHTML('beforeend', '<button data-drawer-open="#d"><span>Open</span></button>')
		document.querySelector('button span')!.dispatchEvent(new MouseEvent('click', { bubbles: true }))
		expect(dialog.open).toBe(true)
	})

	it('guards against double registration', async () => {
		vi.resetModules()
		await expect(import('../src/index')).resolves.toBeDefined()
		expect(customElements.get('astro-drawer')).toBe(AstroDrawer)
	})
})
