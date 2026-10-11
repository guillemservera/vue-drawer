import { afterEach, describe, expect, it, vi } from 'vitest'
import {
	DRAWER_RECENT_OPEN_WINDOW_MS,
	focusWithDrawerMarker,
	getDrawerTransitionDurationMs,
	isDrawerTransitionEnd,
	restoreBodyPointerEvents,
	scheduleBodyPointerEventsRestore,
	waitForDrawerTransition,
} from '../src/utils/drawerDom'

function createTransitionEndEvent(propertyName: string) {
	const event = new Event('transitionend')
	Object.defineProperty(event, 'propertyName', {
		value: propertyName,
		configurable: true,
	})
	return event
}

describe('drawerDom', () => {
	afterEach(() => {
		vi.useRealTimers()
		document.body.style.pointerEvents = ''
	})

	it('recognizes transitionend events emitted by the drawer content itself', () => {
		const element = document.createElement('div')
		const matchingEvent = createTransitionEndEvent('transform')
		const nestedEvent = createTransitionEndEvent('transform')

		Object.defineProperty(matchingEvent, 'target', {
			value: element,
			configurable: true,
		})
		Object.defineProperty(nestedEvent, 'target', {
			value: document.createElement('button'),
			configurable: true,
		})

		expect(isDrawerTransitionEnd(matchingEvent, element, 'transform')).toBe(true)
		expect(isDrawerTransitionEnd(nestedEvent, element, 'transform')).toBe(false)
		expect(isDrawerTransitionEnd(createTransitionEndEvent('opacity'), element, 'transform')).toBe(false)
	})

	it('keeps restored focus ring suppression through window reactivation', async () => {
		const target = document.createElement('button')
		const next = document.createElement('button')
		document.body.append(target, next)
		const hasFocus = vi.spyOn(document, 'hasFocus').mockReturnValue(true)

		expect(focusWithDrawerMarker(target)).toBe(true)
		expect(target.dataset.drawerReturnFocus).toBe('true')

		hasFocus.mockReturnValue(false)
		target.dispatchEvent(new FocusEvent('blur'))
		await Promise.resolve()
		expect(target.dataset.drawerReturnFocus).toBe('true')

		hasFocus.mockReturnValue(true)
		window.dispatchEvent(new FocusEvent('focus'))
		await Promise.resolve()
		expect(target.dataset.drawerReturnFocus).toBe('true')

		next.focus()
		await Promise.resolve()
		expect(target.dataset.drawerReturnFocus).toBeUndefined()
		target.remove()
		next.remove()
	})

	it('restores body pointer events only when the body is blocked', () => {
		document.body.style.pointerEvents = 'none'
		restoreBodyPointerEvents()
		expect(document.body.style.pointerEvents).toBe('auto')

		document.body.style.pointerEvents = 'auto'
		restoreBodyPointerEvents()
		expect(document.body.style.pointerEvents).toBe('auto')
	})

	it('schedules pointer-event restoration on the next animation frame', () => {
		vi.useFakeTimers()
		document.body.style.pointerEvents = 'none'
		vi.stubGlobal('requestAnimationFrame', vi.fn((callback: FrameRequestCallback) => {
			callback(16)
			return 1
		}))

		scheduleBodyPointerEventsRestore()

		expect(document.body.style.pointerEvents).toBe('auto')
		expect(DRAWER_RECENT_OPEN_WINDOW_MS).toBe(500)
	})

	it('parses the longest transition duration including delays', () => {
		const element = document.createElement('div')
		element.style.transitionDuration = '200ms, 0.1s'
		element.style.transitionDelay = '50ms, 25ms'

		expect(getDrawerTransitionDurationMs(element)).toBe(250)
	})

	it('falls back to a timeout when transitionend does not fire', () => {
		vi.useFakeTimers()
		const element = document.createElement('div')
		element.style.transitionDuration = '120ms'

		const callback = vi.fn()
		waitForDrawerTransition(element, 'transform', callback)

		vi.advanceTimersByTime(179)
		expect(callback).not.toHaveBeenCalled()

		vi.advanceTimersByTime(1)
		expect(callback).toHaveBeenCalledTimes(1)
	})

	it('resolves transition waits immediately on matching transitionend', () => {
		vi.useFakeTimers()
		const element = document.createElement('div')
		element.style.transitionDuration = '200ms'

		const callback = vi.fn()
		waitForDrawerTransition(element, 'transform', callback)

		const event = createTransitionEndEvent('transform')
		Object.defineProperty(event, 'target', {
			value: element,
			configurable: true,
		})

		element.dispatchEvent(event)

		expect(callback).toHaveBeenCalledTimes(1)
		vi.runAllTimers()
		expect(callback).toHaveBeenCalledTimes(1)
	})
})
