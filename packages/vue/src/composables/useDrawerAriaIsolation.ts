import { watch } from 'vue'
import type { Ref } from 'vue'
import { hideElementsOutside } from '../utils/drawerAria'

interface UseDrawerAriaIsolationOptions {
	contentElement: Ref<HTMLElement | null>
	enabled: Ref<boolean>
}

export function useDrawerAriaIsolation(options: UseDrawerAriaIsolationOptions) {
	watch(
		() => options.enabled.value ? options.contentElement.value : null,
		(element, _previousElement, onCleanup) => {
			if (!element) return
			const restore = hideElementsOutside(element)
			onCleanup(restore)
		},
		{ flush: 'post' },
	)
}
