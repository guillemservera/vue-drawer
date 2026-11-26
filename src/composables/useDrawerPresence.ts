import { computed, nextTick, ref, watch } from 'vue'
import type { Ref } from 'vue'
import { getDrawerTransitions } from '../utils/drawerDom'
import type { DrawerRootContext } from '../utils/drawerTypes'

export function useDrawerPresence(
	root: DrawerRootContext,
	element: Ref<HTMLElement | null>,
	part: 'content' | 'overlay',
	hooks?: { afterOpen: () => void, afterClose: () => void },
) {
	const present = ref(root.open.value || root.gestureClosing.value)
	const phase = ref<'enter-from' | 'enter' | 'leave' | null>(
		root.open.value && root.shouldAnimateInitialOpen.value ? 'enter-from' : null,
	)
	const name = `drawer-${part}`
	const closeAnimation = computed(() => root.closeAnimationOverride.value ?? root.closeAnimation.value)
	const fadeLeaveTransform = ref<string>()
	const motionClasses = computed(() => {
		switch (phase.value) {
			case 'enter-from':
				return [`${name}-enter-from`]
			case 'enter':
				return [`${name}-enter-active`, `${name}-enter-to`]
			case 'leave':
				return [
					`${name}-leave-active`,
					`${name}-leave-to`,
					root.skipCloseAnimation.value && `${name}-leave-active--instant`,
				]
		}
		return []
	})

	watch([() => root.open.value, () => root.gestureClosing.value], ([open, gestureClosing], [wasOpen]) => {
		if (open && !wasOpen) {
			fadeLeaveTransform.value = undefined
			phase.value = present.value ? 'enter' : 'enter-from'
			present.value = true
		}
		else if (!open && !gestureClosing && present.value) {
			const node = element.value
			if (part === 'content' && closeAnimation.value === 'fade' && phase.value === 'enter' && node) {
				// A fade leave holds the position at which it interrupted the enter.
				fadeLeaveTransform.value = getComputedStyle(node).transform
			}
			phase.value = 'leave'
		}
	})

	watch(
		[phase, element, () => root.open.value, () => root.isDragging.value, () => root.skipCloseAnimation.value],
		([currentPhase, node, open, dragging], _previous, onCleanup) => {
			if (!node || !currentPhase) return
			if (currentPhase === 'enter-from') {
				// Establish the starting style before giving CSS an open target.
				void getComputedStyle(node).opacity
				phase.value = 'enter'
				return
			}
			const entering = currentPhase === 'enter'
			if (entering !== open || (entering && dragging)) return

			let canceled = false
			onCleanup(() => { canceled = true })
			const finish = () => {
				phase.value = null
				if (entering) {
					hooks?.afterOpen()
				}
				else {
					present.value = false
					void nextTick(() => {
						if (!root.open.value) hooks?.afterClose()
					})
				}
			}
			const waitForMotion = () => {
				if (canceled || entering !== root.open.value) return
				const transitions = getDrawerTransitions(node).filter(transition => transition.playState !== 'finished')
				if (transitions.length) {
					void Promise.allSettled(transitions.map(transition => transition.finished)).then(waitForMotion)
				}
				else {
					finish()
				}
			}
			waitForMotion()
		},
		{ flush: 'post' },
	)

	return { present, motionClasses, closeAnimation, fadeLeaveTransform }
}
