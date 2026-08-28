export const DRAWER_BRANCH_SELECTOR = '[data-drawer-branch], [data-vaul-branch]'

export const DRAWER_NO_DRAG_SELECTOR = '[data-drawer-no-drag], [data-vaul-no-drag]'

export function isElementInsideDrawerBranch(target: EventTarget | null) {
	return target instanceof Element && Boolean(target.closest(DRAWER_BRANCH_SELECTOR))
}

export function isDrawerNoDragTarget(target: EventTarget | null) {
	// Only explicit no-drag zones — and native SELECT, which opens its own OS
	// picker — opt out of the drawer's touch handling here. A blanket interactive
	// block (buttons/links/rows) made useDrawerScrollLock bail without
	// preventDefault on drawers whose scroll body is all interactive rows
	// (analytics filter catalog, AI timeline), breaking swipe-to-dismiss.
	if (!(target instanceof Element)) return false
	if (target.tagName === 'SELECT') return true
	return Boolean(target.closest(DRAWER_NO_DRAG_SELECTOR))
}
