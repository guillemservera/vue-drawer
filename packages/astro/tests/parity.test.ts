import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import '../src/index'
import type { AstroDrawer } from '../src/index'

// vue-drawer's props and events, one behavior per test. Only `Date` is faked: vue's drag guards read it.
const flush = () => new Promise(resolve => setTimeout(resolve, 0))

function mount(attrs = '', inner = '<div data-drawer-handle></div><p>Content</p>', dialogAttrs = 'aria-label="Menu"') {
	document.body.insertAdjacentHTML('beforeend', `<astro-drawer id="d" ${attrs}><dialog ${dialogAttrs}>${inner}</dialog></astro-drawer>`)
	const drawer = document.body.lastElementChild as AstroDrawer
	return { drawer, dialog: drawer.querySelector('dialog')! }
}

function pointer(target: Element, type: string, y: number, timeStamp: number, x = 0, init: PointerEventInit = {}) {
	if (type === 'pointerdown') vi.setSystemTime(Date.now() + 600)
	const event = new PointerEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: y, button: 0, isPrimary: true, ...init })
	Object.defineProperty(event, 'timeStamp', { value: timeStamp })
	target.dispatchEvent(event)
	return event
}

const sized = (dialog: HTMLElement, height = 400) => Object.defineProperty(dialog, 'offsetHeight', { configurable: true, value: height })
const spy = (el: Element, type: string) => {
	const fn = vi.fn()
	el.addEventListener(type, fn)
	return fn
}
const isLocked = () => document.documentElement.style.overflow === 'hidden'

beforeEach(() => {
	vi.useFakeTimers({ toFake: ['Date'] })
})

afterEach(async () => {
	vi.useRealTimers()
	document.body.innerHTML = ''
	await flush()
	vi.restoreAllMocks()
})

describe('lifecycle events', () => {
	it('announces open-change, after-open, animation-end, after-close and close in order', async () => {
		const { drawer } = mount()
		const seen: string[] = []
		for (const type of ['open-change', 'after-open', 'animation-end', 'after-close', 'close']) {
			drawer.addEventListener(type, (event) => {
				const detail = (event as CustomEvent).detail
				seen.push(detail === undefined || detail === null ? type : `${type}:${detail}`)
			})
		}
		drawer.show()
		await flush()
		expect(seen).toEqual(['open-change:true', 'after-open', 'animation-end:true'])

		seen.length = 0
		drawer.close()
		await flush()
		// vue emits `close` with the state change, then `after-close` once the transition is over.
		expect(seen).toEqual(['open-change:false', 'close', 'after-close', 'animation-end:false'])
	})

	it('announces drag with the dragged fraction and release with whether it stays open', async () => {
		const { drawer, dialog } = mount('open')
		sized(dialog)
		const handle = dialog.querySelector('[data-drawer-handle]')!
		const drags: number[] = []
		drawer.addEventListener('drag', event => drags.push((event as unknown as CustomEvent).detail.percentageDragged))
		const release = spy(drawer, 'release')

		pointer(handle, 'pointerdown', 100, 0)
		pointer(handle, 'pointermove', 180, 500)
		expect(drags).toEqual([0.2])
		pointer(handle, 'pointerup', 180, 1000)
		expect(release.mock.calls[0]![0].detail.open).toBe(true)

		pointer(handle, 'pointerdown', 100, 2000)
		pointer(handle, 'pointermove', 300, 2100)
		pointer(handle, 'pointerup', 300, 2200)
		await flush()
		expect(release.mock.calls[1]![0].detail.open).toBe(false)
		expect(drawer.open).toBe(false)
	})
})

describe('preventable events', () => {
	it('escape-key-down keeps the drawer open when prevented, and closes it otherwise', async () => {
		const { drawer, dialog } = mount('open')
		const prevent = (event: Event) => event.preventDefault()
		drawer.addEventListener('escape-key-down', prevent)
		dialog.dispatchEvent(new Event('cancel', { cancelable: true }))
		await flush()
		expect(drawer.open).toBe(true)

		drawer.removeEventListener('escape-key-down', prevent)
		dialog.dispatchEvent(new Event('cancel', { cancelable: true }))
		await flush()
		expect(drawer.open).toBe(false)
	})

	it('pointer-down-outside and interact-outside announce a backdrop press; preventing either keeps it open', async () => {
		const { drawer, dialog } = mount('open')
		vi.spyOn(dialog, 'getBoundingClientRect').mockReturnValue({ top: 300, bottom: 800, left: 0, right: 400 } as DOMRect)
		const outside = spy(drawer, 'pointer-down-outside')
		const interact = spy(drawer, 'interact-outside')
		const press = () => {
			pointer(dialog, 'pointerdown', 100, 0, 100)
			dialog.dispatchEvent(new MouseEvent('click', { bubbles: true, clientX: 100, clientY: 100 }))
		}

		drawer.addEventListener('interact-outside', event => event.preventDefault(), { once: true })
		press()
		await flush()
		expect(outside).toHaveBeenCalledTimes(1)
		expect(interact).toHaveBeenCalledTimes(1)
		expect(drawer.open).toBe(true)

		press()
		await flush()
		expect(drawer.open).toBe(false)
	})

	it('a right or ctrl-click on the backdrop never dismisses (vue ignores them)', async () => {
		const { drawer, dialog } = mount('open')
		vi.spyOn(dialog, 'getBoundingClientRect').mockReturnValue({ top: 300, bottom: 800, left: 0, right: 400 } as DOMRect)
		pointer(dialog, 'pointerdown', 100, 0, 100, { ctrlKey: true })
		dialog.dispatchEvent(new MouseEvent('click', { bubbles: true, clientX: 100, clientY: 100 }))
		await flush()
		expect(drawer.open).toBe(true)
	})

	it('open-auto-focus runs after opening, and close-auto-focus after the dialog closed', async () => {
		const { drawer } = mount()
		const opened = spy(drawer, 'open-auto-focus')
		const closed = spy(drawer, 'close-auto-focus')
		drawer.show()
		expect(opened).not.toHaveBeenCalled()
		await flush()
		expect(opened).toHaveBeenCalledTimes(1)
		expect(opened.mock.calls[0]![0].cancelable).toBe(true)
		drawer.close()
		await flush()
		expect(closed).toHaveBeenCalledTimes(1)
		expect(closed.mock.calls[0]![0].cancelable).toBe(true)
	})
})

describe('focus on open (autoFocus)', () => {
	it('opens with the sheet itself focusable and, with auto-focus, focuses the first control after the transition', async () => {
		const plain = mount('open', '<button id="first">First</button>')
		expect(plain.dialog.tabIndex).toBe(-1)
		expect(document.activeElement).toBe(plain.dialog) // not the first control
		expect(plain.dialog.inert).toBe(false) // inert only while it shows
		document.body.innerHTML = ''

		const { drawer, dialog } = mount('auto-focus', '<div data-drawer-handle></div><button disabled>x</button><button id="b">B</button>')
		const order: string[] = []
		for (const type of ['after-open', 'animation-end', 'open-auto-focus']) drawer.addEventListener(type, () => order.push(type))
		drawer.show()
		expect(document.activeElement).toBe(dialog) // the sheet takes focus while it opens
		await flush()
		// vue: `after-open`, `animation-end`, then `open-auto-focus` once the transition is over.
		expect(order).toEqual(['after-open', 'animation-end', 'open-auto-focus'])
		expect(document.activeElement?.id).toBe('b')
	})
})

describe('non-modal drawers (modal="false")', () => {
	it('opens without the modal state and leaves page scrolling alone', () => {
		const { drawer, dialog } = mount('open modal="false"')
		const modal = vi.spyOn(dialog, 'showModal')
		expect(dialog.open).toBe(true)
		expect(modal).not.toHaveBeenCalled()
		expect(isLocked()).toBe(false)
		drawer.close()
	})

	it('returns focus to where the page had it, instead of stealing it', () => {
		document.body.insertAdjacentHTML('beforeend', '<button id="page">page</button>')
		const page = document.getElementById('page')!
		page.focus()
		mount('open modal="false"')
		expect(document.activeElement).toBe(page)
	})

	it('closes the topmost non-modal drawer on Escape through the document', async () => {
		const { drawer } = mount('open modal="false"')
		const outer = drawer
		document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
		await flush()
		expect(outer.open).toBe(false)
	})

	it('a modal drawer handles Escape on the keydown and cancels it, so a veto holds on every press', async () => {
		const { drawer } = mount('open')
		const prevent = (event: Event) => event.preventDefault()
		drawer.addEventListener('escape-key-down', prevent)
		const keys = [1, 2, 3].map(() => new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }))
		for (const key of keys) document.dispatchEvent(key)
		await flush()
		expect(drawer.open).toBe(true)
		expect(keys.every(key => key.defaultPrevented)).toBe(true)

		drawer.removeEventListener('escape-key-down', prevent)
		document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }))
		await flush()
		expect(drawer.open).toBe(false)
	})

	it('leaves Escape to a plain modal dialog or popover above the drawer', async () => {
		const { drawer } = mount('open')
		const query = vi.spyOn(document, 'querySelector').mockReturnValue(document.body)
		const key = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })
		document.dispatchEvent(key)
		await flush()
		expect(drawer.open).toBe(true)
		expect(key.defaultPrevented).toBe(false)
		expect(query).toHaveBeenCalledWith(expect.stringContaining('dialog:modal:not(astro-drawer > dialog)'))
	})

	it('leaves an Escape that something else already handled alone', async () => {
		const { drawer } = mount('open')
		const key = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })
		document.body.addEventListener('keydown', event => event.preventDefault(), { once: true })
		document.body.dispatchEvent(key)
		await flush()
		expect(drawer.open).toBe(true)
	})

	it('Escape respects dismissible="false" and a prevented escape-key-down', async () => {
		const { drawer } = mount('open modal="false" dismissible="false"')
		document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
		await flush()
		expect(drawer.open).toBe(true)
	})

	it('announces outside pointer presses and focus but stays open', async () => {
		const { drawer } = mount('open modal="false"')
		document.body.insertAdjacentHTML('beforeend', '<button id="page">page</button>')
		const outside = spy(drawer, 'pointer-down-outside')
		const focus = spy(drawer, 'focus-outside')
		const interact = spy(drawer, 'interact-outside')

		const page = document.getElementById('page')!
		page.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true }))
		page.dispatchEvent(new FocusEvent('focusin', { bubbles: true }))
		await flush()

		expect(outside).toHaveBeenCalledTimes(1)
		expect(focus).toHaveBeenCalledTimes(1)
		expect(interact).toHaveBeenCalledTimes(2)
		expect(drawer.open).toBe(true)
	})

	it('does not announce presses inside the drawer', () => {
		const { drawer, dialog } = mount('open modal="false"')
		const outside = spy(drawer, 'pointer-down-outside')
		dialog.querySelector('p')!.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }))
		expect(outside).not.toHaveBeenCalled()
	})

	it('moves into its container and measures snap points there', () => {
		document.body.insertAdjacentHTML('beforeend', '<div id="box"></div>')
		const box = document.getElementById('box')!
		vi.spyOn(box, 'getBoundingClientRect').mockReturnValue({ top: 0, bottom: 500, left: 0, right: 300, height: 500, width: 300 } as DOMRect)
		mount('open modal="false" container="#box" snap-points="0.5, 1"')
		const drawer = box.querySelector('astro-drawer')!
		const dialog = drawer.querySelector('dialog')!
		expect(drawer.parentElement).toBe(box)
		expect(dialog.style.getPropertyValue('--drawer-rest')).toBe('translateY(250px)')
	})
})

describe('drag options', () => {
	it('handle-only starts a drag from the handle and nowhere else', () => {
		const { dialog } = mount('open handle-only')
		sized(dialog)
		pointer(dialog.querySelector('p')!, 'pointerdown', 100, 0)
		pointer(dialog.querySelector('p')!, 'pointermove', 200, 100)
		expect(dialog.style.transform).toBe('')
		const handle = dialog.querySelector('[data-drawer-handle]')!
		pointer(handle, 'pointerdown', 100, 200)
		pointer(handle, 'pointermove', 200, 300)
		expect(dialog.style.transform).toBe('translateY(100px)')
	})

	it('close-threshold sets the fraction of the sheet a slow drag must cover', async () => {
		const { drawer, dialog } = mount('open close-threshold="0.1"')
		sized(dialog)
		const handle = dialog.querySelector('[data-drawer-handle]')!
		pointer(handle, 'pointerdown', 100, 0)
		pointer(handle, 'pointermove', 150, 1000) // 50px = 12.5% of 400px, 0.05px/ms
		pointer(handle, 'pointerup', 150, 2000)
		await flush()
		expect(drawer.open).toBe(false)
	})

	it('overdrags elastically past fully open on vertical sheets only', () => {
		const { dialog } = mount('open')
		sized(dialog)
		const handle = dialog.querySelector('[data-drawer-handle]')!
		pointer(handle, 'pointerdown', 500, 0)
		pointer(handle, 'pointermove', 800, 100) // 300px down: activated
		pointer(handle, 'pointermove', 100, 200) // 400px up from there
		const offset = parseFloat(dialog.style.transform.slice('translateY('.length))
		expect(offset).toBeLessThan(0) // dampened: -8 * (ln(101) - 2) = -20.9px, never the raw -200
		expect(offset).toBeGreaterThan(-60)

		const side = mount('open direction="left"').dialog
		const sideHandle = side.querySelector('p')!
		pointer(sideHandle, 'pointerdown', 0, 300, 500)
		pointer(sideHandle, 'pointermove', 0, 400, 300) // toward the closing edge (left): 200px
		pointer(sideHandle, 'pointermove', 0, 500, 600) // back past fully open
		expect(side.style.transform).toBe('translateX(0px)')
	})

	it('ignores a vertical drag that starts right after opening (vue\'s recently-opened guard)', async () => {
		const { drawer, dialog } = mount()
		sized(dialog)
		drawer.show()
		const handle = dialog.querySelector('[data-drawer-handle]')!
		// No clock advance: the helper moves it forward by 600ms, so undo that.
		const down = new PointerEvent('pointerdown', { bubbles: true, clientY: 100, button: 0, isPrimary: true })
		handle.dispatchEvent(down)
		handle.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, clientY: 200, button: 0, isPrimary: true }))
		expect(dialog.style.transform).toBe('')
		vi.setSystemTime(Date.now() + 600)
		handle.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, clientY: 210, button: 0, isPrimary: true }))
		expect(dialog.style.transform).toBe('translateY(110px)')
	})

	it('a drag shortly after a scroll attempt stays a scroll (scroll-lock-timeout)', () => {
		const { dialog } = mount('open')
		sized(dialog)
		const p = dialog.querySelector('p')!
		const section = dialog
		Object.defineProperty(section, 'scrollTop', { configurable: true, value: 50 })
		pointer(p, 'pointerdown', 100, 0)
		pointer(p, 'pointermove', 150, 50) // the refused drag attempt: ancestor scrolled
		Object.defineProperty(section, 'scrollTop', { configurable: true, value: 0 })
		vi.setSystemTime(Date.now() + 100)
		const event = new PointerEvent('pointerdown', { bubbles: true, clientY: 100, button: 0, isPrimary: true })
		p.dispatchEvent(event)
		p.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, clientY: 200, button: 0, isPrimary: true }))
		expect(dialog.style.transform).toBe('') // within 500ms
	})
})

describe('close options', () => {
	it('instant-close closes without waiting for the transition', async () => {
		const { drawer, dialog } = mount('open instant-close')
		dialog.getAnimations = () => [{ effect: { target: dialog }, finished: new Promise(() => {}) } as unknown as Animation]
		drawer.close()
		expect(dialog.open).toBe(false)
	})

	it('data-drawer-close="all" closes the whole nested stack from its root', async () => {
		document.body.insertAdjacentHTML('beforeend', `
			<astro-drawer id="a" open><dialog aria-label="A"><p>A</p>
				<astro-drawer id="b" open><dialog aria-label="B"><button data-drawer-close="all">x</button></dialog></astro-drawer>
			</dialog></astro-drawer>`)
		const a = document.getElementById('a') as AstroDrawer
		const b = document.getElementById('b') as AstroDrawer
		b.querySelector('button')!.click()
		await flush()
		expect(a.open).toBe(false)
		expect(b.open).toBe(false)
	})

	it('a plain data-drawer-close closes only its own drawer', async () => {
		document.body.insertAdjacentHTML('beforeend', `
			<astro-drawer id="a" open><dialog aria-label="A"><p>A</p>
				<astro-drawer id="b" open><dialog aria-label="B"><button data-drawer-close>x</button></dialog></astro-drawer>
			</dialog></astro-drawer>`)
		const a = document.getElementById('a') as AstroDrawer
		const b = document.getElementById('b') as AstroDrawer
		b.querySelector('button')!.click()
		await flush()
		expect(b.open).toBe(false)
		expect(a.open).toBe(true)
	})

	it('animation and close-animation choose the animation of each transition; gestures and data-drawer-animation override', async () => {
		const { drawer, dialog } = mount('animation="fade" close-animation="slide"')
		drawer.show()
		expect(drawer.dataset.anim).toBe('fade')
		drawer.close()
		await flush()
		expect(drawer.dataset.anim).toBe('slide')

		const second = mount('open close-animation="fade"', '<button data-drawer-close data-drawer-animation="slide">x</button>')
		second.drawer.querySelector('button')!.click()
		await flush()
		expect(second.drawer.dataset.anim).toBe('slide')

		const dragged = mount('open close-animation="fade"')
		sized(dragged.dialog)
		const handle = dragged.dialog.querySelector('[data-drawer-handle]')!
		pointer(handle, 'pointerdown', 100, 0)
		pointer(handle, 'pointermove', 350, 100)
		pointer(handle, 'pointerup', 350, 200)
		await flush()
		expect(dragged.drawer.dataset.anim).toBe('slide')
	})
})

describe('snap point handle and defaults', () => {
	function snapped(attrs = '') {
		const mounted = mount(`open snap-points="0.25, 0.5, 1" ${attrs}`)
		const handle = mounted.dialog.querySelector('[data-drawer-handle]') as HTMLElement
		return { ...mounted, handle }
	}
	const tap = (handle: Element) => {
		pointer(handle, 'pointerdown', 100, 1000)
		pointer(handle, 'pointerup', 100, 1050)
		handle.dispatchEvent(new MouseEvent('click', { bubbles: true }))
	}

	it('a handle click advances to the next snap point and announces it', async () => {
		vi.useFakeTimers({ toFake: ['Date', 'setTimeout', 'clearTimeout'] })
		const { drawer, handle } = snapped()
		const change = spy(drawer, 'snap-point-change')
		tap(handle)
		vi.advanceTimersByTime(130)
		expect(drawer.getAttribute('active-snap-point')).toBe('0.5')
		expect(change.mock.calls[0]![0].detail).toBe(0.5)
	})

	it('past the last snap point it dismisses, unless dismissible="false" or data-prevent-cycle', async () => {
		vi.useFakeTimers({ toFake: ['Date', 'setTimeout', 'clearTimeout'] })
		const last = snapped('active-snap-point="1"')
		tap(last.handle)
		vi.advanceTimersByTime(130)
		expect(last.drawer.open).toBe(false)

		const stays = snapped('active-snap-point="1" dismissible="false"')
		tap(stays.handle)
		vi.advanceTimersByTime(130)
		expect(stays.drawer.open).toBe(true)

		const prevented = snapped()
		prevented.handle.setAttribute('data-prevent-cycle', '')
		tap(prevented.handle)
		vi.advanceTimersByTime(130)
		expect(prevented.drawer.getAttribute('active-snap-point')).toBeNull()
	})

	it('a double tap does not cycle', () => {
		vi.useFakeTimers({ toFake: ['Date', 'setTimeout', 'clearTimeout'] })
		const { drawer, handle } = snapped()
		tap(handle)
		tap(handle)
		vi.advanceTimersByTime(300)
		expect(drawer.getAttribute('active-snap-point')).toBeNull()
	})

	it('default-snap-point is where an uncontrolled drawer first rests; active-snap-point wins', () => {
		expect(snapped('default-snap-point="0.5"').drawer.getAttribute('active-snap-point')).toBe('0.5')
		expect(snapped('default-snap-point="0.5" active-snap-point="1"').drawer.getAttribute('active-snap-point')).toBe('1')
	})
})

describe('nested options', () => {
	function nest(childAttrs: string, parentAttrs = '') {
		document.body.insertAdjacentHTML('beforeend', `
			<astro-drawer id="a" open ${parentAttrs}><dialog aria-label="A"><p>A</p>
				<astro-drawer id="b" ${childAttrs}><dialog aria-label="B"><p>B</p></dialog></astro-drawer>
			</dialog></astro-drawer>`)
		return {
			a: document.getElementById('a') as AstroDrawer,
			b: document.getElementById('b') as AstroDrawer,
			parentDialog: document.querySelector('#a > dialog') as HTMLElement,
		}
	}

	it('scale-parent forces the step-back for a different side, or suppresses it for the same side', () => {
		const forced = nest('open direction="right" scale-parent="true"')
		expect(forced.parentDialog.style.scale).not.toBe('')
		document.body.innerHTML = ''
		const suppressed = nest('open scale-parent="false"')
		expect(suppressed.parentDialog.style.scale).toBe('')
	})

	it('the parent follows a child drag back toward rest and returns to full depth on release', () => {
		const { b, parentDialog } = nest('open')
		const child = b.querySelector('dialog')!
		sized(child)
		const p = child.querySelector('p')!
		const full = parentDialog.style.scale
		pointer(p, 'pointerdown', 100, 0)
		pointer(p, 'pointermove', 160, 100) // 60 of 400px: under the close threshold
		expect(+parentDialog.style.scale).toBeGreaterThan(+full)
		expect(+parentDialog.style.scale).toBeLessThan(1)
		pointer(p, 'pointerup', 160, 5000)
		expect(parentDialog.style.scale).toBe(full)
	})
})

describe('accessibility wiring', () => {
	it('names the dialog from [data-drawer-title] and describes it from [data-drawer-description]', () => {
		const { dialog } = mount('open', '<h2 data-drawer-title>Title</h2><p data-drawer-description>Body</p>', '')
		const [title, body] = [dialog.querySelector('h2')!, dialog.querySelector('p')!]
		expect(title.id).toBeTruthy()
		expect(dialog.getAttribute('aria-labelledby')).toBe(title.id)
		expect(dialog.getAttribute('aria-describedby')).toBe(body.id)
	})

	it('keeps an explicit aria-label or aria-labelledby over the title', () => {
		expect(mount('open', '<h2 data-drawer-title>T</h2>', 'aria-label="Mine"').dialog.hasAttribute('aria-labelledby')).toBe(false)
		expect(mount('open', '<h2 data-drawer-title>T</h2>', 'aria-labelledby="x"').dialog.getAttribute('aria-labelledby')).toBe('x')
	})

	it('turns data-drawer-open triggers into disclosure buttons that track the open state', async () => {
		document.body.insertAdjacentHTML('beforeend', '<button id="t" data-drawer-open="#d">Open</button>')
		const { drawer, dialog } = mount()
		const trigger = document.getElementById('t')!
		expect(trigger.getAttribute('aria-haspopup')).toBe('dialog')
		// vue's trigger controls the content element, not a wrapper.
		expect(dialog.id).not.toBe('')
		expect(trigger.getAttribute('aria-controls')).toBe(dialog.id)
		expect(trigger.getAttribute('aria-expanded')).toBe('false')
		drawer.show()
		expect(trigger.getAttribute('aria-expanded')).toBe('true')
		drawer.close()
		await flush()
		expect(trigger.getAttribute('aria-expanded')).toBe('false')
	})
})

describe('scroll lock options', () => {
	it('prevent-scroll="false" leaves the page scrollable', () => {
		mount('open prevent-scroll="false"')
		expect(isLocked()).toBe(false)
	})

	it('no-body-styles leaves the document and body styles to the app', () => {
		const { drawer } = mount('open no-body-styles')
		expect(isLocked()).toBe(false)
		expect(document.body.style.position).toBe('')
		drawer.close()
	})
})

describe('drag, lifecycle and cleanup edge cases', () => {
	it('ignores a native close event queued before a DOM move reopened the drawer', async () => {
		const { drawer, dialog } = mount('open')
		document.body.append(drawer) // disconnect + connect: closes the dialog natively, then reopens it
		await flush()
		expect(dialog.open).toBe(true)
		expect(drawer.open).toBe(true)
		expect(isLocked()).toBe(true)
	})

	it('does not wait for an endless animation on the sheet when closing', async () => {
		const { drawer, dialog } = mount('open')
		dialog.getAnimations = () => [{
			effect: { target: dialog, getComputedTiming: () => ({ iterations: Infinity }) },
			finished: new Promise(() => {}),
		} as unknown as Animation]
		drawer.close()
		await flush()
		expect(dialog.open).toBe(false)
	})

	it('suppresses the click that ends a drag, which lands wherever the finger stopped', async () => {
		const { drawer, dialog } = mount('open')
		sized(dialog)
		vi.spyOn(dialog, 'getBoundingClientRect').mockReturnValue({ top: 300, bottom: 800, left: 0, right: 400 } as DOMRect)
		const handle = dialog.querySelector('[data-drawer-handle]')!
		pointer(handle, 'pointerdown', 100, 0)
		pointer(handle, 'pointermove', 140, 100) // active, under the close threshold
		pointer(handle, 'pointerup', 140, 2000)
		dialog.dispatchEvent(new MouseEvent('click', { bubbles: true, clientX: 100, clientY: 100 })) // outside the rect: a "backdrop" click
		await flush()
		expect(drawer.open).toBe(true)
	})

	it('ignores a second pointer while one is dragging', () => {
		const { dialog } = mount('open')
		sized(dialog)
		const handle = dialog.querySelector('[data-drawer-handle]')!
		pointer(handle, 'pointerdown', 100, 0, 0, { pointerId: 1, isPrimary: true })
		pointer(handle, 'pointermove', 200, 100, 0, { pointerId: 1, isPrimary: true })
		pointer(handle, 'pointerdown', 500, 150, 0, { pointerId: 2, isPrimary: false })
		pointer(handle, 'pointerup', 500, 200, 0, { pointerId: 2, isPrimary: false })
		expect(dialog.style.transform).toBe('translateY(100px)') // still following pointer 1
		pointer(handle, 'pointerup', 200, 300, 0, { pointerId: 1, isPrimary: true })
		expect(dialog.style.transform).toBe('')
	})

	it('gives back its drag styles when removed mid-drag', () => {
		const { drawer, dialog } = mount('open')
		sized(dialog)
		const handle = dialog.querySelector('[data-drawer-handle]')!
		pointer(handle, 'pointerdown', 100, 0)
		pointer(handle, 'pointermove', 200, 100)
		expect(dialog.style.transition).toBe('none')
		drawer.remove()
		expect(dialog.style.transform).toBe('')
		expect(dialog.style.transition).toBe('')
		expect(drawer.dataset.dragging).toBeUndefined()
	})

	it('recomputes the resting state when direction, snap-points or fade-from-index change while open', () => {
		const { drawer, dialog } = mount('open snap-points="0.25, 1"')
		expect(dialog.style.getPropertyValue('--drawer-rest')).toBe('translateY(576px)')
		drawer.setAttribute('direction', 'right')
		expect(dialog.style.getPropertyValue('--drawer-rest')).toBe('translateX(768px)')
		drawer.setAttribute('snap-points', '0.5, 1')
		expect(dialog.style.getPropertyValue('--drawer-rest')).toBe('translateX(512px)')
		drawer.setAttribute('fade-from-index', '0')
		expect(drawer.hasAttribute('data-backdrop-hidden')).toBe(false)
	})

	it('a closed child does not erase the step-back owned by a sibling', async () => {
		document.body.insertAdjacentHTML('beforeend', `
			<astro-drawer id="a" open><dialog aria-label="A"><p>A</p>
				<astro-drawer id="b" open><dialog aria-label="B">B</dialog></astro-drawer>
				<astro-drawer id="c"><dialog aria-label="C">C</dialog></astro-drawer>
			</dialog></astro-drawer>`)
		const [parentDialog, b, c] = [document.querySelector('#a > dialog') as HTMLElement, document.getElementById('b') as AstroDrawer, document.getElementById('c') as AstroDrawer]
		b.close()
		await flush()
		c.show()
		expect(parentDialog.style.scale).not.toBe('')
		b.remove() // the closed child going away must not clear c's step-back
		expect(parentDialog.style.scale).not.toBe('')
	})

	it('keeps pinch-zoom available while managing touch panning', () => {
		expect(mount('open').dialog.style.touchAction).toBe('pinch-zoom')
		expect(mount('open direction="left"').dialog.style.touchAction).toBe('pan-y pinch-zoom')
	})

	it('reserves the hidden part of a snap sheet so its last content is reachable', () => {
		const { dialog } = mount('open snap-points="0.5, 0.9"')
		expect(dialog.style.getPropertyValue('--drawer-hidden')).toBe('384px')
	})
})

describe('stacking, focus and reopen edge cases', () => {
	const key = () => new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })

	it('keeps one stack entry when a drawer is reopened before the previous native close landed', async () => {
		const { drawer } = mount('open instant-close')
		drawer.close()
		drawer.show() // the first close event is still queued
		await flush()
		expect(drawer.open).toBe(true)
		drawer.close()
		await flush()
		const event = key()
		document.dispatchEvent(event)
		expect(event.defaultPrevented).toBe(false) // nothing left on the stack to swallow Escape
	})

	it('marks the sheet like a vue drawer content for the shared scroll guard', async () => {
		const { drawer, dialog } = mount()
		expect(dialog.hasAttribute('data-drawer-content')).toBe(true)
		expect(dialog.dataset.state).toBeUndefined()
		drawer.show()
		await flush()
		expect(dialog.dataset.state).toBe('open')
		drawer.close()
		await flush()
		expect(dialog.dataset.state).toBeUndefined()
	})

	it('stacks non-modal drawers by opening order', async () => {
		const first = mount('modal="false"').drawer
		const second = mount('modal="false"').drawer
		second.show()
		await flush()
		first.show()
		await flush()
		const z = (drawer: AstroDrawer) => Number(/\+ (\d+)\)/.exec(drawer.querySelector('dialog')!.style.zIndex)![1])
		expect(z(first)).toBeGreaterThan(z(second))
		// ...and stays monotonic after lower drawers close and one reopens.
		second.close()
		await flush()
		second.show()
		await flush()
		expect(z(second)).toBeGreaterThan(z(first))
	})

	it('routes an outside press to the topmost non-modal drawer even when it lands on another drawer', async () => {
		const below = mount('open modal="false"', '<p id="below">below</p>').drawer
		const above = mount('open modal="false"').drawer
		const outside = spy(above, 'interact-outside')
		below.querySelector('p')!.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true }))
		expect(outside).toHaveBeenCalledTimes(1)
	})

	it('a close in the middle of a drag clears the drag, the backdrop opacity and the transition override', async () => {
		const { drawer, dialog } = mount('open')
		sized(dialog)
		const handle = dialog.querySelector('[data-drawer-handle]')!
		pointer(handle, 'pointerdown', 100, 0)
		pointer(handle, 'pointermove', 200, 100)
		expect(drawer.hasAttribute('data-dragging')).toBe(true)
		drawer.close()
		await flush()
		expect(drawer.hasAttribute('data-dragging')).toBe(false)
		expect(dialog.style.getPropertyValue('--drawer-fade')).toBe('')
		expect(dialog.style.transform).toBe('')
	})

	it('does not repeat after-open or animation-end when an option changes on an open drawer', async () => {
		const { drawer } = mount('open snap-points="0.3,0.6"')
		await flush()
		const afterOpen = spy(drawer, 'after-open')
		drawer.setAttribute('active-snap-point', '0.6')
		drawer.setAttribute('dismissible', 'false')
		await flush()
		expect(afterOpen).not.toHaveBeenCalled()
	})

	it('a handle tap that is followed by a close does not move or close the drawer later', async () => {
		const { drawer, dialog } = mount('open snap-points="0.3,0.6" instant-close')
		const handle = dialog.querySelector('[data-drawer-handle]')!
		const changed = spy(drawer, 'snap-point-change')
		pointer(handle, 'pointerdown', 100, 0)
		pointer(handle, 'pointerup', 100, 50)
		handle.dispatchEvent(new MouseEvent('click', { bubbles: true }))
		drawer.close()
		await new Promise(resolve => setTimeout(resolve, 200))
		expect(changed).not.toHaveBeenCalled()
		expect(drawer.getAttribute('active-snap-point')).toBeNull()
	})

	it('preventing close-auto-focus leaves focus nowhere; the handler may move it', async () => {
		document.body.insertAdjacentHTML('beforeend', '<button id="trigger">t</button><button id="other">o</button>')
		const trigger = document.getElementById('trigger')!
		const { drawer, dialog } = mount('open instant-close')
		drawer.addEventListener('close-auto-focus', event => event.preventDefault())
		trigger.focus() // what the native close does
		dialog.close()
		await flush()
		expect(document.activeElement).toBe(document.body)

		const second = mount('open instant-close')
		second.drawer.addEventListener('close-auto-focus', (event) => {
			event.preventDefault()
			document.getElementById('other')!.focus()
		})
		trigger.focus()
		second.dialog.close()
		await flush()
		expect(document.activeElement?.id).toBe('other')
	})

	it('preventing open-auto-focus keeps focus off the first control', async () => {
		const { drawer } = mount('auto-focus', '<button id="b">B</button>')
		drawer.addEventListener('open-auto-focus', event => event.preventDefault())
		drawer.show()
		await flush()
		expect(document.activeElement?.id).not.toBe('b')
	})

	it('a close listener that reopens an instant-close drawer is not closed again by the old close', async () => {
		const { drawer, dialog } = mount('open instant-close')
		drawer.addEventListener('close', () => drawer.show(), { once: true })
		drawer.close()
		await flush()
		expect(drawer.open).toBe(true)
		expect(dialog.open).toBe(true)
	})

	it('a handle tap pending its double-tap window does not act on a drawer reopened in between', async () => {
		const { drawer, dialog } = mount('open snap-points="0.3,0.6"')
		drawer.setAttribute('active-snap-point', '0.6') // the last snap point: the tap would close it
		const handle = dialog.querySelector('[data-drawer-handle]')!
		pointer(handle, 'pointerdown', 100, 0)
		pointer(handle, 'pointerup', 100, 40)
		handle.dispatchEvent(new MouseEvent('click', { bubbles: true }))
		drawer.close()
		drawer.show()
		await new Promise(resolve => setTimeout(resolve, 200))
		expect(drawer.open).toBe(true)
	})

	it('does not lock the page when a focus handler removes the drawer while it is being shown', async () => {
		const { drawer, dialog } = mount()
		const showModal = dialog.showModal.bind(dialog)
		dialog.showModal = () => {
			showModal()
			drawer.remove() // what a `focus` listener could do
		}
		drawer.show()
		await flush()
		expect(isLocked()).toBe(false)
		const event = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })
		document.dispatchEvent(event)
		expect(event.defaultPrevented).toBe(false)
	})
})

describe('vue-drawer details: triggers, gestures, focus and motion', () => {
	it('a trigger click a handler already prevented does not open', () => {
		document.body.insertAdjacentHTML('beforeend', '<button id="t" data-drawer-open="#d">Open</button>')
		const { drawer } = mount()
		const trigger = document.getElementById('t')!
		trigger.addEventListener('click', event => event.preventDefault())
		trigger.click()
		expect(drawer.open).toBe(false)
	})

	it('a closing sheet takes no new drag', () => {
		const { drawer, dialog } = mount('open')
		sized(dialog)
		const handle = dialog.querySelector('[data-drawer-handle]')!
		drawer.close()
		pointer(handle, 'pointerdown', 100, 0)
		pointer(handle, 'pointermove', 200, 100)
		expect(dialog.style.transform).toBe('')
		expect(drawer.hasAttribute('data-dragging')).toBe(false)
	})

	it('a touch needs 10px to become a drag, a mouse 6px', () => {
		const { dialog } = mount('open')
		sized(dialog)
		const handle = dialog.querySelector('[data-drawer-handle]')!
		pointer(handle, 'pointerdown', 100, 0, 0, { pointerType: 'touch' })
		pointer(handle, 'pointermove', 108, 20, 0, { pointerType: 'touch' })
		expect(dialog.style.transform).toBe('')
		pointer(handle, 'pointermove', 112, 40, 0, { pointerType: 'touch' })
		expect(dialog.style.transform).toBe('translateY(12px)')
		pointer(handle, 'pointercancel', 112, 50, 0, { pointerType: 'touch' })

		pointer(handle, 'pointerdown', 100, 100, 0, { pointerType: 'mouse' })
		pointer(handle, 'pointermove', 108, 120, 0, { pointerType: 'mouse' })
		expect(dialog.style.transform).toBe('translateY(8px)')
	})

	it('a release exactly at the close threshold closes, like vue', async () => {
		const { drawer, dialog } = mount('open')
		sized(dialog, 400) // the default threshold is 0.25: 100px
		const handle = dialog.querySelector('[data-drawer-handle]')!
		pointer(handle, 'pointerdown', 100, 0)
		pointer(handle, 'pointermove', 200, 900)
		pointer(handle, 'pointerup', 200, 1000)
		await flush()
		expect(drawer.open).toBe(false)
	})

	it('a tap in scrolled content is not a scroll attempt: the handle drags right after', () => {
		const { dialog } = mount('open')
		sized(dialog)
		const p = dialog.querySelector('p')!
		Object.defineProperty(dialog, 'scrollTop', { configurable: true, value: 50 })
		pointer(p, 'pointerdown', 100, 0)
		pointer(p, 'pointerup', 100, 30)
		vi.setSystemTime(Date.now() + 50)
		const handle = dialog.querySelector('[data-drawer-handle]')!
		handle.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, clientY: 100, button: 0, isPrimary: true }))
		handle.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, clientY: 160, button: 0, isPrimary: true }))
		expect(dialog.style.transform).toBe('translateY(60px)')
	})

	it('Escape and outside presses from a data-drawer-branch are the branch\'s own', async () => {
		const { drawer, dialog } = mount('open modal="false"', '<p>Content</p>')
		document.body.insertAdjacentHTML('beforeend', '<div id="menu" data-drawer-branch><button id="item">Item</button></div>')
		const item = document.getElementById('item')!
		const outside = spy(drawer, 'pointer-down-outside')
		const escape = spy(drawer, 'escape-key-down')
		item.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true }))
		expect(outside).not.toHaveBeenCalled()
		const event = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })
		item.dispatchEvent(event)
		expect(escape).not.toHaveBeenCalled()
		expect(event.defaultPrevented).toBe(true) // also holds a modal sheet's native cancel
		await flush()
		expect(drawer.open).toBe(true)
		expect(dialog.open).toBe(true)
	})

	it('opens in place when it connects already open, and animates when opened later', async () => {
		const first = mount('open')
		expect(first.drawer.dataset.instant).toBe('')
		await new Promise(resolve => requestAnimationFrame(resolve))
		expect(first.drawer.dataset.instant).toBeUndefined()
		document.body.innerHTML = ''

		const later = mount()
		later.drawer.show()
		expect(later.drawer.dataset.instant).toBeUndefined()
	})

	it('under reduced motion a sheet with data-reduced-motion="fade" cross-fades instead of sliding', () => {
		window.matchMedia = vi.fn().mockReturnValue({ matches: true }) as typeof window.matchMedia
		expect(mount('open', undefined, 'aria-label="Menu" data-reduced-motion="fade"').drawer.dataset.anim).toBe('fade')
		expect(mount('open').drawer.dataset.anim).toBe('slide') // not opted in: unchanged (transitions are off in CSS)
		window.matchMedia = vi.fn().mockReturnValue({ matches: false }) as typeof window.matchMedia
		expect(mount('open', undefined, 'aria-label="Menu" data-reduced-motion="fade"').drawer.dataset.anim).toBe('slide')
	})

	it('a DOM move followed by an immediate instant close announces after-close once', async () => {
		const { drawer } = mount('open instant-close')
		const closed = spy(drawer, 'after-close')
		const box = document.createElement('div')
		document.body.append(box)
		box.append(drawer) // disconnect, then connect: it shows again
		drawer.close()
		await flush()
		await flush()
		expect(closed).toHaveBeenCalledTimes(1)
	})

	it('auto-focus skips a control that cannot take focus', async () => {
		const { drawer } = mount('auto-focus', '<button disabled tabindex="0">off</button><button id="b">B</button>')
		drawer.show()
		await flush()
		expect(document.activeElement?.id).toBe('b')
	})

	it('a drawer that connects open with a default snap point is not left without transitions', async () => {
		const { drawer } = mount('open snap-points="0.3,0.6" default-snap-point="0.6"')
		expect(drawer.dataset.instant).toBe('')
		await new Promise(resolve => requestAnimationFrame(resolve))
		expect(drawer.dataset.instant).toBeUndefined()
	})

	it('a swipe dismissal keeps the slide under the reduced-motion fade', async () => {
		window.matchMedia = vi.fn().mockReturnValue({ matches: true }) as typeof window.matchMedia
		const { drawer, dialog } = mount('open', undefined, 'aria-label="Menu" data-reduced-motion="fade"')
		sized(dialog)
		const handle = dialog.querySelector('[data-drawer-handle]')!
		pointer(handle, 'pointerdown', 100, 0)
		pointer(handle, 'pointermove', 300, 100)
		pointer(handle, 'pointerup', 300, 150)
		expect(drawer.open).toBe(false)
		expect(drawer.dataset.anim).toBe('slide')
		window.matchMedia = vi.fn().mockReturnValue({ matches: false }) as typeof window.matchMedia
	})
})
