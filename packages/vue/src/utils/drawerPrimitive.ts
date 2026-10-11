import { cloneVNode, Comment, defineComponent, Fragment, h, isVNode, mergeProps, Text } from 'vue'
import type { PropType, VNode } from 'vue'
import type { DrawerPrimitiveAs } from './drawerTypes'

function isEmptyTextNode(node: VNode) {
	return node.type === Text && typeof node.children === 'string' && node.children.trim() === ''
}

function flattenSlotChildren(children: VNode[]) {
	const flattened: VNode[] = []

	for (const child of children) {
		if (child.type === Comment || isEmptyTextNode(child)) continue

		if (child.type === Fragment && Array.isArray(child.children)) {
			const fragmentChildren = child.children.filter((item): item is VNode => isVNode(item))
			flattened.push(...flattenSlotChildren(fragmentChildren))
			continue
		}

		flattened.push(child)
	}

	return flattened
}

function getSingleElementChild(children: VNode[] | undefined) {
	const normalizedChildren = flattenSlotChildren(children ?? [])
	if (normalizedChildren.length !== 1 || normalizedChildren[0]?.type === Text) {
		if (import.meta.env.DEV) {
			console.warn('[vuedrawer] asChild expects exactly one element child.')
		}
		return null
	}

	return normalizedChildren[0]
}

export const DrawerPrimitive = defineComponent({
	name: 'DrawerPrimitive',
	inheritAttrs: false,
	props: {
		as: {
			type: [String, Object, Function] as PropType<DrawerPrimitiveAs>,
			default: 'div',
		},
		asChild: {
			type: Boolean,
			default: false,
		},
		elementProps: {
			type: Object as PropType<Record<string, unknown>>,
			default: () => ({}),
		},
	},
	setup(props, { attrs, slots }) {
		return () => {
			const children = slots.default?.()
			const forwardedProps = mergeProps(attrs, props.elementProps)

			if (props.asChild) {
				const child = getSingleElementChild(children)
				if (child) return cloneVNode(child, forwardedProps, true)
			}

			return h(props.as, forwardedProps, children)
		}
	},
})
