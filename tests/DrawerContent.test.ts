import { mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import DrawerContent from '../src/components/DrawerContent.vue'
import { clearDrawerDismissableLayersForTest } from '../src/composables/useDrawerDismissableLayer'
import { clearEscapeLayersForTest } from '../src/composables/useDrawerEscapeLayer'

const gestureHandlers = vi.hoisted(() => ({
	handlePointerDown: vi.fn(),
	handlePointerMove: vi.fn(),
	handlePointerUp: vi.fn(),
	handlePointerCancel: vi.fn(),
	handleLostPointerCapture: vi.fn(),
}))

const rootContext = vi.hoisted(() => {
	const box = <T>(value: T) => ({ value })

	return {
		drawerId: 'bottom#test',
		open: box(true),
		openedAt: box<number | null>(Date.now()),
			direction: box<'bottom' | 'top' | 'left' | 'right'>('bottom'),
			dismissible: box(true),
			autoFocus: box(true),
			handleOnly: box(false),
			container: box<HTMLElement | string | null>(null),
			animation: box<'slide' | 'fade'>('slide'),
			closeAnimation: box<'slide' | 'fade'>('slide'),
			closeAnimationOverride: box<'slide' | 'fade' | null>(null),
		closeThreshold: box(0.25),
		scrollLockTimeout: box(500),
		snapToSequentialPoint: box(false),
		hasSnapPoints: box(false),
			shouldFadeOverlay: box(true),
			activeSnapPointIndex: box(0),
			fadeFromIndex: box<number | undefined>(undefined),
			defaultContentId: 'vuedrawer-test-content',
			defaultTitleId: 'vuedrawer-test-title',
			defaultDescriptionId: 'vuedrawer-test-description',
			contentId: box('vuedrawer-test-content'),
			titleId: box<string | undefined>(undefined),
			descriptionId: box<string | undefined>(undefined),
			contentElement: box<HTMLElement | null>(null),
			overlayElement: box<HTMLElement | null>(null),
		isDragging: box(false),
		gestureClosing: box(false),
			preventCloseAutoFocusOnce: box(false),
			requestOpenChange: vi.fn(),
			registerContentId: vi.fn(),
			unregisterContentId: vi.fn(),
			registerTitleId: vi.fn(),
			unregisterTitleId: vi.fn(),
			registerDescriptionId: vi.fn(),
			unregisterDescriptionId: vi.fn(),
			setSkipCloseAnimation: vi.fn(),
			setGestureClosing: vi.fn(),
			emitDrag: vi.fn(),
			emitRelease: vi.fn(),
			getContentTransition: vi.fn(() => 'transform 220ms ease'),
		getOverlayTransition: vi.fn(() => 'opacity 220ms ease'),
		getVisibleDrawerSize: vi.fn(() => 320),
		getSnapPointBaseSize: vi.fn(() => 640),
		getSnapPointsOffset: vi.fn(() => []),
		getRestingOffset: vi.fn(() => 0),
		getRestingOverlayOpacity: vi.fn(() => 1),
		animateToSnapPoint: vi.fn(),
		parentContext: null,
		onNestedDrag: vi.fn(),
		onNestedRelease: vi.fn(),
		setNestedChildOpen: vi.fn(),
		resetInteractiveState: vi.fn(),
		registerContentElement: vi.fn(),
		modal: box(true),
		skipCloseAnimation: box(false),
		shouldAnimateInitialOpen: box(true),
		handleAfterOpen: vi.fn(),
		handleAfterClose: vi.fn(),
		handleDismissAttempt: vi.fn(),
		handleContentError: vi.fn(),
	}
})

vi.mock('../src/utils/drawerContext', () => ({
	useDrawerRootContext: () => rootContext,
}))

vi.mock('../src/composables/useDrawerGesture', () => ({
	useDrawerGesture: () => gestureHandlers,
}))

describe('DrawerContent', () => {
	beforeEach(() => {
		for (const handler of Object.values(gestureHandlers)) {
			handler.mockReset()
		}
		rootContext.gestureClosing.value = false
		rootContext.open.value = true
		rootContext.animation.value = 'slide'
		rootContext.closeAnimation.value = 'slide'
		rootContext.closeAnimationOverride.value = null
		rootContext.skipCloseAnimation.value = false
		rootContext.shouldAnimateInitialOpen.value = true
		rootContext.titleId.value = 'vuedrawer-test-title'
	})

	afterEach(() => {
		clearDrawerDismissableLayersForTest()
		clearEscapeLayersForTest()
	})

	function mountDrawerContent() {
		return mount(DrawerContent, {
			global: {
				stubs: {
					Transition: false,
				},
			},
		})
	}

	it('passes the root initial animation flag to the transition appear prop', () => {
		rootContext.shouldAnimateInitialOpen.value = false
		const wrapper = mount(DrawerContent)

		expect(wrapper.get('transition-stub').attributes('appear')).toBe('false')

		wrapper.unmount()
	})

	it('releases the gesture using the last pointer event when pointerout ends the interaction', async () => {
		const wrapper = mountDrawerContent()
		const element = wrapper.get('[data-drawer-content]').element

		const moveEvent = new PointerEvent('pointermove', { clientX: 12, clientY: 40, bubbles: true })
		element.dispatchEvent(moveEvent)

		const outEvent = new PointerEvent('pointerout', { bubbles: true })
		element.dispatchEvent(outEvent)

		expect(gestureHandlers.handlePointerMove).toHaveBeenCalledWith(moveEvent)
		expect(gestureHandlers.handlePointerUp).toHaveBeenCalledWith(moveEvent)

		wrapper.unmount()
	})

	it('does not reuse a stale pointer event after pointercancel', async () => {
		const wrapper = mountDrawerContent()
		const element = wrapper.get('[data-drawer-content]').element

		const moveEvent = new PointerEvent('pointermove', { clientX: 12, clientY: 40, bubbles: true })
		element.dispatchEvent(moveEvent)

		const cancelEvent = new PointerEvent('pointercancel', { bubbles: true })
		element.dispatchEvent(cancelEvent)

		const outEvent = new PointerEvent('pointerout', { bubbles: true })
		element.dispatchEvent(outEvent)

		expect(gestureHandlers.handlePointerCancel).toHaveBeenCalledWith(cancelEvent)
		expect(gestureHandlers.handlePointerUp).not.toHaveBeenCalled()

		wrapper.unmount()
	})

	it('handles global Escape when the drawer is mounted already open and focus is outside', () => {
		const wrapper = mountDrawerContent()
		rootContext.handleDismissAttempt.mockReset()
		rootContext.requestOpenChange.mockReset()

		document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))

		expect(rootContext.handleDismissAttempt).toHaveBeenCalled()
		expect(rootContext.requestOpenChange).toHaveBeenCalledWith(false)

		wrapper.unmount()
	})

	it('marks content with the active fade animation mode', () => {
		rootContext.animation.value = 'fade'
		const wrapper = mountDrawerContent()

		expect(wrapper.get('[data-drawer-content]').attributes('data-animation')).toBe('fade')

		wrapper.unmount()
	})

	it('uses slide animation for normal closes by default', () => {
		rootContext.open.value = false
		rootContext.gestureClosing.value = true

		const wrapper = mountDrawerContent()

		expect(wrapper.get('[data-drawer-content]').attributes('data-animation')).toBe('slide')
		expect(wrapper.get('[data-drawer-content]').attributes('data-close-animation')).toBe('slide')

		wrapper.unmount()
	})

	it('uses configured fade animation for normal closes', () => {
		rootContext.open.value = false
		rootContext.gestureClosing.value = true
		rootContext.closeAnimation.value = 'fade'

		const wrapper = mountDrawerContent()

		expect(wrapper.get('[data-drawer-content]').attributes('data-animation')).toBe('fade')
		expect(wrapper.get('[data-drawer-content]').attributes('data-close-animation')).toBe('fade')

		wrapper.unmount()
	})
})
