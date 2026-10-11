import { DRAWER_FAST_SWIPE_VELOCITY, DRAWER_VELOCITY_THRESHOLD } from './drawerConstants'
import type { DrawerSnapPoint } from './drawerTypes'

interface ResolveSnapPointTargetOptions {
	activeSnapPointIndex: number
	closeThreshold: number
	currentOffset: number
	dismissible: boolean
	drawerSize: number
	snapPointsOffset: number[]
	snapToSequentialPoint?: boolean
	velocity: number
}

export function resolveSnapPointSize(drawerSize: number, snapPoint: DrawerSnapPoint) {
	if (typeof snapPoint === 'string') {
		const resolved = resolveSnapPointString(snapPoint)
		if (!Number.isFinite(resolved)) return 0
		return clamp(resolved, 0, drawerSize)
	}

	if (!Number.isFinite(snapPoint)) return 0
	return clamp(snapPoint * drawerSize, 0, drawerSize)
}

export function getSnapPointOffsets(drawerSize: number, snapPoints: DrawerSnapPoint[]) {
	return snapPoints.map((snapPoint) => {
		const visibleSize = resolveSnapPointSize(drawerSize, snapPoint)
		return Math.max(drawerSize - visibleSize, 0)
	})
}

export function getActiveSnapPointIndex(
	snapPoints: DrawerSnapPoint[] | undefined,
	activeSnapPoint: DrawerSnapPoint | null | undefined,
) {
	if (!snapPoints?.length) return -1
	if (activeSnapPoint === null || activeSnapPoint === undefined) return 0

	const index = snapPoints.findIndex(snapPoint => snapPoint === activeSnapPoint)
	return index >= 0 ? index : 0
}

export function getClosestSnapPointIndex(currentOffset: number, snapPointsOffset: number[]) {
	if (!snapPointsOffset.length) return -1

	const firstOffset = snapPointsOffset[0]
	if (firstOffset === undefined) return -1

	let closestIndex = 0
	let closestDistance = Math.abs(firstOffset - currentOffset)

	for (let index = 1; index < snapPointsOffset.length; index += 1) {
		const snapPointOffset = snapPointsOffset[index]
		if (snapPointOffset === undefined) continue

		const distance = Math.abs(snapPointOffset - currentOffset)
		if (distance >= closestDistance) continue
		closestDistance = distance
		closestIndex = index
	}

	return closestIndex
}

export function getOverlayOpacityForOffset(
	currentOffset: number,
	snapPointsOffset: number[],
	fadeFromIndex: number | undefined,
) {
	if (!snapPointsOffset.length) return 1
	if (fadeFromIndex === undefined || fadeFromIndex <= 0) return 1
	if (fadeFromIndex >= snapPointsOffset.length) return 0

	const fadeStartOffset = snapPointsOffset[fadeFromIndex - 1]
	const fadeEndOffset = snapPointsOffset[fadeFromIndex]

	if (fadeStartOffset === undefined || fadeEndOffset === undefined) return 1
	if (currentOffset >= fadeStartOffset) return 0
	if (currentOffset <= fadeEndOffset) return 1
	if (fadeStartOffset === fadeEndOffset) return 1

	return clamp((fadeStartOffset - currentOffset) / (fadeStartOffset - fadeEndOffset), 0, 1)
}

export function resolveSnapPointTarget(options: ResolveSnapPointTargetOptions) {
	const {
		activeSnapPointIndex,
		closeThreshold,
		currentOffset,
		dismissible,
		drawerSize,
		snapPointsOffset,
		snapToSequentialPoint = false,
		velocity,
	} = options

	if (!snapPointsOffset.length) {
		return {
			type: 'snap' as const,
			index: -1,
		}
	}

	const lastIndex = snapPointsOffset.length - 1
	const clampedActiveIndex = clamp(activeSnapPointIndex, 0, lastIndex)
	const firstOffset = snapPointsOffset[0]
	if (firstOffset === undefined) {
		return {
			type: 'snap' as const,
			index: -1,
		}
	}

	const firstVisibleSize = Math.max(drawerSize - firstOffset, 1)
	const dismissOffset = firstOffset + firstVisibleSize * closeThreshold

	if (dismissible && currentOffset >= dismissOffset) {
		return { type: 'close' as const }
	}

	const lastOffset = snapPointsOffset[lastIndex] ?? 0
	const lastVisibleSize = Math.max(drawerSize - lastOffset, 1)
	const expandOffset = lastOffset + lastVisibleSize * closeThreshold

	if (currentOffset <= expandOffset) {
		return {
			type: 'snap' as const,
			index: lastIndex,
		}
	}

	if (!snapToSequentialPoint && velocity >= DRAWER_FAST_SWIPE_VELOCITY) {
		return dismissible
			? { type: 'close' as const }
			: { type: 'snap' as const, index: 0 }
	}

	if (!snapToSequentialPoint && velocity <= DRAWER_FAST_SWIPE_VELOCITY * -1) {
		return {
			type: 'snap' as const,
			index: lastIndex,
		}
	}

	if (velocity >= DRAWER_VELOCITY_THRESHOLD) {
		if (clampedActiveIndex === 0) {
			return dismissible
				? { type: 'close' as const }
				: { type: 'snap' as const, index: 0 }
		}

		return {
			type: 'snap' as const,
			index: clampedActiveIndex - 1,
		}
	}

	if (velocity <= DRAWER_VELOCITY_THRESHOLD * -1) {
		return {
			type: 'snap' as const,
			index: Math.min(clampedActiveIndex + 1, lastIndex),
		}
	}

	return {
		type: 'snap' as const,
		index: getClosestSnapPointIndex(currentOffset, snapPointsOffset),
	}
}

function resolveSnapPointString(value: string) {
	const normalized = value.trim().toLowerCase()
	if (!normalized) return Number.NaN

	if (normalized.endsWith('rem')) {
		const remValue = Number.parseFloat(normalized)
		if (!Number.isFinite(remValue)) return Number.NaN
		return remValue * getRootFontSize()
	}

	if (normalized.endsWith('px')) {
		return Number.parseFloat(normalized)
	}

	return Number.parseFloat(normalized)
}

function getRootFontSize() {
	if (typeof window === 'undefined' || typeof document === 'undefined') return 16
	const resolved = window.getComputedStyle(document.documentElement).fontSize
	const size = Number.parseFloat(resolved)
	return Number.isFinite(size) && size > 0 ? size : 16
}

function clamp(value: number, min: number, max: number) {
	return Math.min(Math.max(value, min), max)
}
