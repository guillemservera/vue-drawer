const hiddenCounts = new WeakMap<Element, number>()
const originalAriaHidden = new WeakMap<Element, string | null>()

export function hideElementsOutside(target: HTMLElement) {
	const hiddenElements: Element[] = []
	const ownerDocument = target.ownerDocument
	let current: Element | null = target

	while (current && current !== ownerDocument.body) {
		const parent: HTMLElement | null = current.parentElement
		if (!parent) break

		for (const child of Array.from(parent.children) as Element[]) {
			if (child === current || child.contains(target)) continue
			hideElement(child, hiddenElements)
		}

		current = parent
	}

	return () => {
		for (let index = hiddenElements.length - 1; index >= 0; index -= 1) {
			restoreElement(hiddenElements[index]!)
		}
	}
}

function hideElement(element: Element, hiddenElements: Element[]) {
	const count = hiddenCounts.get(element) ?? 0

	if (count === 0) {
		originalAriaHidden.set(element, element.getAttribute('aria-hidden'))
		element.setAttribute('aria-hidden', 'true')
	}

	hiddenCounts.set(element, count + 1)
	hiddenElements.push(element)
}

function restoreElement(element: Element) {
	const count = hiddenCounts.get(element)
	if (!count) return

	if (count > 1) {
		hiddenCounts.set(element, count - 1)
		return
	}

	hiddenCounts.delete(element)
	const original = originalAriaHidden.get(element)
	originalAriaHidden.delete(element)

	if (original === null || original === undefined) {
		element.removeAttribute('aria-hidden')
		return
	}

	element.setAttribute('aria-hidden', original)
}
