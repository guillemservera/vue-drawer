import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import type { Ref } from 'vue'
import {
	canLockDocumentScroll,
	canUseBodyFix,
	createTouchScrollGuard,
	isIOSBrowser,
	lockDocumentOverscroll,
	lockDocumentScroll,
	restoreDocumentOverscroll,
	restoreDocumentScroll,
} from '@guillemservera/drawer-core'

interface BodyPositionSnapshot {
	position: string
	top: string
	left: string
	right: string
	height: string
}

interface UseDrawerScrollLockOptions {
	open: Ref<boolean>
	modal: Ref<boolean>
	nested: Ref<boolean>
	hasBeenOpened: Ref<boolean>
	preventScroll: Ref<boolean>
	preventScrollRestoration: Ref<boolean>
	noBodyStyles: Ref<boolean>
	contentElement: Ref<HTMLElement | null>
}

let previousBodyPosition: BodyPositionSnapshot | null = null

export function useDrawerScrollLock(options: UseDrawerScrollLockOptions) {
	const {
		open,
		modal,
		nested,
		hasBeenOpened,
		preventScroll,
		preventScrollRestoration,
		noBodyStyles,
		contentElement,
	} = options
	const activeUrl = ref(typeof window !== 'undefined' ? window.location.href : '')
	const scrollPos = ref(typeof window !== 'undefined' ? window.scrollY : 0)
	const hasDocumentScrollLock = ref(false)
	const hasDocumentOverscrollLock = ref(false)
	const hasBodyPositionLock = ref(false)
	const lockedScrollX = ref(0)
	const lockedScrollY = ref(0)
	const removeTouchScrollGuard = ref<(() => void) | null>(null)
	const bodyPositionAdjustmentTimer = ref<number | null>(null)
	const windowScrollRestoreFrame = ref<number | null>(null)
	const nonModalRestoreTimer = ref<number | null>(null)

	function clearBodyPositionAdjustmentTimer() {
		if (bodyPositionAdjustmentTimer.value === null || typeof window === 'undefined') return
		window.clearTimeout(bodyPositionAdjustmentTimer.value)
		bodyPositionAdjustmentTimer.value = null
	}

	function clearNonModalRestoreTimer() {
		if (nonModalRestoreTimer.value === null || typeof window === 'undefined') return
		window.clearTimeout(nonModalRestoreTimer.value)
		nonModalRestoreTimer.value = null
	}

	function clearWindowScrollRestoreFrame() {
		if (windowScrollRestoreFrame.value === null || typeof window === 'undefined') return
		window.cancelAnimationFrame(windowScrollRestoreFrame.value)
		windowScrollRestoreFrame.value = null
	}

	function clearTouchScrollGuard() {
		removeTouchScrollGuard.value?.()
		removeTouchScrollGuard.value = null
	}

	function registerTouchScrollGuard() {
		if (typeof document === 'undefined' || typeof window === 'undefined') return
		if (!isIOSBrowser()) return
		if (removeTouchScrollGuard.value) return

		removeTouchScrollGuard.value = createTouchScrollGuard(() => contentElement.value)
	}

	function handleWindowScroll() {
		if (hasBodyPositionLock.value) {
			if (window.scrollX !== lockedScrollX.value || window.scrollY !== lockedScrollY.value) {
				scheduleLockedWindowScrollRestore()
			}
			return
		}

		scrollPos.value = window.scrollY
	}

	function restoreWindowScroll(left: number, top: number) {
		// `instant` overrides a consumer's `scroll-behavior: smooth` on <html>,
		// which would otherwise animate the page from the top back to `top`.
		window.scrollTo({ left, top, behavior: 'instant' })
	}

	function scheduleLockedWindowScrollRestore() {
		if (typeof window === 'undefined' || windowScrollRestoreFrame.value !== null) return

		windowScrollRestoreFrame.value = window.requestAnimationFrame(() => {
			windowScrollRestoreFrame.value = null
			if (!hasBodyPositionLock.value) return
			if (window.scrollX === lockedScrollX.value && window.scrollY === lockedScrollY.value) return

			// Vaul uses a window scroll listener as the last line of defense on iOS.
			// Safari can still move the root viewport while the body is fixed,
			// especially around browser chrome and keyboard transitions.
			restoreWindowScroll(lockedScrollX.value, lockedScrollY.value)
		})
	}

	function syncDocumentOverscrollLock(shouldLock: boolean) {
		if (shouldLock && !hasDocumentOverscrollLock.value) {
			// Vaul's React implementation prevents Mobile Safari from chaining drawer drags
			// into viewport pull-to-refresh. Keep that protection for the full drawer lifetime.
			lockDocumentOverscroll()
			hasDocumentOverscrollLock.value = true
			return
		}

		if (!shouldLock && hasDocumentOverscrollLock.value) {
			restoreDocumentOverscroll()
			hasDocumentOverscrollLock.value = false
		}
	}

	function syncDocumentScrollLock(shouldLock: boolean) {
		const canLock = shouldLock && canLockDocumentScroll()

		if (canLock && !hasDocumentScrollLock.value) {
			lockDocumentScroll()
			hasDocumentScrollLock.value = true
			return
		}

		if (!canLock && hasDocumentScrollLock.value) {
			restoreDocumentScroll()
			hasDocumentScrollLock.value = false
		}
	}

	function syncTouchScrollGuard(shouldLock: boolean) {
		if (shouldLock) {
			registerTouchScrollGuard()
			return
		}

		clearTouchScrollGuard()
	}

	function lockBodyPosition() {
		if (!preventScroll.value || noBodyStyles.value || !canUseBodyFix() || nested.value || previousBodyPosition) return

		const { scrollX, innerHeight } = window
		lockedScrollX.value = scrollX
		lockedScrollY.value = scrollPos.value

		previousBodyPosition = {
			position: document.body.style.position,
			top: document.body.style.top,
			left: document.body.style.left,
			right: document.body.style.right,
			height: document.body.style.height,
		}

		document.body.style.setProperty('position', 'fixed', 'important')
		document.body.style.top = `${-lockedScrollY.value}px`
		document.body.style.left = `${-lockedScrollX.value}px`
		document.body.style.right = '0px'
		document.body.style.height = 'auto'
		hasBodyPositionLock.value = true

		clearBodyPositionAdjustmentTimer()
		bodyPositionAdjustmentTimer.value = window.setTimeout(() => {
			if (typeof window === 'undefined') return
			window.requestAnimationFrame(() => {
				if (typeof window === 'undefined') return
				const bottomBarHeight = innerHeight - window.innerHeight
				if (bottomBarHeight && lockedScrollY.value >= innerHeight) {
					document.body.style.top = `${-(lockedScrollY.value + bottomBarHeight)}px`
				}
			})
		}, 300)
	}

	function restoreBodyPosition() {
		if (!canUseBodyFix() || !previousBodyPosition) return
		clearBodyPositionAdjustmentTimer()

		// `|| 0` normalizes the -0 produced by negating an unscrolled `0px`.
		const scrollY = -Number.parseInt(document.body.style.top || '0', 10) || 0
		const scrollX = -Number.parseInt(document.body.style.left || '0', 10) || 0

		hasBodyPositionLock.value = false
		clearWindowScrollRestoreFrame()

		document.body.style.position = previousBodyPosition.position
		document.body.style.top = previousBodyPosition.top
		document.body.style.left = previousBodyPosition.left
		document.body.style.right = previousBodyPosition.right
		document.body.style.height = previousBodyPosition.height

		previousBodyPosition = null
		lockedScrollX.value = 0
		lockedScrollY.value = 0

		if (!preventScrollRestoration.value) {
			// Restore in the same task that removes the body lock so the browser
			// never paints a frame with the unpinned page at the top.
			restoreWindowScroll(scrollX, scrollY)
			return
		}

		// With preventScrollRestoration, wait one frame so a navigation triggered
		// from inside the drawer is visible in `location.href` and the new page is
		// not scrolled to the old position. Trade-off: in this mode the page can
		// paint one frame at the top before the restore.
		window.requestAnimationFrame(() => {
			if (activeUrl.value !== window.location.href) {
				activeUrl.value = window.location.href
				return
			}

			restoreWindowScroll(scrollX, scrollY)
		})
	}

	onMounted(() => {
		handleWindowScroll()
		window.addEventListener('scroll', handleWindowScroll)
	})

	watch(
		() => [open.value, modal.value, preventScroll.value, noBodyStyles.value] as const,
		([isOpen, isModal, shouldPreventScroll, shouldSkipBodyStyles]) => {
			const shouldLockOverscroll = shouldPreventScroll && isOpen && isModal
			const shouldLockDocumentScroll = shouldLockOverscroll && !shouldSkipBodyStyles
			syncDocumentScrollLock(shouldLockDocumentScroll)
			syncDocumentOverscrollLock(shouldLockOverscroll)
			syncTouchScrollGuard(shouldLockOverscroll)
		},
		{ immediate: true },
	)

	watch(
		() => [
			open.value,
			modal.value,
			nested.value,
			hasBeenOpened.value,
			activeUrl.value,
			preventScroll.value,
			noBodyStyles.value,
		] as const,
		([isOpen, isModal, isNested, wasOpened, _activeUrl, shouldPreventScroll, shouldSkipBodyStyles]) => {
			if (isNested || !wasOpened) return

			if (isOpen && shouldPreventScroll && !shouldSkipBodyStyles) {
				lockBodyPosition()
				if (!isModal) {
					clearNonModalRestoreTimer()
					nonModalRestoreTimer.value = window.setTimeout(() => {
						restoreBodyPosition()
					}, 500)
				}
				return
			}

			restoreBodyPosition()
		},
		{ immediate: true },
	)

	onBeforeUnmount(() => {
		if (typeof window !== 'undefined') {
			window.removeEventListener('scroll', handleWindowScroll)
		}

		const shouldKeepBodyPosition = typeof document !== 'undefined' && modal.value && preventScroll.value && !noBodyStyles.value
			? [...document.querySelectorAll('[data-drawer-content][data-state="open"]')]
				.some(element => element !== contentElement.value)
			: false

		if (hasDocumentOverscrollLock.value) {
			restoreDocumentOverscroll()
			hasDocumentOverscrollLock.value = false
		}

		if (hasDocumentScrollLock.value) {
			restoreDocumentScroll()
			hasDocumentScrollLock.value = false
		}

		clearBodyPositionAdjustmentTimer()
		clearWindowScrollRestoreFrame()
		clearNonModalRestoreTimer()
		clearTouchScrollGuard()

		if (!shouldKeepBodyPosition) {
			restoreBodyPosition()
		}
	})
}
