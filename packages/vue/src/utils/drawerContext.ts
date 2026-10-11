import { inject, provide } from 'vue'
import type { InjectionKey } from 'vue'
import type { DrawerRootContext } from './drawerTypes'

const drawerRootContextKey: InjectionKey<DrawerRootContext> = Symbol('DrawerRootContext')

export function provideDrawerRootContext(context: DrawerRootContext) {
	provide(drawerRootContextKey, context)
}

export function useDrawerRootContext() {
	const context = inject(drawerRootContextKey, null)
	if (!context) {
		throw new Error('Drawer components must be used inside `DrawerRoot`.')
	}
	return context
}

export function useOptionalDrawerRootContext() {
	return inject(drawerRootContextKey, null)
}
