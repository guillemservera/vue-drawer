// jsdom has no modal dialog support: emulate just the open state and the async `close` event.
// Skipped in the node-environment SSR test, which must run without DOM globals.
if (typeof HTMLDialogElement !== 'undefined') {
	const dialog = HTMLDialogElement.prototype

	dialog.showModal ??= function (this: HTMLDialogElement) {
		this.setAttribute('open', '')
	}

	dialog.close ??= function (this: HTMLDialogElement) {
		if (!this.open) return
		this.removeAttribute('open')
		queueMicrotask(() => this.dispatchEvent(new Event('close')))
	}

	if (typeof globalThis.PointerEvent === 'undefined') {
		globalThis.PointerEvent = MouseEvent as typeof PointerEvent
	}

	Object.defineProperty(window, 'scrollTo', { configurable: true, value: () => {} })
}
