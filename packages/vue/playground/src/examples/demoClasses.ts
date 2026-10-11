type DrawerDirection = 'bottom' | 'right' | 'left' | 'top'
export type DemoContentVariant = 'default' | 'side-sidebar' | 'side-drawer' | 'side-floating'

export interface DemoFadeTiming {
	enterDuration: number
	leaveDuration: number
	offset: number
}

export function overlayClass(styled: boolean) {
	return styled ? 'demo-overlay demo-overlay--styled' : 'demo-overlay'
}

export function contentClass(styled: boolean, direction: DrawerDirection, variant: DemoContentVariant = 'default') {
	return [
		'demo-content',
		`demo-content--${direction}`,
		`demo-content--${variant}`,
		styled ? 'demo-content--styled' : 'demo-content--unstyled',
	].join(' ')
}

export function handleClass(styled: boolean) {
	return styled ? 'demo-handle demo-handle--styled' : 'demo-handle'
}

export function fadeTimingStyle(timing: DemoFadeTiming) {
	return {
		'--drawer-fade-enter-duration': `${timing.enterDuration}ms`,
		'--drawer-fade-leave-duration': `${timing.leaveDuration}ms`,
		'--drawer-fade-enter-offset': `${timing.offset}px`,
	}
}
