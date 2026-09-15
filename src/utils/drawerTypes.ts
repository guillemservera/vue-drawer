import type { Component, HTMLAttributes, Ref } from 'vue'

export type DrawerDirection = 'top' | 'bottom' | 'left' | 'right'
export type DrawerAnimation = 'slide' | 'fade'
export type DrawerCloseScope = 'current' | 'all'
export type DrawerSnapPoint = number | string
export type DrawerPortalTarget = string | HTMLElement
export type DrawerPrimitiveAs = string | Component
export type DrawerPointerDownOutsideEvent = CustomEvent<{ originalEvent: PointerEvent }>
export type DrawerFocusOutsideEvent = CustomEvent<{ originalEvent: FocusEvent }>
export type DrawerInteractOutsideEvent = DrawerPointerDownOutsideEvent | DrawerFocusOutsideEvent

export interface DrawerRootProps {
	open?: boolean
	defaultOpen?: boolean
	modal?: boolean
	dismissible?: boolean
	instantClose?: boolean
	autoFocus?: boolean
	handleOnly?: boolean
	container?: DrawerPortalTarget | null
	/**
	 * Keeps focused inputs visible when the iOS keyboard changes the visual viewport.
	 */
	repositionInputs?: boolean
	/**
	 * When repositionInputs is active, reduce drawer height instead of preserving
	 * the full drawer height above the keyboard.
	 */
	fixed?: boolean
	/**
	 * Controls VueDrawer's document/body scroll lock layer.
	 * Set to false only when the host app owns scroll locking itself.
	 */
	preventScroll?: boolean
	/**
	 * Keeps iOS touch/overscroll guards enabled, but skips writing position/top/left
	 * styles to document.body. Useful when an app shell already owns body positioning.
	 */
	noBodyStyles?: boolean
	animation?: DrawerAnimation
	closeAnimation?: DrawerAnimation
	direction?: DrawerDirection
	closeThreshold?: number
	scrollLockTimeout?: number
	nested?: boolean
	preventScrollRestoration?: boolean
	snapToSequentialPoint?: boolean
	snapPoints?: DrawerSnapPoint[]
	activeSnapPoint?: DrawerSnapPoint | null
	defaultSnapPoint?: DrawerSnapPoint | null
	fadeFromIndex?: number
}

export interface DrawerRootEmits {
	(event: 'update:open', value: boolean): void
	(event: 'update:activeSnapPoint', value: DrawerSnapPoint | null): void
	(event: 'after-open' | 'after-close'): void
	(event: 'animation-end', open: boolean): void
	(event: 'close'): void
	(event: 'drag', pointerEvent: PointerEvent, percentageDragged: number): void
	(event: 'release', pointerEvent: PointerEvent, open: boolean): void
	(event: 'content:error', error: unknown, instance: unknown, info: string): void
}

export interface DrawerContentEmits {
	error: [error: unknown, instance: unknown, info: string]
	'open-auto-focus': [event: Event]
	'close-auto-focus': [event: Event]
	'escape-key-down': [event: KeyboardEvent]
	'pointer-down-outside': [event: DrawerPointerDownOutsideEvent]
	'focus-outside': [event: DrawerFocusOutsideEvent]
	'interact-outside': [event: DrawerInteractOutsideEvent]
}

export interface DrawerRootContext {
	drawerId: string
	open: Ref<boolean>
	hasBeenOpened: Ref<boolean>
	modal: Ref<boolean>
	dismissible: Ref<boolean>
	autoFocus: Ref<boolean>
	handleOnly: Ref<boolean>
	container: Ref<DrawerPortalTarget | null>
	animation: Ref<DrawerAnimation>
	closeAnimation: Ref<DrawerAnimation>
	closeAnimationOverride: Ref<DrawerAnimation | null>
	direction: Ref<DrawerDirection>
	closeThreshold: Ref<number>
	scrollLockTimeout: Ref<number>
	nested: Ref<boolean>
	snapToSequentialPoint: Ref<boolean>
	snapPoints: Ref<DrawerSnapPoint[] | undefined>
	hasSnapPoints: Ref<boolean>
	shouldFadeOverlay: Ref<boolean>
	activeSnapPoint: Ref<DrawerSnapPoint | null>
	activeSnapPointIndex: Ref<number>
	fadeFromIndex: Ref<number | undefined>
	defaultContentId: string
	defaultTitleId: string
	defaultDescriptionId: string
	contentId: Ref<string>
	titleId: Ref<string | undefined>
	descriptionId: Ref<string | undefined>
	openedAt: Ref<number | null>
	contentElement: Ref<HTMLElement | null>
	overlayElement: Ref<HTMLElement | null>
	isDragging: Ref<boolean>
	gestureClosing: Ref<boolean>
	skipCloseAnimation: Ref<boolean>
	shouldAnimateInitialOpen: Ref<boolean>
	preventCloseAutoFocusOnce: Ref<boolean>
	parentContext: DrawerRootContext | null
	requestOpenChange: (value: boolean, options?: { animation?: DrawerAnimation }) => void
	registerContentId: (id: string) => void
	unregisterContentId: (id: string) => void
	registerTitleId: (id: string) => void
	unregisterTitleId: (id: string) => void
	registerDescriptionId: (id: string) => void
	unregisterDescriptionId: (id: string) => void
	registerContentElement: (element: HTMLElement | null) => void
	registerOverlayElement: (element: HTMLElement | null) => void
	emitDrag: (pointerEvent: PointerEvent, percentageDragged: number) => void
	emitRelease: (pointerEvent: PointerEvent, open: boolean) => void
	getVisibleDrawerSize: () => number
	getSnapPointBaseSize: () => number
	getSnapPointsOffset: (baseSize?: number) => number[]
	getRestingOffset: () => number
	getRestingOverlayOpacity: () => number
	syncRestingStyles: (options?: { overlayOpacity?: number, restingOffset?: number }) => void
	setActiveSnapPointValue: (value: DrawerSnapPoint | null) => void
	animateToSnapPoint: (index: number, options?: { updateActiveSnapPoint?: boolean }) => void
	handleAfterOpen: () => void
	handleAfterClose: () => void
	handleDismissAttempt: (event: Event) => void
	handleContentError: (error: unknown, instance: unknown, info: string) => void
	setGestureClosing: (value: boolean) => void
	setSkipCloseAnimation: (value: boolean) => void
	setNestedChildOpen: (value: boolean, options?: { instant?: boolean }) => void
	onNestedDrag: (closeProgress: number) => void
	onNestedRelease: (isStillOpen: boolean) => void
	resetInteractiveState: () => void
	getContentTransition: (options?: { instant?: boolean, close?: boolean }) => string
	getOverlayTransition: (options?: { instant?: boolean, close?: boolean }) => string
}

export interface DrawerHandleProps {
	class?: HTMLAttributes['class']
	preventCycle?: boolean
}

export interface DrawerTriggerProps {
	disabled?: boolean
	as?: DrawerPrimitiveAs
	asChild?: boolean
}

export interface DrawerCloseProps {
	animation?: DrawerAnimation
	disabled?: boolean
	scope?: DrawerCloseScope
	as?: DrawerPrimitiveAs
	asChild?: boolean
}

export interface DrawerPortalProps {
	to?: DrawerPortalTarget
	disabled?: boolean
}
