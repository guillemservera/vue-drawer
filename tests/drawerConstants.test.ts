import { describe, expect, it } from 'vitest'
import {
	getCloseDirectionSign,
	getClosedTransform,
	getNestedParentTransform,
	getTranslateStyles,
	isVerticalDrawer,
} from '../src/utils/drawerConstants'

describe('drawerConstants', () => {
	it('maps directions to the correct close sign', () => {
		expect(getCloseDirectionSign('bottom')).toBe(1)
		expect(getCloseDirectionSign('right')).toBe(1)
		expect(getCloseDirectionSign('top')).toBe(-1)
		expect(getCloseDirectionSign('left')).toBe(-1)
	})

	it('identifies vertical drawers correctly', () => {
		expect(isVerticalDrawer('bottom')).toBe(true)
		expect(isVerticalDrawer('top')).toBe(true)
		expect(isVerticalDrawer('left')).toBe(false)
		expect(isVerticalDrawer('right')).toBe(false)
	})

	it('builds translate values in the close direction for each drawer side', () => {
		expect(getTranslateStyles('bottom', 24)).toBe('translate(0, 24px)')
		expect(getTranslateStyles('top', 24)).toBe('translate(0, -24px)')
		expect(getTranslateStyles('left', 24)).toBe('translate(-24px, 0)')
		expect(getTranslateStyles('right', 24)).toBe('translate(24px, 0)')
	})

	it('returns off-screen closed transforms for each direction', () => {
		expect(getClosedTransform('bottom')).toContain('100%')
		expect(getClosedTransform('top')).toContain('-100%')
		expect(getClosedTransform('left')).toContain('-100%')
		expect(getClosedTransform('right')).toContain('100%')
	})

	it('builds parent transforms for nested drawers without targeting the page background', () => {
		expect(getNestedParentTransform('bottom')).toContain('translate(0, -16px)')
		expect(getNestedParentTransform('top')).toContain('translate(0, 16px)')
		expect(getNestedParentTransform('left')).toContain('translate(16px, 0)')
		expect(getNestedParentTransform('right')).toContain('translate(-16px, 0)')
	})
})
