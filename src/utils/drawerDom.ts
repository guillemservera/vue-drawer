export const DRAWER_RECENT_OPEN_WINDOW_MS = 500
const DRAWER_TRANSITION_FALLBACK_BUFFER_MS = 60
const bodyPointerEventLocks = new Set<string>()

export function focusWithDrawerMarker(element: HTMLElement): boolean {
	element.setAttribute('data-drawer-return-focus', 'true')
	element.focus({ preventScroll: true })
	if (document.activeElement !== element) {
		element.removeAttribute('data-drawer-return-focus')
		return false
	}

	const clearMarker = () => {
		queueMicrotask(() => {
			if (!document.hasFocus() || document.activeElement === element) return
			element.removeAttribute('data-drawer-return-focus')
			element.removeEventListener('blur', clearMarker)
			window.removeEventListener('focus', clearMarker)
		})
	}
	element.addEventListener('blur', clearMarker)
	window.addEventListener('focus', clearMarker)
	return true
}
let previousBodyPointerEvents: string | null = null

export function isDrawerTransitionEnd(
	event: Event,
	element: HTMLElement,
	propertyName: 'transform' | 'opacity',
) {
	if (!('propertyName' in event)) return false
	if (event.target !== element) return false
	const transitionPropertyName = event.propertyName
	return transitionPropertyName === propertyName || transitionPropertyName === 'all'
}

export function restoreBodyPointerEvents() {
	if (typeof document === 'undefined') return
	if (bodyPointerEventLocks.size > 0) return
	if (document.body.style.pointerEvents !== 'none') return
	document.body.style.pointerEvents = 'auto'
}

export function lockBodyPointerEvents(lockId: string) {
	if (typeof document === 'undefined') return
	if (bodyPointerEventLocks.has(lockId)) return

	if (bodyPointerEventLocks.size === 0) {
		previousBodyPointerEvents = document.body.style.pointerEvents
	}

	bodyPointerEventLocks.add(lockId)
	document.body.style.pointerEvents = 'none'
}

export function unlockBodyPointerEvents(lockId: string) {
	if (typeof document === 'undefined') return
	if (!bodyPointerEventLocks.delete(lockId)) return
	if (bodyPointerEventLocks.size > 0) return

	document.body.style.pointerEvents = previousBodyPointerEvents ?? ''
	previousBodyPointerEvents = null
}

export function scheduleBodyPointerEventsRestore() {
	if (typeof window === 'undefined') {
		restoreBodyPointerEvents()
		return
	}

	window.requestAnimationFrame(() => {
		restoreBodyPointerEvents()
	})
}

export function getDrawerTransitionDurationMs(element: HTMLElement) {
	if (typeof window === 'undefined') return 0

	const computed = window.getComputedStyle(element)
	const transitionDuration = resolveTransitionStyleValue(computed.transitionDuration, element.style.transitionDuration)
	const transitionDelay = resolveTransitionStyleValue(computed.transitionDelay, element.style.transitionDelay)
	const durations = transitionDuration.split(',')
	const delays = transitionDelay.split(',')
	const transitionsCount = Math.max(durations.length, delays.length)
	let totalDuration = 0

	for (let index = 0; index < transitionsCount; index += 1) {
		const duration = parseTransitionTimeToMs(durations[index] ?? durations[durations.length - 1] ?? '0s')
		const delay = parseTransitionTimeToMs(delays[index] ?? delays[delays.length - 1] ?? '0s')
		totalDuration = Math.max(totalDuration, duration + delay)
	}

	return totalDuration
}

export function waitForDrawerTransition(
	element: HTMLElement,
	propertyName: 'transform' | 'opacity',
	callback: () => void,
) {
	if (typeof window === 'undefined') {
		callback()
		return () => {}
	}

	let settled = false
	const fallbackMs = Math.max(
		getDrawerTransitionDurationMs(element) + DRAWER_TRANSITION_FALLBACK_BUFFER_MS,
		DRAWER_TRANSITION_FALLBACK_BUFFER_MS,
	)

	const finish = () => {
		if (settled) return
		settled = true
		element.removeEventListener('transitionend', handleTransitionEnd)
		globalThis.clearTimeout(timeoutId)
		callback()
	}

	const handleTransitionEnd = (event: Event) => {
		if (!isDrawerTransitionEnd(event, element, propertyName)) return
		finish()
	}

	const timeoutId = globalThis.setTimeout(finish, fallbackMs)
	element.addEventListener('transitionend', handleTransitionEnd)

	return () => {
		if (settled) return
		settled = true
		element.removeEventListener('transitionend', handleTransitionEnd)
		globalThis.clearTimeout(timeoutId)
	}
}

export function isSafariBrowser() {
	if (typeof window === 'undefined') return false
	return /^((?!chrome|android).)*safari/i.test(window.navigator.userAgent)
}

function parseTransitionTimeToMs(value: string) {
	const normalized = value.trim().toLowerCase()
	if (!normalized) return 0

	if (normalized.endsWith('ms')) {
		const parsed = Number.parseFloat(normalized)
		return Number.isFinite(parsed) ? parsed : 0
	}

	if (normalized.endsWith('s')) {
		const parsed = Number.parseFloat(normalized)
		return Number.isFinite(parsed) ? parsed * 1000 : 0
	}

	const parsed = Number.parseFloat(normalized)
	return Number.isFinite(parsed) ? parsed : 0
}

function resolveTransitionStyleValue(computedValue: string, inlineValue: string) {
	const normalizedComputed = computedValue.trim()
	if (normalizedComputed && normalizedComputed !== '0s' && normalizedComputed !== '0ms') {
		return normalizedComputed
	}

	const normalizedInline = inlineValue.trim()
	if (normalizedInline) {
		return normalizedInline
	}

	return normalizedComputed || '0s'
}
