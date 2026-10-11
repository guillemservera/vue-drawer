import { inject, provide } from 'vue'
import type { InjectionKey } from 'vue'

export interface DrawerGestureContext {
	handlePointerDown: (event: PointerEvent) => void
	handlePointerMove: (event: PointerEvent) => void
	handlePointerUp: (event: PointerEvent) => void
	handlePointerCancel: (event: PointerEvent) => void
	handleLostPointerCapture: (event: PointerEvent) => void
}

const drawerGestureContextKey: InjectionKey<DrawerGestureContext> = Symbol('DrawerGestureContext')

export function provideDrawerGestureContext(context: DrawerGestureContext) {
	provide(drawerGestureContextKey, context)
}

export function useOptionalDrawerGestureContext() {
	return inject(drawerGestureContextKey, null)
}
