import type { DrawerDirection } from './drawerTypes'

export const DRAWER_EASE = 'cubic-bezier(0.32, 0.72, 0, 1)'
export const DRAWER_DEFAULT_TRANSITION_DURATION_MS = 500
export const DRAWER_DEFAULT_CLOSE_TRANSITION_DURATION_MS = DRAWER_DEFAULT_TRANSITION_DURATION_MS
export const DRAWER_DEFAULT_OVERLAY_TRANSITION_DURATION_MS = DRAWER_DEFAULT_TRANSITION_DURATION_MS
export const DRAWER_DEFAULT_OVERLAY_CLOSE_TRANSITION_DURATION_MS = DRAWER_DEFAULT_TRANSITION_DURATION_MS

export function dampenValue(value: number) {
	return 8 * (Math.log(value + 1) - 2)
}

export const DRAWER_DEFAULT_CLOSE_THRESHOLD = 0.25
export const DRAWER_DEFAULT_SCROLL_LOCK_TIMEOUT = 500
export const DRAWER_VELOCITY_THRESHOLD = 0.4
export const DRAWER_FAST_SWIPE_VELOCITY = 2
export const DRAWER_DRAG_ACTIVATION_PX = 6
export const DRAWER_CLICK_SUPPRESS_MS = 180
export const DRAWER_NESTED_PARENT_DISPLACEMENT = 16

export function isVerticalDrawer(direction: DrawerDirection) {
	return direction === 'top' || direction === 'bottom'
}

export function getCloseDirectionSign(direction: DrawerDirection) {
	return direction === 'bottom' || direction === 'right' ? 1 : -1
}

export function getClosedTransform(direction: DrawerDirection) {
	switch (direction) {
		case 'bottom':
			return 'translate3d(0, calc(100% + env(safe-area-inset-bottom) + var(--drawer-offscreen-offset, 24px)), 0)'
		case 'top':
			return 'translate3d(0, calc(-100% - env(safe-area-inset-top) - var(--drawer-offscreen-offset, 24px)), 0)'
		case 'left':
			return 'translate3d(calc(-100% - env(safe-area-inset-left) - var(--drawer-offscreen-offset, 24px)), 0, 0)'
		case 'right':
			return 'translate3d(calc(100% + env(safe-area-inset-right) + var(--drawer-offscreen-offset, 24px)), 0, 0)'
	}
}

export function getAxisDistance(event: PointerEvent, direction: DrawerDirection) {
	return isVerticalDrawer(direction)
		? (event.pageY || event.clientY)
		: (event.pageX || event.clientX)
}

export function getViewportSize(direction: DrawerDirection) {
	return isVerticalDrawer(direction) ? window.innerHeight : window.innerWidth
}

export function getTranslateStyles(direction: DrawerDirection, distance: number) {
	switch (direction) {
		case 'bottom':
			return `translate3d(0, ${distance}px, 0)`
		case 'top':
			return `translate3d(0, ${distance * -1}px, 0)`
		case 'left':
			return `translate3d(${distance * -1}px, 0, 0)`
		case 'right':
			return `translate3d(${distance}px, 0, 0)`
	}
}

export function getNestedParentTransform(direction: DrawerDirection, closeProgress = 0) {
	const clampedCloseProgress = Math.min(Math.max(closeProgress, 0), 1)
	const openProgress = 1 - clampedCloseProgress
	const viewportWidth = typeof window !== 'undefined' ? Math.max(window.innerWidth, 1) : 375
	const openScale = Math.max((viewportWidth - DRAWER_NESTED_PARENT_DISPLACEMENT) / viewportWidth, 0.94)
	const scale = 1 - ((1 - openScale) * openProgress)
	const displacement = DRAWER_NESTED_PARENT_DISPLACEMENT * openProgress

	if (direction === 'left') {
		return `scale(${scale}) translate3d(${displacement}px, 0, 0)`
	}

	if (direction === 'right') {
		return `scale(${scale}) translate3d(${-displacement}px, 0, 0)`
	}

	if (direction === 'top') {
		return `scale(${scale}) translate3d(0, ${displacement}px, 0)`
	}

	return `scale(${scale}) translate3d(0, ${-displacement}px, 0)`
}
