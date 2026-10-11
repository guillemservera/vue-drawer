// The /demos/ index renders these lists. Add a page under src/pages/ and an entry here.
export const demos = [
	{ href: '/basic-bottom/', title: 'Basic bottom', description: 'Escape, backdrop, drag-to-dismiss and a Done button.' },
	{ href: '/side-drawers/', title: 'Side drawers', description: 'Right, left and top sheets.' },
	{ href: '/no-drag-zones/', title: 'No-drag zones', description: 'A slider and a horizontal strip that own their gestures.' },
	{ href: '/non-dismissible/', title: 'Non-dismissible', description: 'Only the explicit button closes it.' },
	{ href: '/scroll-body/', title: 'Scroll body', description: 'Long content in a bottom sheet and a left sidebar.' },
	{ href: '/form-drawer/', title: 'Form drawer', description: 'Inputs and a select; the first input is focused on open.' },
]

export const unsupported = [
	{ title: 'Non-modal drawer', description: 'The drawer is always a modal <dialog>.' },
	{ title: 'Input repositioning', description: 'The iOS keyboard repositioning from vue-drawer is not ported.' },
]
