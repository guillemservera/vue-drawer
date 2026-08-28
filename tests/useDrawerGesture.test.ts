import { mount } from '@vue/test-utils'
import { defineComponent, nextTick, ref } from 'vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { getClosedTransform, getTranslateStyles } from '../src/utils/drawerConstants'
import { useDrawerGesture } from '../src/composables/useDrawerGesture'

const {
	clearTransitionCallbacks,
	flushTransitionCallbacks,
	setImmediateTransitionResolution,
	waitForDrawerTransitionMock,
} = vi.hoisted(() => {
	let resolveImmediately = true
	const callbacks: Array<() => void> = []

	return {
		waitForDrawerTransitionMock: vi.fn((_element: HTMLElement, _propertyName: 'transform' | 'opacity', callback: () => void) => {
			if (resolveImmediately) {
				callback()
			}
			else {
				callbacks.push(callback)
			}
			return () => undefined
		}),
		setImmediateTransitionResolution(value: boolean) {
			resolveImmediately = value
		},
		flushTransitionCallbacks() {
			const queuedCallbacks = callbacks.splice(0, callbacks.length)
			for (const callback of queuedCallbacks) {
				callback()
			}
		},
		clearTransitionCallbacks() {
			resolveImmediately = true
			callbacks.splice(0, callbacks.length)
		},
	}
})

vi.mock('../src/utils/drawerDom', async () => {
	const actual = await vi.importActual<typeof import('../src/utils/drawerDom')>('../src/utils/drawerDom')
	return {
		...actual,
		waitForDrawerTransition: waitForDrawerTransitionMock,
	}
})

function createPointerEvent(
	type: string,
	target: HTMLElement,
	pointerId: number,
	clientY: number,
	clientX = 0,
) {
	const event = new PointerEvent(type, {
		bubbles: true,
		cancelable: true,
		pointerId,
		pointerType: 'touch',
		clientX,
		clientY,
	})

	Object.defineProperty(event, 'target', {
		configurable: true,
		value: target,
	})

	return event
}

describe('useDrawerGesture', () => {
	beforeEach(() => {
		waitForDrawerTransitionMock.mockClear()
		clearTransitionCallbacks()
		document.body.style.pointerEvents = 'none'
	})

	it('keeps pointer events disabled during the post-gesture leave while clearing inline transitions', () => {
		setImmediateTransitionResolution(true)
		const Harness = defineComponent({
			setup(_, { expose }) {
				let capturedPointerId: number | null = null
				const content = document.createElement('div')
				const overlay = document.createElement('div')

				Object.assign(content, {
					setPointerCapture: vi.fn((pointerId: number) => {
						capturedPointerId = pointerId
					}),
					hasPointerCapture: vi.fn((pointerId: number) => capturedPointerId === pointerId),
					releasePointerCapture: vi.fn((pointerId: number) => {
						if (capturedPointerId === pointerId) {
							capturedPointerId = null
						}
					}),
				})

				const open = ref(true)
				const gestureClosing = ref(false)
				const isDragging = ref(false)
				const preventCloseAutoFocusOnce = ref(false)
				const skipCloseAnimation = ref(false)
				const requestOpenChange = vi.fn((value: boolean) => {
					open.value = value
				})

				const gesture = useDrawerGesture({
					open,
					openedAt: ref(Date.now() - 1000),
					direction: ref('bottom'),
					dismissible: ref(true),
					closeThreshold: ref(0.25),
					scrollLockTimeout: ref(500),
					snapToSequentialPoint: ref(false),
					hasSnapPoints: ref(false),
					activeSnapPointIndex: ref(0),
					fadeFromIndex: ref<number | undefined>(undefined),
					contentElement: ref(content),
					overlayElement: ref(overlay),
					isDragging,
					gestureClosing,
					preventCloseAutoFocusOnce,
					requestOpenChange,
					setSkipCloseAnimation(value: boolean) {
						skipCloseAnimation.value = value
					},
						setGestureClosing(value: boolean) {
							gestureClosing.value = value
							if (value) {
								isDragging.value = false
							}
						},
						emitDrag: vi.fn(),
						emitRelease: vi.fn(),
						getContentTransition: () => 'transform 420ms ease',
					getOverlayTransition: () => 'opacity 420ms ease',
					getVisibleDrawerSize: () => 320,
					getSnapPointBaseSize: () => 640,
					getSnapPointsOffset: () => [],
					getRestingOffset: () => 0,
					getRestingOverlayOpacity: () => 1,
					animateToSnapPoint: () => undefined,
					resetInteractiveState: () => undefined,
					onNestedDrag: () => undefined,
					onNestedRelease: () => undefined,
				})

				expose({
					content,
					overlay,
					gesture,
					gestureClosing,
					open,
					preventCloseAutoFocusOnce,
					requestOpenChange,
					setOpen(value: boolean) {
						open.value = value
					},
					skipCloseAnimation,
				})

				return () => null
			},
		})

		const wrapper = mount(Harness)
		const exposed = wrapper.vm.$.exposed as {
			content: HTMLElement
			overlay: HTMLElement
			gesture: ReturnType<typeof useDrawerGesture>
			gestureClosing: { value: boolean }
			open: { value: boolean }
			preventCloseAutoFocusOnce: { value: boolean }
			requestOpenChange: ReturnType<typeof vi.fn>
			setOpen: (value: boolean) => void
			skipCloseAnimation: { value: boolean }
		}

		exposed.gesture.handlePointerDown(createPointerEvent('pointerdown', exposed.content, 1, 0))
		exposed.gesture.handlePointerMove(createPointerEvent('pointermove', exposed.content, 1, 140))
		exposed.gesture.handlePointerUp(createPointerEvent('pointerup', exposed.content, 1, 140))

		expect(exposed.requestOpenChange).toHaveBeenCalledWith(false)
		expect(exposed.skipCloseAnimation.value).toBe(true)
		expect(exposed.gestureClosing.value).toBe(false)
		expect(exposed.preventCloseAutoFocusOnce.value).toBe(true)
		expect(document.body.style.pointerEvents).toBe('auto')
		expect(exposed.content.style.transition).toBe('')
		expect(exposed.overlay.style.transition).toBe('')
		expect(exposed.content.style.transform).toBe(getClosedTransform('bottom'))
		expect(exposed.overlay.style.opacity).toBe('0')
		expect(exposed.content.style.pointerEvents).toBe('none')
		expect(exposed.overlay.style.pointerEvents).toBe('none')
		expect(waitForDrawerTransitionMock).toHaveBeenCalled()

		wrapper.unmount()
	})

	it('ignores stale gesture-close cleanup when the drawer reopens before the old transition settles', async () => {
		setImmediateTransitionResolution(false)
		const Harness = defineComponent({
			setup(_, { expose }) {
				let capturedPointerId: number | null = null
				const content = document.createElement('div')
				const overlay = document.createElement('div')

				Object.assign(content, {
					setPointerCapture: vi.fn((pointerId: number) => {
						capturedPointerId = pointerId
					}),
					hasPointerCapture: vi.fn((pointerId: number) => capturedPointerId === pointerId),
					releasePointerCapture: vi.fn((pointerId: number) => {
						if (capturedPointerId === pointerId) {
							capturedPointerId = null
						}
					}),
				})

				const open = ref(true)
				const gestureClosing = ref(false)
				const isDragging = ref(false)
				const preventCloseAutoFocusOnce = ref(false)
				const skipCloseAnimation = ref(false)

				const gesture = useDrawerGesture({
					open,
					openedAt: ref(Date.now() - 1000),
					direction: ref('bottom'),
					dismissible: ref(true),
					closeThreshold: ref(0.25),
					scrollLockTimeout: ref(500),
					snapToSequentialPoint: ref(false),
					hasSnapPoints: ref(false),
					activeSnapPointIndex: ref(0),
					fadeFromIndex: ref<number | undefined>(undefined),
					contentElement: ref(content),
					overlayElement: ref(overlay),
					isDragging,
					gestureClosing,
					preventCloseAutoFocusOnce,
					requestOpenChange(value: boolean) {
						open.value = value
					},
					setSkipCloseAnimation(value: boolean) {
						skipCloseAnimation.value = value
					},
						setGestureClosing(value: boolean) {
							gestureClosing.value = value
							if (value) {
								isDragging.value = false
							}
						},
						emitDrag: vi.fn(),
						emitRelease: vi.fn(),
						getContentTransition: () => 'transform 420ms ease',
					getOverlayTransition: () => 'opacity 420ms ease',
					getVisibleDrawerSize: () => 320,
					getSnapPointBaseSize: () => 640,
					getSnapPointsOffset: () => [],
					getRestingOffset: () => 0,
					getRestingOverlayOpacity: () => 1,
					animateToSnapPoint: () => undefined,
					resetInteractiveState: () => undefined,
					onNestedDrag: () => undefined,
					onNestedRelease: () => undefined,
				})

				expose({
					content,
					overlay,
					gesture,
					gestureClosing,
					setOpen(value: boolean) {
						open.value = value
					},
					skipCloseAnimation,
				})

				return () => null
			},
		})

		const wrapper = mount(Harness)
		const exposed = wrapper.vm.$.exposed as {
			content: HTMLElement
			overlay: HTMLElement
			gesture: ReturnType<typeof useDrawerGesture>
			gestureClosing: { value: boolean }
			setOpen: (value: boolean) => void
			skipCloseAnimation: { value: boolean }
		}

		exposed.gesture.handlePointerDown(createPointerEvent('pointerdown', exposed.content, 1, 0))
		exposed.gesture.handlePointerMove(createPointerEvent('pointermove', exposed.content, 1, 140))
		exposed.gesture.handlePointerUp(createPointerEvent('pointerup', exposed.content, 1, 140))

		expect(exposed.content.style.pointerEvents).toBe('none')
		await nextTick()
		exposed.setOpen(true)
		await nextTick()

		expect(exposed.gestureClosing.value).toBe(false)
		expect(exposed.skipCloseAnimation.value).toBe(false)
		expect(exposed.content.style.pointerEvents).toBe('')
		expect(exposed.overlay.style.pointerEvents).toBe('')

		flushTransitionCallbacks()

		expect(exposed.skipCloseAnimation.value).toBe(false)
		expect(exposed.content.style.pointerEvents).toBe('')
		expect(exposed.overlay.style.pointerEvents).toBe('')

		wrapper.unmount()
	})

	it('keeps an active close drag alive through viewport scroll and finalizes from touchend', async () => {
		setImmediateTransitionResolution(false)
		const Harness = defineComponent({
			setup(_, { expose }) {
				let capturedPointerId: number | null = null
				const content = document.createElement('div')
				const overlay = document.createElement('div')

				Object.assign(content, {
					setPointerCapture: vi.fn((pointerId: number) => {
						capturedPointerId = pointerId
					}),
					hasPointerCapture: vi.fn((pointerId: number) => capturedPointerId === pointerId),
					releasePointerCapture: vi.fn((pointerId: number) => {
						if (capturedPointerId === pointerId) {
							capturedPointerId = null
						}
					}),
				})

				const open = ref(true)
				const gestureClosing = ref(false)
				const isDragging = ref(false)
				const preventCloseAutoFocusOnce = ref(false)
				const requestOpenChange = vi.fn((value: boolean) => {
					open.value = value
				})
				const resetInteractiveState = vi.fn()

				const gesture = useDrawerGesture({
					open,
					openedAt: ref(Date.now() - 1000),
					direction: ref('bottom'),
					dismissible: ref(true),
					closeThreshold: ref(0.25),
					scrollLockTimeout: ref(500),
					snapToSequentialPoint: ref(false),
					hasSnapPoints: ref(false),
					activeSnapPointIndex: ref(0),
					fadeFromIndex: ref<number | undefined>(undefined),
					contentElement: ref(content),
					overlayElement: ref(overlay),
					isDragging,
					gestureClosing,
					preventCloseAutoFocusOnce,
					requestOpenChange,
					setSkipCloseAnimation: () => undefined,
						setGestureClosing(value: boolean) {
							gestureClosing.value = value
							if (value) {
								isDragging.value = false
							}
						},
						emitDrag: vi.fn(),
						emitRelease: vi.fn(),
						getContentTransition: () => 'transform 420ms ease',
					getOverlayTransition: () => 'opacity 420ms ease',
					getVisibleDrawerSize: () => 320,
					getSnapPointBaseSize: () => 640,
					getSnapPointsOffset: () => [],
					getRestingOffset: () => 0,
					getRestingOverlayOpacity: () => 1,
					animateToSnapPoint: () => undefined,
					resetInteractiveState,
					onNestedDrag: () => undefined,
					onNestedRelease: () => undefined,
				})

				expose({
					content,
					gesture,
					isDragging,
					overlay,
					requestOpenChange,
					resetInteractiveState,
				})

				return () => null
			},
		})

		const wrapper = mount(Harness)
		const exposed = wrapper.vm.$.exposed as {
			content: HTMLElement
			gesture: ReturnType<typeof useDrawerGesture>
			isDragging: { value: boolean }
			overlay: HTMLElement
			requestOpenChange: ReturnType<typeof vi.fn>
			resetInteractiveState: ReturnType<typeof vi.fn>
		}

		exposed.gesture.handlePointerDown(createPointerEvent('pointerdown', exposed.content, 1, 0))
		exposed.gesture.handlePointerMove(createPointerEvent('pointermove', exposed.content, 1, 80))

		expect(exposed.isDragging.value).toBe(true)
		expect(exposed.content.style.transform).toBe(getTranslateStyles('bottom', 80))

		window.dispatchEvent(new Event('scroll'))

		expect(exposed.requestOpenChange).not.toHaveBeenCalled()
		expect(exposed.isDragging.value).toBe(true)
		expect(exposed.content.style.transition).toBe('none')
		expect(exposed.content.style.transform).toBe(getTranslateStyles('bottom', 80))

		window.dispatchEvent(new Event('touchend'))
		await new Promise(resolve => setTimeout(resolve, 0))

		expect(exposed.requestOpenChange).toHaveBeenCalledWith(false)
		expect(exposed.isDragging.value).toBe(false)
		expect(exposed.content.style.transition).toBe('transform 420ms ease')
		expect(exposed.content.style.transform).toBe(getClosedTransform('bottom'))
		expect(exposed.overlay.style.transition).toBe('opacity 420ms ease')
		expect(exposed.overlay.style.opacity).toBe('0')
		expect(exposed.content.style.pointerEvents).toBe('none')
		expect(exposed.overlay.style.pointerEvents).toBe('none')

		flushTransitionCallbacks()

		expect(exposed.content.style.transition).toBe('')
		expect(exposed.content.style.transform).toBe(getClosedTransform('bottom'))
		expect(exposed.resetInteractiveState).not.toHaveBeenCalled()

		wrapper.unmount()
	})

	it('lets scrollable drawer content scroll before closing from the top edge', () => {
		const Harness = defineComponent({
			setup(_, { expose }) {
				const content = document.createElement('div')
				const overlay = document.createElement('div')
				const scrollArea = document.createElement('div')
				const item = document.createElement('div')

				Object.defineProperties(scrollArea, {
					clientHeight: {
						configurable: true,
						value: 240,
					},
					scrollHeight: {
						configurable: true,
						value: 720,
					},
					scrollTop: {
						configurable: true,
						writable: true,
						value: 120,
					},
				})

				Object.assign(item, {
					setPointerCapture: vi.fn(),
					hasPointerCapture: vi.fn(() => false),
					releasePointerCapture: vi.fn(),
				})

				scrollArea.appendChild(item)
				content.appendChild(scrollArea)

				const open = ref(true)
				const gestureClosing = ref(false)
				const isDragging = ref(false)
				const preventCloseAutoFocusOnce = ref(false)
				const requestOpenChange = vi.fn((value: boolean) => {
					open.value = value
				})

				const gesture = useDrawerGesture({
					open,
					openedAt: ref(Date.now() - 1000),
					direction: ref('bottom'),
					dismissible: ref(true),
					closeThreshold: ref(0.25),
					scrollLockTimeout: ref(0),
					snapToSequentialPoint: ref(false),
					hasSnapPoints: ref(false),
					activeSnapPointIndex: ref(0),
					fadeFromIndex: ref<number | undefined>(undefined),
					contentElement: ref(content),
					overlayElement: ref(overlay),
					isDragging,
					gestureClosing,
					preventCloseAutoFocusOnce,
					requestOpenChange,
					setSkipCloseAnimation: () => undefined,
					setGestureClosing(value: boolean) {
						gestureClosing.value = value
						if (value) {
							isDragging.value = false
						}
					},
					emitDrag: vi.fn(),
					emitRelease: vi.fn(),
					getContentTransition: () => 'transform 420ms ease',
					getOverlayTransition: () => 'opacity 420ms ease',
					getVisibleDrawerSize: () => 320,
					getSnapPointBaseSize: () => 640,
					getSnapPointsOffset: () => [],
					getRestingOffset: () => 0,
					getRestingOverlayOpacity: () => 1,
					animateToSnapPoint: () => undefined,
					resetInteractiveState: () => undefined,
					onNestedDrag: () => undefined,
					onNestedRelease: () => undefined,
				})

				expose({
					gesture,
					isDragging,
					item,
					requestOpenChange,
					scrollArea,
				})

				return () => null
			},
		})

		const wrapper = mount(Harness)
		const exposed = wrapper.vm.$.exposed as {
			gesture: ReturnType<typeof useDrawerGesture>
			isDragging: { value: boolean }
			item: HTMLElement
			requestOpenChange: ReturnType<typeof vi.fn>
			scrollArea: HTMLElement
		}

		const blockedMove = createPointerEvent('pointermove', exposed.item, 1, 90)
		exposed.gesture.handlePointerDown(createPointerEvent('pointerdown', exposed.item, 1, 0))
		exposed.gesture.handlePointerMove(blockedMove)

		expect(exposed.requestOpenChange).not.toHaveBeenCalled()
		expect(exposed.isDragging.value).toBe(false)
		expect(blockedMove.defaultPrevented).toBe(false)

		window.dispatchEvent(new Event('scroll'))

		expect(exposed.requestOpenChange).not.toHaveBeenCalled()
		expect(exposed.isDragging.value).toBe(false)

		exposed.scrollArea.scrollTop = 0

		const closeMove = createPointerEvent('pointermove', exposed.item, 1, 140)
		exposed.gesture.handlePointerMove(closeMove)
		exposed.gesture.handlePointerUp(createPointerEvent('pointerup', exposed.item, 1, 140))

		expect(exposed.requestOpenChange).toHaveBeenCalledWith(false)
		expect(closeMove.defaultPrevented).toBe(true)

		wrapper.unmount()
	})

	it('does not capture pointer gestures that start inside no-drag zones', () => {
		const Harness = defineComponent({
			setup(_, { expose }) {
				const content = document.createElement('div')
				const overlay = document.createElement('div')
				const noDrag = document.createElement('label')
				const input = document.createElement('input')
				noDrag.setAttribute('data-drawer-no-drag', '')
				noDrag.appendChild(input)
				content.appendChild(noDrag)

				Object.assign(input, {
					setPointerCapture: vi.fn(),
					hasPointerCapture: vi.fn(() => false),
					releasePointerCapture: vi.fn(),
				})

				const open = ref(true)
				const gestureClosing = ref(false)
				const isDragging = ref(false)
				const preventCloseAutoFocusOnce = ref(false)
				const requestOpenChange = vi.fn((value: boolean) => {
					open.value = value
				})

				const gesture = useDrawerGesture({
					open,
					openedAt: ref(Date.now() - 1000),
					direction: ref('bottom'),
					dismissible: ref(true),
					closeThreshold: ref(0.25),
					scrollLockTimeout: ref(500),
					snapToSequentialPoint: ref(false),
					hasSnapPoints: ref(false),
					activeSnapPointIndex: ref(0),
					fadeFromIndex: ref<number | undefined>(undefined),
					contentElement: ref(content),
					overlayElement: ref(overlay),
					isDragging,
					gestureClosing,
					preventCloseAutoFocusOnce,
					requestOpenChange,
					setSkipCloseAnimation: () => undefined,
						setGestureClosing(value: boolean) {
							gestureClosing.value = value
						},
						emitDrag: vi.fn(),
						emitRelease: vi.fn(),
						getContentTransition: () => 'transform 420ms ease',
					getOverlayTransition: () => 'opacity 420ms ease',
					getVisibleDrawerSize: () => 320,
					getSnapPointBaseSize: () => 640,
					getSnapPointsOffset: () => [],
					getRestingOffset: () => 0,
					getRestingOverlayOpacity: () => 1,
					animateToSnapPoint: () => undefined,
					resetInteractiveState: () => undefined,
					onNestedDrag: () => undefined,
					onNestedRelease: () => undefined,
				})

				expose({
					gesture,
					input,
					isDragging,
					requestOpenChange,
				})

				return () => null
			},
		})

		const wrapper = mount(Harness)
		const exposed = wrapper.vm.$.exposed as {
			gesture: ReturnType<typeof useDrawerGesture>
			input: HTMLInputElement & { setPointerCapture: ReturnType<typeof vi.fn> }
			isDragging: { value: boolean }
			requestOpenChange: ReturnType<typeof vi.fn>
		}

		exposed.gesture.handlePointerDown(createPointerEvent('pointerdown', exposed.input, 1, 0))
		exposed.gesture.handlePointerMove(createPointerEvent('pointermove', exposed.input, 1, 140))
		exposed.gesture.handlePointerUp(createPointerEvent('pointerup', exposed.input, 1, 140))

		expect(exposed.input.setPointerCapture).not.toHaveBeenCalled()
		expect(exposed.isDragging.value).toBe(false)
		expect(exposed.requestOpenChange).not.toHaveBeenCalled()

		wrapper.unmount()
	})

	// Regression guard: vertical bottom sheets must be draggable-to-dismiss even
	// when the gesture starts on an interactive control (button/link/list row),
	// as long as the scroll body is at the top. Only explicit [data-*-no-drag]
	// zones (and native SELECT) opt out — a blanket interactive block previously
	// killed drag-to-dismiss on drawers with a scrollable body.
	it('captures vertical drag-to-dismiss started on an interactive control at scroll top', () => {
		const Harness = defineComponent({
			setup(_, { expose }) {
				const content = document.createElement('div')
				const overlay = document.createElement('div')
				const button = document.createElement('button')
				const label = document.createElement('span')
				button.type = 'button'
				label.textContent = 'Open menu'
				button.appendChild(label)
				content.appendChild(button)

				Object.assign(label, {
					setPointerCapture: vi.fn(),
					hasPointerCapture: vi.fn(() => false),
					releasePointerCapture: vi.fn(),
				})

				const open = ref(true)
				const gestureClosing = ref(false)
				const isDragging = ref(false)
				const preventCloseAutoFocusOnce = ref(false)
				const requestOpenChange = vi.fn((value: boolean) => {
					open.value = value
				})

				const gesture = useDrawerGesture({
					open,
					openedAt: ref(Date.now() - 1000),
					direction: ref('bottom'),
					dismissible: ref(true),
					closeThreshold: ref(0.25),
					scrollLockTimeout: ref(500),
					snapToSequentialPoint: ref(false),
					hasSnapPoints: ref(false),
					activeSnapPointIndex: ref(0),
					fadeFromIndex: ref<number | undefined>(undefined),
					contentElement: ref(content),
					overlayElement: ref(overlay),
					isDragging,
					gestureClosing,
					preventCloseAutoFocusOnce,
					requestOpenChange,
					setSkipCloseAnimation: () => undefined,
					setGestureClosing(value: boolean) {
						gestureClosing.value = value
					},
					emitDrag: vi.fn(),
					emitRelease: vi.fn(),
					getContentTransition: () => 'transform 420ms ease',
					getOverlayTransition: () => 'opacity 420ms ease',
					getVisibleDrawerSize: () => 320,
					getSnapPointBaseSize: () => 640,
					getSnapPointsOffset: () => [],
					getRestingOffset: () => 0,
					getRestingOverlayOpacity: () => 1,
					animateToSnapPoint: () => undefined,
					resetInteractiveState: () => undefined,
					onNestedDrag: () => undefined,
					onNestedRelease: () => undefined,
				})

				expose({
					gesture,
					isDragging,
					label,
					requestOpenChange,
				})

				return () => null
			},
		})

		const wrapper = mount(Harness)
		const exposed = wrapper.vm.$.exposed as {
			gesture: ReturnType<typeof useDrawerGesture>
			isDragging: { value: boolean }
			label: HTMLSpanElement & { setPointerCapture: ReturnType<typeof vi.fn> }
			requestOpenChange: ReturnType<typeof vi.fn>
		}

		exposed.gesture.handlePointerDown(createPointerEvent('pointerdown', exposed.label, 1, 0))
		exposed.gesture.handlePointerMove(createPointerEvent('pointermove', exposed.label, 1, 140))

		// The drag engages from the interactive control (button) — the pre-fix
		// interactive block would have left isDragging false here.
		expect(exposed.isDragging.value).toBe(true)

		exposed.gesture.handlePointerUp(createPointerEvent('pointerup', exposed.label, 1, 140))

		wrapper.unmount()
	})

	// Regression guard: horizontal drawers (nav sidebars) must remain swipeable
	// even when the gesture starts on an interactive element, because their whole
	// surface is nav buttons/links. Only vertical sheets treat interactive
	// controls as no-drag zones (see the test above).
	it('captures horizontal swipe gestures that start on nav buttons', () => {
		const Harness = defineComponent({
			setup(_, { expose }) {
				const content = document.createElement('div')
				const overlay = document.createElement('div')
				const button = document.createElement('button')
				button.type = 'button'
				button.textContent = 'Backtest'
				content.appendChild(button)

				Object.assign(button, {
					setPointerCapture: vi.fn(),
					hasPointerCapture: vi.fn(() => false),
					releasePointerCapture: vi.fn(),
				})

				const open = ref(true)
				const gestureClosing = ref(false)
				const isDragging = ref(false)
				const preventCloseAutoFocusOnce = ref(false)
				const requestOpenChange = vi.fn((value: boolean) => {
					open.value = value
				})

				const gesture = useDrawerGesture({
					open,
					openedAt: ref(Date.now() - 1000),
					direction: ref('left'),
					dismissible: ref(true),
					closeThreshold: ref(0.25),
					scrollLockTimeout: ref(500),
					snapToSequentialPoint: ref(false),
					hasSnapPoints: ref(false),
					activeSnapPointIndex: ref(0),
					fadeFromIndex: ref<number | undefined>(undefined),
					contentElement: ref(content),
					overlayElement: ref(overlay),
					isDragging,
					gestureClosing,
					preventCloseAutoFocusOnce,
					requestOpenChange,
					setSkipCloseAnimation: () => undefined,
					setGestureClosing(value: boolean) {
						gestureClosing.value = value
					},
					emitDrag: vi.fn(),
					emitRelease: vi.fn(),
					getContentTransition: () => 'transform 420ms ease',
					getOverlayTransition: () => 'opacity 420ms ease',
					getVisibleDrawerSize: () => 320,
					getSnapPointBaseSize: () => 640,
					getSnapPointsOffset: () => [],
					getRestingOffset: () => 0,
					getRestingOverlayOpacity: () => 1,
					animateToSnapPoint: () => undefined,
					resetInteractiveState: () => undefined,
					onNestedDrag: () => undefined,
					onNestedRelease: () => undefined,
				})

				expose({ gesture, isDragging, button, requestOpenChange })

				return () => null
			},
		})

		const wrapper = mount(Harness)
		const exposed = wrapper.vm.$.exposed as {
			gesture: ReturnType<typeof useDrawerGesture>
			isDragging: { value: boolean }
			button: HTMLButtonElement
			requestOpenChange: ReturnType<typeof vi.fn>
		}

		// Swipe left across the nav button: clientX 200 -> 40 closes a left drawer.
		exposed.gesture.handlePointerDown(createPointerEvent('pointerdown', exposed.button, 1, 0, 200))
		exposed.gesture.handlePointerMove(createPointerEvent('pointermove', exposed.button, 1, 0, 40))

		expect(exposed.isDragging.value).toBe(true)

		wrapper.unmount()
	})
})
