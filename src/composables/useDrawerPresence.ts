import { computed, getCurrentInstance, onBeforeMount, ref, watch } from 'vue'
import type { Ref } from 'vue'
import { getDrawerTransitions } from '../utils/drawerDom'
import type { DrawerRootContext } from '../utils/drawerTypes'

export function useDrawerPresence(
	root: DrawerRootContext,
	element: Ref<HTMLElement | null>,
	part: 'content' | 'overlay',
	hooks?: { afterOpen: () => void, afterClose: () => void, beforeLeave: () => void },
) {
	const hasBeenPresent = ref(root.open.value || root.gestureClosing.value)
	const present = computed(() => root.open.value || (hasBeenPresent.value && !root.closeCommitted.value))
	const phase = ref<'enter-from' | 'enter' | 'leave' | null>(null)
	const instance = getCurrentInstance()
	onBeforeMount(() => {
		// Vue attaches the server DOM to the vnode before mounting a hydrated component.
		if (!instance?.vnode.el && root.open.value && root.shouldAnimateInitialOpen.value) {
			phase.value = 'enter-from'
		}
	})
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
			phase.value = element.value ? 'enter' : 'enter-from'
			hasBeenPresent.value = true
		}
		else if (!open && !gestureClosing && present.value) {
			const node = element.value
			if (part === 'content' && closeAnimation.value === 'fade' && node && phase.value !== 'leave') {
				// Hold the rendered position through the fade, including when it interrupts another motion.
				fadeLeaveTransform.value = getComputedStyle(node).transform
			}
			hooks?.beforeLeave()
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
				if (entering) {
					phase.value = null
					hooks?.afterOpen()
				}
				else {
					root.handleSurfaceLeave(node, hooks?.afterClose)
				}
			}
			const waitForMotion = () => {
				if (canceled || entering !== root.open.value || (entering && root.isDragging.value)) return
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
