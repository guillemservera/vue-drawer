import type { DrawerDirection } from './drawerTypes'

interface PointerDelta {
	x: number
	y: number
}

interface ResolvePointerDragIntentOptions {
	delta: PointerDelta
	direction: DrawerDirection
	threshold?: number
	hasCommittedDirection?: boolean
}

export function getPointerPagePosition(event: PointerEvent) {
	return {
		x: event.pageX || event.clientX,
		y: event.pageY || event.clientY,
	}
}

const CLICK_SUPPRESS_TIMEOUT_MS = 500

/**
 * Swallows the click that follows a dismissing pointerdown. Drawers close on
 * pointerdown (overlay tap / outside tap) and the closing surface immediately
 * stops hit-testing (`pointer-events: none`), so the browser would deliver the
 * synthesized click to whatever interactive element sits underneath —
 * activating it right as the drawer dismisses.
 */
export function suppressNextClickAfterPointerDismiss() {
	if (typeof document === 'undefined' || typeof window === 'undefined') return

	const swallowClick = (event: MouseEvent) => {
		event.preventDefault()
		event.stopPropagation()
		document.removeEventListener('click', swallowClick, true)
	}

	document.addEventListener('click', swallowClick, true)
	window.setTimeout(() => {
		document.removeEventListener('click', swallowClick, true)
	}, CLICK_SUPPRESS_TIMEOUT_MS)
}

export function resolvePointerDragIntent(options: ResolvePointerDragIntentOptions) {
	const {
		delta,
		direction,
		threshold = 0,
		hasCommittedDirection = false,
	} = options

	if (hasCommittedDirection) {
		return {
			shouldHandle: true,
			hasCommittedDirection: true,
		}
	}

	const deltaY = Math.abs(delta.y)
	const deltaX = Math.abs(delta.x)
	const isHorizontalDelta = deltaX > deltaY
	const directionFactor = direction === 'bottom' || direction === 'right' ? 1 : -1

	if (direction === 'left' || direction === 'right') {
		const isReverseDirection = delta.x * directionFactor < 0
		if (!isReverseDirection && deltaX <= threshold) {
			return {
				shouldHandle: isHorizontalDelta,
				hasCommittedDirection: false,
			}
		}
	}
	else {
		const isReverseDirection = delta.y * directionFactor < 0
		if (!isReverseDirection && deltaY <= threshold) {
			return {
				shouldHandle: !isHorizontalDelta,
				hasCommittedDirection: false,
			}
		}
	}

	return {
		shouldHandle: true,
		hasCommittedDirection: true,
	}
}
