import { createApp, h, nextTick, ref } from 'vue'
import { DrawerContent, DrawerOverlay, DrawerPortal, DrawerRoot, DrawerRootNested } from '../../src'

const frame = () => new Promise<number>(resolve => requestAnimationFrame(resolve))

function assert(value: unknown, message: string): asserts value {
	if (!value) throw new Error(message)
}

function near(value: number, expected: number, tolerance: number, label: string) {
	assert(Math.abs(value - expected) <= tolerance, `${label}: expected ${expected} ± ${tolerance}, got ${value}`)
}

function motion(element: HTMLElement) {
	const style = getComputedStyle(element)
	const transform = style.transform === 'none' ? new DOMMatrixReadOnly() : new DOMMatrixReadOnly(style.transform)
	return { offset: transform.m42, scale: transform.m11, opacity: Number(style.opacity) }
}

async function framesUntil(check: (elapsed: number) => boolean, timeout = 1500) {
	const start = await frame()
	let now = start
	while (!check(now - start)) {
		now = await frame()
		assert(now - start < timeout, 'Timed out observing drawer motion')
	}
}

function surface(selector: string) {
	const element = document.querySelector<HTMLElement>(selector)
	assert(element, `Missing drawer surface ${selector}`)
	return element
}

function harness(nested = false, options: { animation?: 'fade', closeAnimation?: 'fade', reduced?: boolean, snapPoints?: string[] } = {}) {
	const { reduced, ...rootOptions } = options
	const open = ref(false)
	const events: boolean[] = []
	const fixture = document.body.appendChild(document.createElement('main'))
	const drawer = () => [
		h(DrawerOverlay, { class: 'test-overlay test-linear', id: 'overlay' }),
		h(DrawerContent, {
			class: 'test-content test-linear',
			id: 'content',
			'aria-label': 'Test drawer',
			'data-reduced-motion': reduced ? 'fade' : undefined,
		}, () => [h('input', { 'aria-label': 'Test input' }), h('div', { style: { height: '900px' } })]),
	]
	const state = {
		'onUpdate:open': (value: boolean) => { open.value = value },
		'onAnimation-end': (value: boolean) => events.push(value),
	}
	const app = createApp(() => nested
		? h(DrawerRoot, { defaultOpen: true, preventScroll: false }, () =>
			h(DrawerContent, { class: 'test-content test-linear', id: 'parent', 'aria-label': 'Parent drawer' }, () =>
				h(DrawerRootNested, { ...state, open: open.value }, () => h(DrawerPortal, null, drawer))))
		: h(DrawerRoot, { ...state, ...rootOptions, open: open.value, preventScroll: false }, () => h(DrawerPortal, null, drawer)))
	app.mount(fixture)

	return {
		events,
		setOpen: async (value: boolean) => {
			open.value = value
			await nextTick()
		},
		dispose: () => {
			app.unmount()
			fixture.remove()
		},
	}
}

async function opening(setOpen: (open: boolean) => Promise<void>) {
	await setOpen(true)
	const content = surface('#content')
	const overlay = surface('#overlay')
	// A linear 500ms enter reaches 40% when the overlay reaches 0.4.
	await framesUntil(() => motion(overlay).opacity >= 0.4)
	assert(motion(overlay).opacity < 0.56, 'Expected to interrupt the enter near 40%')
	return { content, overlay }
}

async function closeMidEnter(fixture: ReturnType<typeof harness>, nested: boolean) {
	const { content, overlay } = await opening(fixture.setOpen)
	const parent = nested ? surface('#parent') : null
	let lastOffset = motion(content).offset
	let lastOpacity = motion(overlay).opacity
	const lastScale = parent ? motion(parent).scale : 1
	await fixture.setOpen(false)
	near(motion(content).offset, lastOffset, 3, 'Drawer position at reversal')
	near(motion(overlay).opacity, lastOpacity, 0.015, 'Overlay opacity at reversal')
	timing(content, 'transform', undefined, 'ease-in')
	timing(overlay, 'opacity', undefined, 'ease-in')
	if (parent) near(motion(parent).scale, lastScale, 0.001, 'Parent scale at reversal')

	await framesUntil(() => {
		if (!content.isConnected) return true
		const { offset } = motion(content)
		const { opacity } = motion(overlay)
		assert(offset >= lastOffset - 1, 'Drawer must move toward closed on each frame')
		assert(opacity <= lastOpacity + 0.005, 'Overlay must fade out on each frame')
		lastOffset = offset
		lastOpacity = opacity
		return false
	})
	await framesUntil(() => !overlay.isConnected)
	assert(lastOffset > 300 && lastOpacity < 0.08, 'Drawer and overlay must reach their exit endpoints before removal')
	assert(fixture.events.join() === 'false', `Expected a single close completion, got ${fixture.events}`)
	if (parent) {
		near(motion(parent).scale, 1, 0.001, 'Parent resting scale')
		near(motion(parent).offset, 0, 0.1, 'Parent resting offset')
	}
}

async function reopenMidExit(fixture: ReturnType<typeof harness>, nested: boolean) {
	await fixture.setOpen(true)
	await framesUntil(() => fixture.events.includes(true))
	const content = surface('#content')
	const overlay = surface('#overlay')
	const parent = nested ? surface('#parent') : null
	const input = content.querySelector('input')!
	input.value = 'typed state'
	content.scrollTop = 96

	await fixture.setOpen(false)
	await framesUntil(elapsed => motion(content).offset > 0 && elapsed >= 200)
	assert(content.isConnected, 'Content must stay mounted while closing')
	let lastOffset = motion(content).offset
	let lastOpacity = motion(overlay).opacity
	const parentBefore = parent ? motion(parent) : null
	assert(lastOffset > 20 && lastOffset < 140, 'Expected to interrupt the ease-in exit near 40%')

	await fixture.setOpen(true)
	assert(surface('#content') === content, 'Reopen must preserve the same drawer DOM node')
	assert(surface('#overlay') === overlay, 'Reopen must preserve the same overlay DOM node')
	assert(input.value === 'typed state' && content.scrollTop === 96, 'Reopen must preserve typed state and scroll')
	near(motion(content).offset, lastOffset, 3, 'Drawer position at reopen')
	near(motion(overlay).opacity, lastOpacity, 0.015, 'Overlay opacity at reopen')
	timing(content, 'transform', undefined, 'linear')
	timing(overlay, 'opacity', undefined, 'linear')
	if (parent && parentBefore) {
		near(motion(parent).scale, parentBefore.scale, 0.001, 'Parent scale at reopen')
		near(motion(parent).offset, parentBefore.offset, 0.5, 'Parent offset at reopen')
	}

	await framesUntil(() => {
		const { offset } = motion(content)
		const { opacity } = motion(overlay)
		assert(offset <= lastOffset + 1, 'Drawer must move toward open on each frame')
		assert(opacity >= lastOpacity - 0.005, 'Overlay must fade in on each frame')
		lastOffset = offset
		lastOpacity = opacity
		return fixture.events.length > 1
	})
	near(lastOffset, 0, 0.5, 'Reopened drawer offset')
	near(lastOpacity, 1, 0.01, 'Reopened overlay opacity')
	assert(fixture.events.join() === 'true,true', `Canceled close emitted a completion: ${fixture.events}`)
	if (parent) assert(motion(parent).scale < 1 && motion(parent).offset < 0, 'Parent must scale back on reopen')
}

async function dragMidEnter(fixture: ReturnType<typeof harness>, nested: boolean) {
	const { content, overlay } = await opening(fixture.setOpen)
	const parent = nested ? surface('#parent') : null
	const startOffset = motion(content).offset
	const startOpacity = motion(overlay).opacity
	const parentBefore = parent ? motion(parent) : null
	const dispatch = (type: string, clientY: number) => content.dispatchEvent(
		new PointerEvent(type, { pointerId: 1, pointerType: 'mouse', clientY, bubbles: true, cancelable: true }),
	)

	dispatch('pointerdown', 650)
	dispatch('pointermove', 658)
	await nextTick()
	assert(content.dataset.dragging === 'true', 'Expected an active drag during enter')
	near(motion(content).offset, startOffset + 8, 3, 'First drag frame position')
	near(motion(overlay).opacity, startOpacity - 8 / 300, 0.015, 'First drag frame overlay opacity')
	if (parent && parentBefore) {
		near(motion(parent).scale, parentBefore.scale, 0.002, 'Parent scale on first drag frame')
		near(motion(parent).offset, parentBefore.offset, 1, 'Parent offset on first drag frame')
	}
	dispatch('pointermove', 680)
	near(motion(content).offset, startOffset + 30, 3, 'Drawer follows the pointer after takeover')
	dispatch('pointercancel', 680)
	await framesUntil(() => motion(content).offset === 0)
}

async function reopenDuringSwipeClose(fixture: ReturnType<typeof harness>) {
	const { content, overlay } = await opening(fixture.setOpen)
	for (const [type, clientY] of [['pointerdown', 650], ['pointermove', 750], ['pointerup', 750]] as const) {
		content.dispatchEvent(new PointerEvent(type, { pointerId: 1, pointerType: 'mouse', clientY, bubbles: true }))
	}
	await framesUntil(elapsed => elapsed >= 100)
	assert(content.dataset.state === 'closed', 'Expected the swipe to start a close')
	const before = motion(content)
	const opacity = motion(overlay).opacity
	assert(before.offset < 324 && content.isConnected, 'Expected to reopen before the swipe close ended')
	await fixture.setOpen(true)
	assert(surface('#content') === content, 'Reopen during swipe close must preserve content')
	near(motion(content).offset, before.offset, 3, 'Position on reopen during swipe close')
	near(motion(overlay).opacity, opacity, 0.015, 'Overlay opacity on reopen during swipe close')
	await framesUntil(() => fixture.events.includes(true))
	assert(fixture.events.join() === 'true', 'The canceled swipe close must not emit a completion')
}

async function reopenDuringFadeClose(fixture: ReturnType<typeof harness>) {
	const { content, overlay } = await opening(fixture.setOpen)
	const startOffset = motion(content).offset
	const startOpacity = motion(overlay).opacity
	await fixture.setOpen(false)
	near(motion(content).offset, startOffset, 3, 'Position when fade interrupts slide')
	near(motion(overlay).opacity, startOpacity, 0.015, 'Overlay opacity when fade interrupts slide')
	await framesUntil(elapsed => {
		near(motion(content).offset, startOffset, 3, 'Fade holds the interrupted position')
		return elapsed >= 65
	})
	const fadingOpacity = motion(overlay).opacity
	await fixture.setOpen(true)
	assert(surface('#content') === content, 'Reopen from a fade must preserve content')
	near(motion(content).offset, startOffset, 3, 'Position on reopen from fade')
	near(motion(overlay).opacity, fadingOpacity, 0.015, 'Overlay opacity on reopen from fade')
	await framesUntil(() => fixture.events.includes(true))
	near(motion(content).offset, 0, 0.1, 'Reopened position')
}

function timing(element: HTMLElement, property: string, duration: number | undefined, easing: string) {
	const animation = element.getAnimations().find(candidate =>
		candidate instanceof CSSTransition && candidate.transitionProperty === property,
	)
	assert(animation?.effect instanceof KeyframeEffect, `Missing ${property} transition on ${element.id}`)
	if (duration !== undefined) near(Number(animation.effect.getTiming().duration), duration, 1, `${property} duration`)
	const actualEasing = animation.effect.getTiming().easing
	assert(actualEasing === easing, `Expected ${property} easing ${easing}, got ${actualEasing}`)
}

async function uninterrupted(
	fixture: ReturnType<typeof harness>,
	{ fade = false, reduced = false, snap = false } = {},
) {
	const property = fade || reduced ? 'opacity' : 'transform'
	await fixture.setOpen(true)
	const content = surface('#content')
	const overlay = surface('#overlay')
	timing(content, property, fade ? 260 : 500, fade ? 'cubic-bezier(0.2, 0, 0, 1)' : 'linear')
	if (!snap) timing(overlay, 'opacity', 500, 'linear')
	if (fade || reduced) near(motion(content).offset, 0, 0.1, 'Fade enter offset')
	await framesUntil(() => fixture.events.includes(true) && overlay.getAnimations().length === 0)
	near(motion(content).offset, snap ? innerHeight - 240 : 0, 0.1, 'Resting offset')
	await fixture.setOpen(false)
	timing(content, property, fade ? 180 : 500, fade ? 'cubic-bezier(0.2, 0, 0, 1)' : 'ease-in')
	if (!snap) timing(overlay, 'opacity', fade ? 180 : 500, fade ? 'cubic-bezier(0.2, 0, 0, 1)' : 'ease-in')
	if (fade || reduced) near(motion(content).offset, 0, 0.1, 'Fade exit offset')
	await framesUntil(() => !content.isConnected && !overlay.isConnected)
	assert(fixture.events.join() === 'true,false', 'Uninterrupted open and close must each complete')
}

type Fixture = ReturnType<typeof harness>
const cases: [string, () => Fixture, (fixture: Fixture) => Promise<void>][] = [
	['close at 40% of enter', () => harness(), fixture => closeMidEnter(fixture, false)],
	['reopen at 40% of exit', () => harness(), fixture => reopenMidExit(fixture, false)],
	['drag at 40% of enter', () => harness(), fixture => dragMidEnter(fixture, false)],
	['nested close at 40% of enter', () => harness(true), fixture => closeMidEnter(fixture, true)],
	['nested reopen at 40% of exit', () => harness(true), fixture => reopenMidExit(fixture, true)],
	['nested drag at 40% of enter', () => harness(true), fixture => dragMidEnter(fixture, true)],
	['reopen during swipe close', () => harness(), reopenDuringSwipeClose],
	['fade interrupts slide and reopens', () => harness(false, { closeAnimation: 'fade' }), reopenDuringFadeClose],
	['uninterrupted slide', () => harness(), fixture => uninterrupted(fixture)],
	['uninterrupted fade', () => harness(false, { animation: 'fade', closeAnimation: 'fade' }), fixture => uninterrupted(fixture, { fade: true })],
	['uninterrupted reduced motion', () => harness(false, { reduced: true }), fixture => uninterrupted(fixture, { reduced: true })],
	['uninterrupted snap point', () => harness(false, { snapPoints: ['240px'] }), fixture => uninterrupted(fixture, { snap: true })],
]

const results = []
for (const [name, makeFixture, run] of cases) {
	const fixture = makeFixture()
	try {
		await run(fixture)
		results.push({ name })
	}
	catch (error) {
		results.push({ name, error: String(error) })
	}
	finally {
		fixture.dispose()
	}
}
await fetch('/__drawer_test_results', { method: 'POST', body: JSON.stringify(results) })
