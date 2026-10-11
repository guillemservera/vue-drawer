import { vi } from 'vitest'

if (typeof globalThis.PointerEvent === 'undefined') {
	globalThis.PointerEvent = MouseEvent as typeof PointerEvent
}

if (typeof globalThis.TransitionEvent === 'undefined') {
class TestTransitionEvent extends Event {
	elapsedTime: number
	propertyName: string
	pseudoElement: string

	constructor(type: string, init: TransitionEventInit = {}) {
		super(type, init)
		this.elapsedTime = init.elapsedTime ?? 0
		this.propertyName = init.propertyName ?? ''
		this.pseudoElement = init.pseudoElement ?? ''
	}
}

	globalThis.TransitionEvent = TestTransitionEvent as typeof TransitionEvent
}

Object.defineProperty(window, 'scrollTo', {
	configurable: true,
	value: vi.fn(),
})
