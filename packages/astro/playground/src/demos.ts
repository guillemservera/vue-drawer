// The /demos/ index renders these lists. Add a page under src/pages/ and an entry here.
export const demos = [
	{ href: '/basic-bottom/', title: 'Basic bottom', description: 'Escape, backdrop, drag-to-dismiss and a Done button.' },
	{ href: '/side-drawers/', title: 'Side drawers', description: 'Right, left and top sheets.' },
	{ href: '/no-drag-zones/', title: 'No-drag zones', description: 'A slider and a horizontal strip that own their gestures.' },
	{ href: '/non-dismissible/', title: 'Non-dismissible', description: 'Only the explicit button closes it.' },
	{ href: '/scroll-body/', title: 'Scroll body', description: 'Long content in a bottom sheet and a left sidebar.' },
	{ href: '/form-drawer/', title: 'Form drawer', description: 'Inputs and a select; the first input is focused once the sheet has opened.' },
	{ href: '/snap-points/', title: 'Snap points', description: 'Fractions, lengths with a backdrop fade, sequential and a right sidebar.' },
	{ href: '/nested/', title: 'Nested drawers', description: 'Same-side scale-back, a different-side child, three levels, non-dismissible mixes and scaleParent.' },
	{ href: '/non-modal/', title: 'Non-modal and container', description: 'The page stays interactive; a drawer that lives inside a panel.' },
	{ href: '/animations/', title: 'Animations', description: 'Fade in/out, slide in and fade out, per-button animation and instant close.' },
	{ href: '/persist/', title: 'Persisted across navigation', description: 'transition:persist keeps an open drawer open across ClientRouter navigations.' },
	{ href: '/handle-events/', title: 'Handle, options and events', description: 'Handle cycling, handleOnly, closeThreshold, vetoed Escape and an event log.' },
]

export const unsupported = [
	{ title: 'Modal drawer inside a container', description: 'A modal <dialog> lives in the top layer, so `container` only applies to non-modal drawers.' },
	{ title: 'v-model and slots', description: 'Use the `open` attribute, `show()` / `close()` and the `open-change` event instead.' },
]
