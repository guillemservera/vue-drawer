import { afterEach, describe, expect, it, vi } from 'vitest'
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

function pointer(target: Element, type: string, y: number, timeStamp: number, x = 0) {
	const event = new PointerEvent(type, { bubbles: true, clientX: x, clientY: y, button: 0 })
	Object.defineProperty(event, 'timeStamp', { value: timeStamp })
	target.dispatchEvent(event)
}

const isLocked = () => document.documentElement.style.overflow === 'hidden'

afterEach(async () => {
	document.body.innerHTML = ''
	await flush()
	vi.restoreAllMocks()
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
