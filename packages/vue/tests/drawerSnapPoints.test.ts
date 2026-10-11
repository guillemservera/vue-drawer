import { describe, expect, it } from 'vitest'
import {
	getActiveSnapPointIndex,
	getClosestSnapPointIndex,
	getOverlayOpacityForOffset,
	getSnapPointOffsets,
	resolveSnapPointSize,
	resolveSnapPointTarget,
} from '../src/utils/drawerSnapPoints'

describe('drawerSnapPoints', () => {
	it('resolves percentage and pixel snap points against the snap axis size', () => {
		expect(resolveSnapPointSize(400, 0.5)).toBe(200)
		expect(resolveSnapPointSize(400, '120px')).toBe(120)
		expect(resolveSnapPointSize(400, '7rem')).toBe(112)
		expect(resolveSnapPointSize(400, '999px')).toBe(400)
	})

	it('builds close-direction offsets from snap points', () => {
		expect(getSnapPointOffsets(600, ['80px', 0.5, 1])).toEqual([520, 300, 0])
	})

	it('falls back to the first snap point when the active value is missing', () => {
		expect(getActiveSnapPointIndex(['80px', 0.5, 1], null)).toBe(0)
		expect(getActiveSnapPointIndex(['80px', 0.5, 1], 0.5)).toBe(1)
		expect(getActiveSnapPointIndex(['80px', 0.5, 1], 'missing')).toBe(0)
	})

	it('finds the closest snap point to the current drag offset', () => {
		expect(getClosestSnapPointIndex(470, [520, 300, 0])).toBe(0)
		expect(getClosestSnapPointIndex(240, [520, 300, 0])).toBe(1)
		expect(getClosestSnapPointIndex(40, [520, 300, 0])).toBe(2)
	})

	it('only fades the overlay after the configured snap point', () => {
		const offsets = [520, 300, 0]

		expect(getOverlayOpacityForOffset(520, offsets, undefined)).toBe(1)
		expect(getOverlayOpacityForOffset(520, offsets, 1)).toBe(0)
		expect(getOverlayOpacityForOffset(300, offsets, 1)).toBe(1)
		expect(getOverlayOpacityForOffset(410, offsets, 1)).toBeCloseTo(0.5, 5)
	})

	it('closes from any snap point when dragged beyond the smallest snap threshold', () => {
		const result = resolveSnapPointTarget({
			activeSnapPointIndex: 2,
			closeThreshold: 0.25,
			currentOffset: 550,
			dismissible: true,
			drawerSize: 600,
			snapPointsOffset: [520, 300, 0],
			velocity: 0.1,
		})

		expect(result).toEqual({
			type: 'close',
		})
	})

	it('closes from any snap point on a fast close-direction swipe by default', () => {
		const result = resolveSnapPointTarget({
			activeSnapPointIndex: 2,
			closeThreshold: 0.25,
			currentOffset: 160,
			dismissible: true,
			drawerSize: 600,
			snapPointsOffset: [520, 300, 0],
			velocity: 2.2,
		})

		expect(result).toEqual({
			type: 'close',
		})
	})

	it('uses sequential snap points when snapToSequentialPoint is enabled', () => {
		const result = resolveSnapPointTarget({
			activeSnapPointIndex: 2,
			closeThreshold: 0.25,
			currentOffset: 160,
			dismissible: true,
			drawerSize: 600,
			snapPointsOffset: [520, 300, 0],
			snapToSequentialPoint: true,
			velocity: 2.2,
		})

		expect(result).toEqual({
			type: 'snap',
			index: 1,
		})
	})

	it('expands to the last snap point when dragged beyond the largest snap threshold', () => {
		const result = resolveSnapPointTarget({
			activeSnapPointIndex: 0,
			closeThreshold: 0.25,
			currentOffset: 120,
			dismissible: true,
			drawerSize: 600,
			snapPointsOffset: [520, 300, 0],
			snapToSequentialPoint: true,
			velocity: -0.1,
		})

		expect(result).toEqual({
			type: 'snap',
			index: 2,
		})
	})

	it('keeps the first snap point when dismissal is disabled', () => {
		const result = resolveSnapPointTarget({
			activeSnapPointIndex: 0,
			closeThreshold: 0.25,
			currentOffset: 560,
			dismissible: false,
			drawerSize: 600,
			snapPointsOffset: [520, 300, 0],
			velocity: 0.7,
		})

		expect(result).toEqual({
			type: 'snap',
			index: 0,
		})
	})
})
