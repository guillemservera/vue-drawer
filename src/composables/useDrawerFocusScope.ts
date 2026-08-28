import { nextTick, onBeforeUnmount, watch } from 'vue'
import type { Ref } from 'vue'
import { focusWithDrawerMarker } from '../utils/drawerDom'
import { isElementInsideDrawerBranch } from '../utils/drawerSelectors'

interface UseDrawerFocusScopeOptions {
	contentElement: Ref<HTMLElement | null>
	enabled: Ref<boolean>
	autoFocus: Ref<boolean>
	shouldRestoreFocus: Ref<boolean>
	onOpenAutoFocus: (event: Event) => void
	onCloseAutoFocus: (event: Event) => void
}

const FOCUSABLE_SELECTOR = [
	'a[href]',
	'button:not([disabled])',
	'input:not([disabled])',
	'select:not([disabled])',
	'textarea:not([disabled])',
	'[tabindex]:not([tabindex="-1"])',
	'[contenteditable]',
].join(', ')

export function useDrawerFocusScope(options: UseDrawerFocusScopeOptions) {
	const {
		contentElement,
		enabled,
		autoFocus,
		shouldRestoreFocus,
		onOpenAutoFocus,
		onCloseAutoFocus,
	} = options
	let previouslyFocusedElement: HTMLElement | null = null
	let lastFocusedElement: HTMLElement | null = null
	let mutationObserver: MutationObserver | null = null
	let isRestoringFocus = false
	let pendingFocusRestore = false

	function rememberPreviousFocus() {
		if (typeof document === 'undefined') return
		const activeElement = document.activeElement
		previouslyFocusedElement = activeElement instanceof HTMLElement ? activeElement : null
	}

	function focusElement(element: HTMLElement | null, suppressFocusRing = false) {
		if (!element) return
		if (document.activeElement === element) {
			if (suppressFocusRing) focusWithDrawerMarker(element)
			return
		}

		isRestoringFocus = true
		if (suppressFocusRing) focusWithDrawerMarker(element)
		else element.focus({ preventScroll: true })
		queueMicrotask(() => {
			isRestoringFocus = false
		})
	}

	function getFocusableCandidates(container: HTMLElement) {
		return Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter((element) => {
			if (element.tabIndex < 0) return false
			if (element.getAttribute('aria-hidden') === 'true') return false
			if ('disabled' in element && element.disabled) return false
			return true
		})
	}

	function getFallbackFocusTarget(container: HTMLElement) {
		return getFocusableCandidates(container)[0] ?? container
	}

	function focusLastKnownOrFirst(container: HTMLElement) {
		if (lastFocusedElement && container.contains(lastFocusedElement)) {
			focusElement(lastFocusedElement)
			return
		}

		focusElement(getFallbackFocusTarget(container))
	}

	function requestFocusInside(container: HTMLElement) {
		if (pendingFocusRestore || isRestoringFocus) return
		pendingFocusRestore = true

		queueMicrotask(() => {
			pendingFocusRestore = false
			if (!enabled.value) return
			const activeElement = document.activeElement
			if (activeElement instanceof HTMLElement && container.contains(activeElement)) return
			if (isElementInsideDrawerBranch(activeElement)) return

			focusLastKnownOrFirst(container)
		})
	}

	function installTrap(container: HTMLElement) {
		if (typeof document === 'undefined') return () => {}

		function handleFocusIn(event: FocusEvent) {
			if (!enabled.value) return
			const target = event.target
			if (target instanceof HTMLElement && container.contains(target)) {
				lastFocusedElement = target
				return
			}
			if (isElementInsideDrawerBranch(target)) return

			requestFocusInside(container)
		}

		function handleFocusOut(event: FocusEvent) {
			if (!enabled.value) return
			const relatedTarget = event.relatedTarget
			if (relatedTarget === null) return
			if (relatedTarget instanceof HTMLElement && container.contains(relatedTarget)) return
			if (isElementInsideDrawerBranch(relatedTarget)) return

			requestFocusInside(container)
		}

		function handleMutations(mutations: MutationRecord[]) {
			if (!enabled.value || !lastFocusedElement) return
			if (!mutations.some(mutation => mutation.removedNodes.length > 0)) return
			if (container.contains(lastFocusedElement)) return

			lastFocusedElement = null
			focusElement(container)
		}

		document.addEventListener('focusin', handleFocusIn)
		document.addEventListener('focusout', handleFocusOut)
		mutationObserver = new MutationObserver(handleMutations)
		mutationObserver.observe(container, { childList: true, subtree: true })

		return () => {
			document.removeEventListener('focusin', handleFocusIn)
			document.removeEventListener('focusout', handleFocusOut)
			mutationObserver?.disconnect()
			mutationObserver = null
		}
	}

	function handleKeyDown(event: KeyboardEvent) {
		if (!enabled.value || event.key !== 'Tab' || event.altKey || event.ctrlKey || event.metaKey) return
		const container = contentElement.value
		if (!container) return

		const candidates = getFocusableCandidates(container)
		if (candidates.length === 0) {
			if (document.activeElement === container) {
				event.preventDefault()
			}
			return
		}

		const first = candidates[0]!
		const last = candidates[candidates.length - 1]!
		const activeElement = document.activeElement

		if (event.shiftKey && (activeElement === first || activeElement === container)) {
			event.preventDefault()
			focusElement(last)
			return
		}

		if (!event.shiftKey && activeElement === last) {
			event.preventDefault()
			focusElement(first)
		}
	}

	function handleAfterOpen() {
		const container = contentElement.value
		if (!container) return

		nextTick(() => {
			const event = new Event('open-auto-focus', { cancelable: true })
			onOpenAutoFocus(event)
			if (event.defaultPrevented || !autoFocus.value) return

			focusElement(getFallbackFocusTarget(container))
		})
	}

	function handleAfterClose() {
		const event = new Event('close-auto-focus', { cancelable: true })
		onCloseAutoFocus(event)

		const target = previouslyFocusedElement
		previouslyFocusedElement = null
		lastFocusedElement = null
		pendingFocusRestore = false
		isRestoringFocus = false

		if (event.defaultPrevented || !shouldRestoreFocus.value) return
		focusElement(target, true)
	}

	watch(contentElement, (container, _previousContainer, onCleanup) => {
		if (!container) return

		rememberPreviousFocus()
		if (container.contains(previouslyFocusedElement)) {
			lastFocusedElement = previouslyFocusedElement
		}

		const cleanupTrap = installTrap(container)
		onCleanup(cleanupTrap)
	}, { flush: 'post' })

	onBeforeUnmount(() => {
		mutationObserver?.disconnect()
		mutationObserver = null
	})

	return {
		handleAfterOpen,
		handleAfterClose,
		handleKeyDown,
	}
}
