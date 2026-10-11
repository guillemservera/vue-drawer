// Keeps a focused input visible above the iOS keyboard (vue-drawer's `repositionInputs`), for bottom modal sheets.
const MIN_KEYBOARD_OFFSET = 60
const MIN_DRAWER_HEIGHT = 160
const TOP_VIEWPORT_GUTTER = 24

const isEditable = (el: Element | null): el is HTMLElement =>
	el instanceof HTMLElement && (el.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName))

/**
 * Starts watching the visual viewport. `stop` also restores the sheet's inline layout; `active` tells whether the keyboard layout
 * currently holds the sheet, which then sits at its fully open position (so `--drawer-rest` is not the caller's to write);
 * `onRestore` runs when the layout is given back, for the caller to put the resting snap offset back.
 */
export function watchKeyboard(sheet: HTMLElement, fixed: boolean, onRestore?: () => void): { stop: () => void, active: () => boolean } {
	const viewport = window.visualViewport
	if (!viewport) return { stop: () => {}, active: () => false }

	let saved: { bottom: string, height: string, maxHeight: string } | null = null
	let baseHeight = 0
	let frame = 0
	let stopped = false

	const restore = () => {
		if (!saved) return
		Object.assign(sheet.style, saved)
		saved = null
		baseHeight = 0
		onRestore?.()
	}

	const apply = () => {
		frame = 0
		if (stopped) return
		const focused = document.activeElement
		const keyboard = Math.max(innerHeight - viewport.height - viewport.offsetTop, 0)
		// A nested drawer sits inside this sheet's DOM: its inputs belong to its own watcher.
		if (!isEditable(focused) || focused.closest('dialog') !== sheet || keyboard < MIN_KEYBOARD_OFFSET) return restore()

		if (!saved) {
			saved = { bottom: sheet.style.bottom, height: sheet.style.height, maxHeight: sheet.style.maxHeight }
			baseHeight = sheet.getBoundingClientRect().height || sheet.offsetHeight
		}
		const height = sheet.getBoundingClientRect().height
		const covered = focused.getBoundingClientRect().bottom > viewport.offsetTop + viewport.height - 16
		// Keep the normal layout while the control is visible: Safari emits small viewport changes while its toolbars move.
		if (!covered && height <= viewport.height) return

		const available = Math.max(viewport.height - TOP_VIEWPORT_GUTTER, MIN_DRAWER_HEIGHT)
		const next = fixed
			? Math.max(baseHeight - keyboard, MIN_DRAWER_HEIGHT)
			: Math.max(Math.min(baseHeight, available), MIN_DRAWER_HEIGHT)
		sheet.style.bottom = `${keyboard}px`
		sheet.style.height = sheet.style.maxHeight = `${Math.round(next)}px`
		// A snap sheet spans the viewport and rests translated down; its resized box would keep that offset and show a sliver above the keyboard.
		sheet.style.setProperty('--drawer-rest', 'none')
	}

	const schedule = () => {
		frame ||= requestAnimationFrame(apply)
	}
	const afterBlur = () => void setTimeout(schedule, 0)

	viewport.addEventListener('resize', schedule)
	viewport.addEventListener('scroll', schedule)
	addEventListener('resize', schedule)
	document.addEventListener('focusin', schedule)
	document.addEventListener('focusout', afterBlur)
	schedule()

	return {
		active: () => saved !== null,
		stop: () => {
			stopped = true // a queued blur timeout must not restart the layout
			cancelAnimationFrame(frame)
			viewport.removeEventListener('resize', schedule)
			viewport.removeEventListener('scroll', schedule)
			removeEventListener('resize', schedule)
			document.removeEventListener('focusin', schedule)
			document.removeEventListener('focusout', afterBlur)
			restore()
		},
	}
}
