import { describe, expect, it } from 'vitest'
import { getPointerPagePosition, resolvePointerDragIntent } from '../src/utils/drawerPointer'

describe('drawerPointer', () => {
	it('prefers page coordinates when available', () => {
		const event = {
			pageX: 24,
			pageY: 48,
			clientX: 12,
			clientY: 18,
		} as PointerEvent

		expect(getPointerPagePosition(event)).toEqual({ x: 24, y: 48 })
	})

	it('falls back to client coordinates when page coordinates are zero', () => {
		const event = {
			pageX: 0,
			pageY: 0,
			clientX: 12,
			clientY: 18,
		} as PointerEvent

		expect(getPointerPagePosition(event)).toEqual({ x: 12, y: 18 })
	})

	it('keeps bottom drawers locked to vertical intent near the start of a gesture', () => {
		const intent = resolvePointerDragIntent({
			delta: { x: 14, y: 8 },
			direction: 'bottom',
			threshold: 10,
		})

		expect(intent).toEqual({
			shouldHandle: false,
			hasCommittedDirection: false,
		})
	})

	it('keeps left drawers locked to horizontal intent near the start of a gesture', () => {
		const intent = resolvePointerDragIntent({
			delta: { x: -8, y: 14 },
			direction: 'left',
			threshold: 10,
		})

		expect(intent).toEqual({
			shouldHandle: false,
			hasCommittedDirection: false,
		})
	})

	it('commits once movement is clearly in the drawer axis', () => {
		const intent = resolvePointerDragIntent({
			delta: { x: 0, y: 18 },
			direction: 'bottom',
			threshold: 10,
		})

		expect(intent).toEqual({
			shouldHandle: true,
			hasCommittedDirection: true,
		})
	})

	it('keeps handling after the swipe direction has already been committed', () => {
		const intent = resolvePointerDragIntent({
			delta: { x: 20, y: 4 },
			direction: 'bottom',
			threshold: 10,
			hasCommittedDirection: true,
		})

		expect(intent).toEqual({
			shouldHandle: true,
			hasCommittedDirection: true,
		})
	})
})
