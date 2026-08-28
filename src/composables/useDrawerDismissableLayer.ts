import { onBeforeUnmount, onMounted } from 'vue'
import type { Ref } from 'vue'
import type {
	DrawerFocusOutsideEvent,
	DrawerPointerDownOutsideEvent,
} from '../utils/drawerTypes'
import { suppressNextClickAfterPointerDismiss } from '../utils/drawerPointer'
import { isElementInsideDrawerBranch } from '../utils/drawerSelectors'

interface DrawerLayer {
	id: string
	order: number
	element: Ref<HTMLElement | null>
	enabled: () => boolean
	modal: () => boolean
	onPointerDownOutside: (event: DrawerPointerDownOutsideEvent) => void
	onFocusOutside: (event: DrawerFocusOutsideEvent) => void
}

interface UseDrawerDismissableLayerOptions {
	id: string
	element: Ref<HTMLElement | null>
	enabled: () => boolean
	modal: () => boolean
	onPointerDownOutside: (event: DrawerPointerDownOutsideEvent) => void
	onFocusOutside: (event: DrawerFocusOutsideEvent) => void
}

const layers: DrawerLayer[] = []
let nextOrder = 0
let isListening = false

function getTopmostEnabledLayer() {
	return layers
		.filter(layer => layer.enabled())
		.sort((a, b) => b.order - a.order)[0]
}

function isEventInsideLayer(event: Event, layer: DrawerLayer) {
	const element = layer.element.value
	const target = event.target
	return Boolean(element && target instanceof Node && element.contains(target))
}

function isOverlayTarget(event: Event) {
	const target = event.target
	return target instanceof Element && Boolean(target.closest('[data-drawer-overlay]'))
}

function handleDocumentPointerDown(event: PointerEvent) {
	const layer = getTopmostEnabledLayer()
	if (!layer || isEventInsideLayer(event, layer)) return
	if (isOverlayTarget(event)) return
	if (isElementInsideDrawerBranch(event.target)) return

	const outsideEvent = new CustomEvent<{ originalEvent: PointerEvent }>('drawer.pointerDownOutside', {
		cancelable: true,
		detail: { originalEvent: event },
	})

	layer.onPointerDownOutside(outsideEvent)

	if (layer.modal()) {
		event.preventDefault()
		if (!outsideEvent.defaultPrevented) {
			suppressNextClickAfterPointerDismiss()
		}
	}
}

function handleDocumentFocusIn(event: FocusEvent) {
	const layer = getTopmostEnabledLayer()
	if (!layer || isEventInsideLayer(event, layer)) return
	if (isElementInsideDrawerBranch(event.target)) return

	const outsideEvent = new CustomEvent<{ originalEvent: FocusEvent }>('drawer.focusOutside', {
		cancelable: true,
		detail: { originalEvent: event },
	})

	layer.onFocusOutside(outsideEvent)
}

function ensureListeners() {
	if (isListening || typeof document === 'undefined') return
	document.addEventListener('pointerdown', handleDocumentPointerDown, true)
	document.addEventListener('focusin', handleDocumentFocusIn, true)
	isListening = true
}

function removeListenersIfIdle() {
	if (!isListening || layers.length > 0 || typeof document === 'undefined') return
	document.removeEventListener('pointerdown', handleDocumentPointerDown, true)
	document.removeEventListener('focusin', handleDocumentFocusIn, true)
	isListening = false
}

export function useDrawerDismissableLayer(options: UseDrawerDismissableLayerOptions) {
	const layer: DrawerLayer = {
		id: options.id,
		order: nextOrder,
		element: options.element,
		enabled: options.enabled,
		modal: options.modal,
		onPointerDownOutside: options.onPointerDownOutside,
		onFocusOutside: options.onFocusOutside,
	}

	nextOrder += 1

	onMounted(() => {
		layers.push(layer)
		ensureListeners()
	})

	onBeforeUnmount(() => {
		const index = layers.indexOf(layer)
		if (index >= 0) {
			layers.splice(index, 1)
		}

		removeListenersIfIdle()
	})
}

export function clearDrawerDismissableLayersForTest() {
	layers.splice(0, layers.length)
	if (isListening && typeof document !== 'undefined') {
		document.removeEventListener('pointerdown', handleDocumentPointerDown, true)
		document.removeEventListener('focusin', handleDocumentFocusIn, true)
	}
	isListening = false
}
