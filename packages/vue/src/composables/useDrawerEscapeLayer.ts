import { onBeforeUnmount, onMounted } from 'vue'
import { isElementInsideDrawerBranch } from '../utils/drawerSelectors'

interface DrawerEscapeLayer {
	id: string
	label?: string
	priority: number
	enabled: () => boolean
	onEscape: (event: KeyboardEvent) => boolean | void
	order: number
}

interface UseDrawerEscapeLayerOptions {
	id: string
	label?: string
	priority?: number
	enabled: () => boolean
	onEscape: (event: KeyboardEvent) => boolean | void
}

export const ESCAPE_LAYER_PRIORITIES = {
	drawer: 50,
}

const layers: DrawerEscapeLayer[] = []
let nextOrder = 0
let isListening = false

function getTopmostEnabledLayer() {
	return layers
		.filter(layer => layer.enabled())
		.sort((a, b) => {
			if (a.priority !== b.priority) return b.priority - a.priority
			return b.order - a.order
		})[0]
}

function handleDocumentKeyDown(event: KeyboardEvent) {
	if (event.key !== 'Escape') return
	if (isElementInsideDrawerBranch(event.target)) return

	const layer = getTopmostEnabledLayer()
	if (!layer) return

	const handled = layer.onEscape(event)
	if (handled === false) return

	event.stopPropagation()
}

function ensureListener() {
	if (isListening || typeof document === 'undefined') return
	document.addEventListener('keydown', handleDocumentKeyDown, true)
	isListening = true
}

function removeListenerIfIdle() {
	if (!isListening || layers.length > 0 || typeof document === 'undefined') return
	document.removeEventListener('keydown', handleDocumentKeyDown, true)
	isListening = false
}

export function useDrawerEscapeLayer(options: UseDrawerEscapeLayerOptions) {
	const layer: DrawerEscapeLayer = {
		id: options.id,
		label: options.label,
		priority: options.priority ?? ESCAPE_LAYER_PRIORITIES.drawer,
		enabled: options.enabled,
		onEscape: options.onEscape,
		order: nextOrder,
	}

	nextOrder += 1

	onMounted(() => {
		layers.push(layer)
		ensureListener()
	})

	onBeforeUnmount(() => {
		const index = layers.indexOf(layer)
		if (index >= 0) {
			layers.splice(index, 1)
		}
		removeListenerIfIdle()
	})
}

export function clearEscapeLayersForTest() {
	layers.splice(0, layers.length)
	if (isListening && typeof document !== 'undefined') {
		document.removeEventListener('keydown', handleDocumentKeyDown, true)
	}
	isListening = false
}
