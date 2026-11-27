import { createApp, h, nextTick, ref } from 'vue'
import type { DrawerDirection, DrawerSnapPoint } from '../../src'
import { DrawerClose, DrawerContent, DrawerOverlay, DrawerPortal, DrawerRoot, DrawerRootNested, DrawerTrigger } from '../../src'

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
	return { offset: transform.m42, x: transform.m41, scale: transform.m11, opacity: Number(style.opacity) }
}

async function framesUntil(check: (elapsed: number) => boolean, timeout = 1500) {
	const start = performance.now()
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

function harness(nested = false, options: {
	animation?: 'fade'
	closeAnimation?: 'fade'
	reduced?: boolean
	uncontrolled?: boolean
	direction?: DrawerDirection
	snapPoints?: DrawerSnapPoint[]
	contentStyle?: Record<string, string>
	overlayStyle?: Record<string, string>
	parentStyle?: Record<string, string>
} = {}) {
	const { reduced, uncontrolled, contentStyle, overlayStyle, parentStyle, ...rootOptions } = options
	const side = rootOptions.direction === 'right'
	const open = ref(false)
	const events: boolean[] = []
	const fixture = document.body.appendChild(document.createElement('main'))
	const drawer = () => [
		h(DrawerOverlay, { class: 'test-overlay test-linear', id: 'overlay', style: overlayStyle }),
		h(DrawerContent, {
			class: ['test-content test-linear', side && 'test-right'],
			style: contentStyle,
			id: 'content',
			'aria-label': 'Test drawer',
			'data-reduced-motion': reduced ? 'fade' : undefined,
		}, () => [
			h('input', { 'aria-label': 'Test input' }),
			uncontrolled ? h(DrawerClose, { id: 'close' }, () => 'Close') : null,
			h('div', { style: { height: '900px' } }),
		]),
	]
	const state = {
		'onUpdate:open': (value: boolean) => { open.value = value },
		'onAnimation-end': (value: boolean) => events.push(value),
	}
	const app = createApp(() => nested
		? h(DrawerRoot, { defaultOpen: true, preventScroll: false, direction: rootOptions.direction }, () =>
			h(DrawerContent, { class: ['test-content test-linear', side && 'test-right'], style: parentStyle, id: 'parent', 'aria-label': 'Parent drawer' }, () =>
				h(DrawerRootNested, { ...state, ...rootOptions, open: open.value }, () => h(DrawerPortal, null, drawer))))
		: h(DrawerRoot, { ...state, ...rootOptions, open: uncontrolled ? undefined : open.value, preventScroll: uncontrolled ?? false }, () => [
			uncontrolled ? h(DrawerTrigger, { id: 'trigger' }, () => 'Open') : null,
			h(DrawerPortal, null, drawer),
		]))
	app.mount(fixture)

	return {
		events,
		setOpen: async (value: boolean) => {
			if (uncontrolled) surface(value ? '#trigger' : '#close').click()
			else open.value = value
			await nextTick()
		},
		dispose: () => {
			app.unmount()
			fixture.remove()
		},
	}
}

function transition(element: HTMLElement, property: string) {
	return element.getAnimations().find(candidate =>
		candidate instanceof CSSTransition && candidate.transitionProperty === property,
	)
}

type TransitionSpec = [HTMLElement, string]

async function transitions(...specs: TransitionSpec[]) {
	await framesUntil(() => specs.every(([element, property]) => transition(element, property)))
	return specs.map(([element, property]) => transition(element, property)!)
}

async function hold(progress: number, ...specs: TransitionSpec[]) {
	for (const animation of await transitions(...specs)) {
		animation.pause()
		animation.currentTime = Number(animation.effect!.getComputedTiming().duration) * progress
	}
}

async function opening(fixture: Fixture, specs: (content: HTMLElement, overlay: HTMLElement) => TransitionSpec[]
	= (content, overlay) => [[content, 'transform'], [overlay, 'opacity']]) {
	await fixture.setOpen(true)
	const content = surface('#content')
	const overlay = surface('#overlay')
	await hold(0.4, ...specs(content, overlay))
	return { content, overlay }
}

let touchActive = false

async function touch(type: 'touchStart' | 'touchMove' | 'touchEnd' | 'touchCancel', point?: { x: number, y: number }) {
	if (type === 'touchStart') touchActive = true
	const response = await fetch('/__drawer_test_touch', {
		method: 'POST',
		body: JSON.stringify({ type, touchPoints: point ? [point] : [] }),
	})
	assert(response.ok, await response.text())
	if (type === 'touchEnd' || type === 'touchCancel') touchActive = false
}

async function pickup(content: HTMLElement, dx: number, dy: number, roomY = 0) {
	const rect = content.getBoundingClientRect()
	const x = Math.round((Math.max(rect.left, 0) + Math.min(rect.right, innerWidth)) / 2)
	const y = Math.min(Math.round((Math.max(rect.top, 0) + Math.min(rect.bottom, innerHeight)) / 2), innerHeight - roomY - 1)
	let trusted = false
	content.addEventListener('gotpointercapture', event => { trusted = event.isTrusted }, { once: true })
	assert(content.contains(document.elementFromPoint(x, y)), 'Drag must start on a hit-testable part of the drawer')
	await touch('touchStart', { x, y })
	await touch('touchMove', { x: x + dx, y: y + dy })
	assert(trusted && content.dataset.dragging === 'true', 'Expected trusted pointer capture and an active drag')
	return (dx: number, dy: number) => touch('touchMove', { x: x + dx, y: y + dy })
}

async function closeMidEnter(fixture: ReturnType<typeof harness>, nested: boolean) {
	const { content, overlay } = await opening(fixture, (content, overlay) =>
		nested ? [[content, 'transform'], [overlay, 'opacity'], [surface('#parent'), 'transform']]
			: [[content, 'transform'], [overlay, 'opacity']])
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
	const specs: TransitionSpec[] = [[content, 'transform'], [overlay, 'opacity']]
	if (parent) specs.push([parent, 'transform'])
	await hold(0.4, ...specs)
	assert(content.isConnected, 'Content must stay mounted while closing')
	let lastOffset = motion(content).offset
	let lastOpacity = motion(overlay).opacity
	const parentBefore = parent ? motion(parent) : null

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

async function dragMidEnter(fixture: Fixture, nested: boolean) {
	const { content, overlay } = await opening(fixture, (content, overlay) =>
		nested ? [[content, 'transform'], [overlay, 'opacity'], [surface('#parent'), 'transform']]
			: [[content, 'transform'], [overlay, 'opacity']])
	const parent = nested ? surface('#parent') : null
	const startOffset = motion(content).offset
	const startOpacity = motion(overlay).opacity
	const parentBefore = parent ? motion(parent) : null
	const move = await pickup(content, 0, 12)
	near(motion(content).offset, startOffset + 12, 1, 'First drag frame position')
	near(motion(overlay).opacity, startOpacity, 0.06, 'First drag frame overlay opacity')
	if (parent && parentBefore) {
		near(motion(parent).scale, parentBefore.scale, 0.002, 'Parent scale on first drag frame')
		near(motion(parent).offset, parentBefore.offset, 1, 'Parent offset on first drag frame')
	}
	await move(0, 30)
	near(motion(content).offset, startOffset + 30, 1, 'Drawer follows the pointer after takeover')
	await touch('touchCancel')
	await framesUntil(() => motion(content).offset === 0)
}

async function reopenDuringSwipeClose(fixture: Fixture) {
	const { content, overlay } = await opening(fixture)
	await pickup(content, 0, 95, 95)
	await touch('touchEnd')
	assert(content.dataset.state === 'closed', 'Expected the swipe to start a close')
	await hold(0.2, [content, 'transform'], [overlay, 'opacity'])
	const before = motion(content)
	const opacity = motion(overlay).opacity
	await fixture.setOpen(true)
	assert(surface('#content') === content, 'Reopen during swipe close must preserve content')
	near(motion(content).offset, before.offset, 3, 'Position on reopen during swipe close')
	near(motion(overlay).opacity, opacity, 0.015, 'Overlay opacity on reopen during swipe close')
	await framesUntil(() => fixture.events.includes(true))
	assert(fixture.events.join() === 'true', 'The canceled swipe close must not emit a completion')
}

async function staggeredSwipeClose(fixture: Fixture) {
	await fixture.setOpen(true)
	const content = surface('#content')
	const overlay = surface('#overlay')
	await framesUntil(() => fixture.events.includes(true) && !transition(overlay, 'opacity'))
	await pickup(content, 0, 95, 95)
	await touch('touchEnd')
	const [contentExit, overlayExit] = await transitions([content, 'transform'], [overlay, 'opacity'])
	overlayExit.pause()
	overlayExit.currentTime = 160
	const opacity = motion(overlay).opacity
	contentExit.finish()
	// Keep the overlay at mid-exit even after the content transition's fallback.
	await framesUntil(elapsed => elapsed >= 160)
	assert(content.isConnected && overlay.isConnected, 'Swipe close keeps both surfaces through the longer exit')
	near(motion(overlay).opacity, opacity, 0.01, 'The shorter swipe exit must not cut off the overlay fade')
	overlayExit.finish()
	await framesUntil(() => !content.isConnected && !overlay.isConnected)
	assert(fixture.events.join() === 'true,false', 'Swipe close completes once after both surfaces leave')
}

async function reopenDuringFadeClose(fixture: ReturnType<typeof harness>) {
	const { content, overlay } = await opening(fixture)
	const startOffset = motion(content).offset
	const startOpacity = motion(overlay).opacity
	await fixture.setOpen(false)
	near(motion(content).offset, startOffset, 3, 'Position when fade interrupts slide')
	near(motion(overlay).opacity, startOpacity, 0.015, 'Overlay opacity when fade interrupts slide')
	await hold(0.4, [content, 'opacity'], [overlay, 'opacity'])
	near(motion(content).offset, startOffset, 3, 'Fade holds the interrupted position')
	const fadingOpacity = motion(overlay).opacity
	await fixture.setOpen(true)
	assert(surface('#content') === content, 'Reopen from a fade must preserve content')
	near(motion(content).offset, startOffset, 3, 'Position on reopen from fade')
	near(motion(overlay).opacity, fadingOpacity, 0.015, 'Overlay opacity on reopen from fade')
	await framesUntil(() => fixture.events.includes(true))
	near(motion(content).offset, 0, 0.1, 'Reopened position')
}

async function interruptSettle(fixture: Fixture, close: boolean) {
	const { content, overlay } = await opening(fixture)
	await pickup(content, 0, 12)
	await touch('touchCancel')
	await hold(0.35, [content, 'transform'], [overlay, 'opacity'])
	const before = motion(content).offset
	if (close) {
		await fixture.setOpen(false)
		near(motion(content).offset, before, 2, 'Close begins from the rendered settle position')
		await hold(0.5, [content, 'transform'])
		assert(motion(content).offset > before, 'Close must retarget the settle toward closed')
		transition(content, 'transform')!.finish()
		await framesUntil(() => !content.isConnected && !overlay.isConnected)
		return
	}

	await pickup(content, 0, 12)
	const dragged = motion(content).offset
	try {
		// Keep the second pointer down past the canceled settle's fallback deadline.
		await framesUntil(elapsed => elapsed >= 650)
		assert(content.dataset.dragging === 'true', 'The new drag must own the drawer past the old settle deadline')
		near(motion(content).offset, dragged, 1, 'The old settle must not clear the new drag transform')
	}
	finally {
		await touch('touchCancel')
	}
}

async function pullOpenPastDismissThreshold(fixture: Fixture) {
	const { content, overlay } = await opening(fixture, content => [[content, 'transform']])
	const start = motion(content).offset
	const fadeStart = innerHeight * 0.6
	const fadeEnd = innerHeight * 0.15
	assert(start > innerHeight * 0.75, 'Test must pick up beyond the dismissal threshold')
	const move = await pickup(content, 0, -12)
	assert(motion(content).offset > fadeStart, 'The opening pull must still be below the first snap point')
	near(motion(overlay).opacity, 0, 0.001, 'Overlay before the fade threshold')
	await move(0, Math.round((fadeStart + fadeEnd) / 2 - start))
	near(motion(overlay).opacity, (fadeStart - motion(content).offset) / (fadeStart - fadeEnd), 0.01, 'Overlay inside the snap fade range')
	await move(0, -12)
	await touch('touchEnd')
	assert(content.dataset.state === 'open', 'An opening pull must not dismiss a drawer beyond its first snap point')
}

async function recloseInSameTick(fixture: Fixture) {
	const { overflow } = document.documentElement.style
	await fixture.setOpen(true)
	await framesUntil(() => fixture.events.includes(true))
	const content = surface('#content')
	const overlay = surface('#overlay')
	await fixture.setOpen(false)
	const [contentExit, overlayExit] = await transitions([content, 'transform'], [overlay, 'opacity'])
	overlayExit.pause()
	contentExit.finish()
	await frame()
	assert(content.isConnected && overlay.isConnected, 'The longer overlay exit must still be pending')
	assert(document.documentElement.style.overflow === 'hidden', 'Scrolling must stay locked through the exit')
	surface('#trigger').click()
	surface('#close').click()
	await nextTick()
	overlayExit.finish()
	await overlayExit.finished
	await frame()
	assert(!content.isConnected && !overlay.isConnected, 'Both surfaces must unmount after the overlay finishes')
	assert(document.documentElement.style.overflow === overflow, 'Scroll lock must be released after both exits')
	assert(fixture.events.join() === 'true,false', 'The close must complete once after both surfaces leave')
}

async function staggeredExit(fixture: Fixture, shortPart: 'content' | 'overlay', reopen: boolean) {
	await fixture.setOpen(true)
	await framesUntil(() => fixture.events.includes(true))
	const content = surface('#content')
	const overlay = surface('#overlay')
	const input = content.querySelector('input')!
	input.value = 'typed state'
	await fixture.setOpen(false)
	const [contentExit, overlayExit] = await transitions([content, 'transform'], [overlay, 'opacity'])
	const [short, long] = shortPart === 'content' ? [contentExit, overlayExit] : [overlayExit, contentExit]
	long.pause()
	long.currentTime = 160
	short.finish()
	await frame()
	assert(content.isConnected && overlay.isConnected, 'Both surfaces must stay mounted after the shorter exit')
	assert(content.inert && !fixture.events.includes(false), 'Content must be inert until both exits complete')
	if (reopen) {
		await fixture.setOpen(true)
		assert(surface('#content') === content && surface('#overlay') === overlay, 'Reopen must preserve both surfaces')
		assert(!content.inert && input.value === 'typed state', 'Reopen must preserve the input and restore interaction')
		await framesUntil(() => fixture.events.length === 2)
		assert(fixture.events.join() === 'true,true', 'The canceled close must not emit a completion')
	}
	else {
		long.finish()
		await framesUntil(() => !content.isConnected && !overlay.isConnected)
		assert(fixture.events.join() === 'true,false', 'The close must complete once after both surfaces leave')
	}
}

async function pickUpFade(fixture: Fixture) {
	const { content } = await opening(fixture, content => [[content, 'transform'], [content, 'opacity']])
	const before = motion(content)
	assert(before.opacity < 0.95 && before.offset > 2, 'Test must pick up a fading, offset drawer')
	await pickup(content, 12, 0)
	try {
		near(motion(content).opacity, before.opacity, 0.01, 'Pickup preserves content opacity')
		near(motion(content).offset, before.offset, 0.1, 'Pickup preserves the fade offset on the cross axis')
		near(motion(content).x, before.x + 12, 0.1, 'Drawer still follows the pointer along its axis')
	}
	finally {
		await touch('touchCancel')
	}
	await framesUntil(() => motion(content).opacity === 1 && motion(content).offset === 0)
}

async function dragPastOverlayEndpoint(fixture: Fixture) {
	const { content, overlay } = await opening(fixture)
	transition(overlay, 'opacity')!.finish()
	const move = await pickup(content, 0, 12)
	try {
		await move(0, Math.ceil(300 - motion(content).offset + 12))
		assert(motion(content).offset >= 300, 'Drawer must reach its closed drag offset')
		near(motion(overlay).opacity, 0, 0.01, 'Overlay reaches zero with the drawer offscreen')
	}
	finally {
		await touch('touchCancel')
	}
}

async function cancelNestedAtRest(fixture: Fixture) {
	const parent = surface('#parent')
	const { content } = await opening(fixture, content => [[content, 'transform']])
	await hold(0.05, [parent, 'transform'])
	await pickup(content, -245, 0)
	assert(motion(content).x === 0, 'Child must reach its open position before cancel')
	near(motion(parent).scale, 1 - 16 / innerWidth, 0.001, 'Parent scale while the child is held fully open')
	await touch('touchCancel')
	assert(parent.style.transition !== 'none', 'Cancel must return the parent to its open-child transition')
	await framesUntil(() => parent.getAnimations().length === 0)
	near(motion(parent).scale, 1 - 16 / innerWidth, 0.001, 'Parent scale with its child open')
}

async function dragNestedOffscreen(fixture: Fixture) {
	const parent = surface('#parent')
	const { content } = await opening(fixture, content => [[content, 'transform']])
	await framesUntil(() => !transition(parent, 'transform'))
	assert(motion(parent).scale < 1, 'Parent must finish scaling before the child is picked up')
	const move = await pickup(content, 0, 12)
	await move(0, Math.ceil(300 - motion(content).offset + 24))
	assert(motion(content).offset > 300, 'Child must be dragged beyond its closed position')
	near(motion(parent).scale, 1, 0.001, 'Parent scale while the child is held offscreen')
	near(motion(parent).offset, 0, 0.1, 'Parent offset while the child is held offscreen')
	await touch('touchCancel')
}

async function recoverFromFailedTouch(fixture: Fixture) {
	const failure = new Error('Injected failure after trusted touch pickup')
	try {
		await runCase(() => harness(), async (failedFixture) => {
			const { content } = await opening(failedFixture)
			await pickup(content, 0, 12)
			throw failure
		})
	}
	catch (error) {
		if (error !== failure) throw error
	}
	await dragMidEnter(fixture, false)
}

function timing(element: HTMLElement, property: string, duration: number | undefined, easing: string) {
	const animation = transition(element, property)
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
	const specs: TransitionSpec[] = [[content, property]]
	if (!snap) specs.push([overlay, 'opacity'])
	await transitions(...specs)
	timing(content, property, fade ? 260 : 500, fade ? 'cubic-bezier(0.2, 0, 0, 1)' : 'linear')
	if (!snap) timing(overlay, 'opacity', 500, 'linear')
	if (fade || reduced) near(motion(content).offset, 0, 0.1, 'Fade enter offset')
	await framesUntil(() => fixture.events.includes(true) && overlay.getAnimations().length === 0)
	near(motion(content).offset, snap ? innerHeight - 240 : 0, 0.1, 'Resting offset')
	await fixture.setOpen(false)
	await transitions(...specs)
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
	['complete swipe close after both surfaces exit', () => harness(false, {
		contentStyle: { '--drawer-close-duration': '80ms', '--drawer-close-duration-ms': '80' },
	}), staggeredSwipeClose],
	['fade interrupts slide and reopens', () => harness(false, { closeAnimation: 'fade' }), reopenDuringFadeClose],
	['uninterrupted slide', () => harness(), fixture => uninterrupted(fixture)],
	['uninterrupted fade', () => harness(false, { animation: 'fade', closeAnimation: 'fade' }), fixture => uninterrupted(fixture, { fade: true })],
	['uninterrupted reduced motion', () => harness(false, { reduced: true }), fixture => uninterrupted(fixture, { reduced: true })],
	['uninterrupted snap point', () => harness(false, { snapPoints: ['240px'] }), fixture => uninterrupted(fixture, { snap: true })],
	['close during a canceled drag settle', () => harness(), fixture => interruptSettle(fixture, true)],
	['pick up during a canceled drag settle', () => harness(), fixture => interruptSettle(fixture, false)],
	['pull toward open beyond the first snap point', () => harness(false, {
		snapPoints: [0.4, 0.85], contentStyle: { height: '100vh' },
	}), pullOpenPastDismissThreshold],
	['reopen when content finishes exiting first', () => harness(false, {
		contentStyle: { '--drawer-close-duration': '80ms' },
	}), fixture => staggeredExit(fixture, 'content', true)],
	['reopen when overlay finishes exiting first', () => harness(false, {
		overlayStyle: { '--drawer-close-duration': '80ms' },
	}), fixture => staggeredExit(fixture, 'overlay', true)],
	['complete close after both surfaces exit', () => harness(false, {
		contentStyle: { '--drawer-close-duration': '80ms' },
	}), fixture => staggeredExit(fixture, 'content', false)],
	['reopen and reclose in the same tick after content exits', () => harness(false, {
		uncontrolled: true, contentStyle: { '--drawer-close-duration': '80ms' },
	}), recloseInSameTick],
	['pick up a fading side drawer', () => harness(false, {
		direction: 'right', animation: 'fade', contentStyle: { '--drawer-fade-enter-offset': '40px' },
	}), pickUpFade],
	['drag offscreen with a faster overlay enter', () => harness(false, {
		overlayStyle: { '--drawer-duration': '80ms' },
	}), dragPastOverlayEndpoint],
	['cancel a nested drag at the open position', () => harness(true, {
		direction: 'right', parentStyle: { '--drawer-duration': '900ms', '--drawer-duration-ms': '900' },
	}), cancelNestedAtRest],
	['drag a nested child offscreen with a faster parent enter', () => harness(true, {
		parentStyle: { '--drawer-duration': '80ms', '--drawer-duration-ms': '80' },
	}), dragNestedOffscreen],
	['pick up with trusted touch after a failed drag case', () => harness(), recoverFromFailedTouch],
]

async function runCase(makeFixture: () => Fixture, run: (fixture: Fixture) => Promise<void>) {
	const fixture = makeFixture()
	try {
		await run(fixture)
	}
	finally {
		try {
			if (touchActive) await touch('touchCancel')
		}
		finally {
			fixture.dispose()
		}
	}
}

const results = []
for (const [name, makeFixture, run] of cases) {
	try {
		await runCase(makeFixture, run)
		results.push({ name })
	}
	catch (error) {
		results.push({ name, error: String(error) })
	}
}
await fetch('/__drawer_test_results', { method: 'POST', body: JSON.stringify(results) })
