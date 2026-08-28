import { onBeforeUnmount, onMounted, watch } from 'vue'
import type { Ref } from 'vue'
import type { DrawerDirection } from '../utils/drawerTypes'

interface DrawerInputRepositionSnapshot {
	bottom: string
	height: string
	maxHeight: string
}

interface UseDrawerInputRepositionOptions {
	open: Ref<boolean>
	modal: Ref<boolean>
	nested: Ref<boolean>
	direction: Ref<DrawerDirection>
	repositionInputs: Ref<boolean>
	fixed: Ref<boolean>
	contentElement: Ref<HTMLElement | null>
}

const MIN_KEYBOARD_OFFSET = 60
const MIN_DRAWER_HEIGHT = 160
const TOP_VIEWPORT_GUTTER = 24

function isEditableElement(element: Element | null): element is HTMLElement {
	if (!(element instanceof HTMLElement)) return false
	if (element.isContentEditable) return true
	return ['INPUT', 'TEXTAREA', 'SELECT'].includes(element.tagName)
}

export function useDrawerInputReposition(options: UseDrawerInputRepositionOptions) {
	const {
		open,
		modal,
		nested,
		direction,
		repositionInputs,
		fixed,
		contentElement,
	} = options

	let previousStyles: DrawerInputRepositionSnapshot | null = null
	let initialDrawerHeight = 0
	let frameId: number | null = null
	let isFramePending = false

	function canUseVisualViewport() {
		return typeof window !== 'undefined' && Boolean(window.visualViewport)
	}

	function shouldWatchKeyboard() {
		// Nested drawers watch too: their content is portaled outside the parent
		// content, and `hasFocusedInput` already scopes the layout to whichever
		// drawer actually contains the focused control.
		return open.value && modal.value && repositionInputs.value && direction.value === 'bottom'
	}

	function saveStyles(content: HTMLElement) {
		if (previousStyles) return

		previousStyles = {
			bottom: content.style.bottom,
			height: content.style.height,
			maxHeight: content.style.maxHeight,
		}
		initialDrawerHeight = content.getBoundingClientRect().height || content.offsetHeight || 0
	}

	function restoreStyles() {
		const content = contentElement.value
		if (!content || !previousStyles) return

		content.style.bottom = previousStyles.bottom
		content.style.height = previousStyles.height
		content.style.maxHeight = previousStyles.maxHeight
		previousStyles = null
		initialDrawerHeight = 0
	}

	function getKeyboardOffset() {
		const viewport = window.visualViewport
		if (!viewport) return 0

		return Math.max(window.innerHeight - viewport.height - viewport.offsetTop, 0)
	}

	function applyKeyboardLayout() {
		if (!canUseVisualViewport() || !shouldWatchKeyboard()) {
			restoreStyles()
			return
		}

		const content = contentElement.value
		if (!content) return

		const focusedElement = document.activeElement
		const hasFocusedInput = isEditableElement(focusedElement) && content.contains(focusedElement)
		const keyboardOffset = getKeyboardOffset()

		if (!hasFocusedInput || keyboardOffset < MIN_KEYBOARD_OFFSET) {
			restoreStyles()
			return
		}

		saveStyles(content)

		const viewport = window.visualViewport!
		const contentRect = content.getBoundingClientRect()
		const focusedRect = focusedElement.getBoundingClientRect()
		const viewportBottom = viewport.offsetTop + viewport.height
		const inputIsCovered = focusedRect.bottom > viewportBottom - 16
		const drawerIsTooTall = contentRect.height > viewport.height

		// Keep the normal layout while the focused control is already visible.
		// Safari often emits small visualViewport changes while opening toolbars;
		// applying layout for those creates a visible jump before the keyboard is real.
		if (!inputIsCovered && !drawerIsTooTall) {
			return
		}

		// Lift the whole drawer above the keyboard at its natural height; only
		// shrink it when it doesn't fit in the visual viewport. Clamping against
		// the drawer's pre-lift top would collapse short bottom sheets instead
		// of raising them (footer buttons ended up covering the focused input).
		const baseHeight = initialDrawerHeight || contentRect.height
		const availableHeight = Math.max(viewport.height - TOP_VIEWPORT_GUTTER, MIN_DRAWER_HEIGHT)
		const fixedHeight = Math.max(baseHeight - keyboardOffset, MIN_DRAWER_HEIGHT)
		const nextHeight = fixed.value ? fixedHeight : Math.max(Math.min(baseHeight, availableHeight), MIN_DRAWER_HEIGHT)

		content.style.bottom = `${keyboardOffset}px`
		content.style.height = `${Math.round(nextHeight)}px`
		content.style.maxHeight = `${Math.round(nextHeight)}px`
	}

	function scheduleKeyboardLayout() {
		if (!canUseVisualViewport()) return
		if (isFramePending) return

		isFramePending = true
		frameId = window.requestAnimationFrame(() => {
			isFramePending = false
			frameId = null
			applyKeyboardLayout()
		})
	}

	function handleFocusOut() {
		if (typeof window === 'undefined') return
		window.setTimeout(scheduleKeyboardLayout, 0)
	}

	function addListeners() {
		if (typeof window === 'undefined' || typeof document === 'undefined') return

		window.visualViewport?.addEventListener('resize', scheduleKeyboardLayout)
		window.visualViewport?.addEventListener('scroll', scheduleKeyboardLayout)
		window.addEventListener('resize', scheduleKeyboardLayout)
		document.addEventListener('focusin', scheduleKeyboardLayout)
		document.addEventListener('focusout', handleFocusOut)
	}

	function removeListeners() {
		if (typeof window === 'undefined' || typeof document === 'undefined') return

		window.visualViewport?.removeEventListener('resize', scheduleKeyboardLayout)
		window.visualViewport?.removeEventListener('scroll', scheduleKeyboardLayout)
		window.removeEventListener('resize', scheduleKeyboardLayout)
		document.removeEventListener('focusin', scheduleKeyboardLayout)
		document.removeEventListener('focusout', handleFocusOut)
	}

	onMounted(() => {
		addListeners()
		scheduleKeyboardLayout()
	})

	watch(
		() => [open.value, modal.value, nested.value, direction.value, repositionInputs.value, fixed.value] as const,
		() => scheduleKeyboardLayout(),
		{ immediate: true },
	)

	watch(contentElement, () => scheduleKeyboardLayout())

	onBeforeUnmount(() => {
		if (frameId !== null && typeof window !== 'undefined') {
			window.cancelAnimationFrame(frameId)
		}
		isFramePending = false
		removeListeners()
		restoreStyles()
	})
}
