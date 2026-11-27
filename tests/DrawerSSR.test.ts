import { createSSRApp, h, nextTick } from 'vue'
import { renderToString } from 'vue/server-renderer'
import { expect, it, vi } from 'vitest'
import { DrawerContent, DrawerOverlay, DrawerPortal, DrawerRoot } from '../src'

it('renders an open controlled drawer at rest and hydrates the same surfaces', async () => {
	const onAnimationEnd = vi.fn()
	const app = () => createSSRApp(() => h(DrawerRoot, { open: true, preventScroll: false, onAnimationEnd }, () =>
		h(DrawerPortal, { to: '#ssr-drawer-target' }, () => [
			h(DrawerOverlay),
			h(DrawerContent, { id: 'ssr-drawer', 'aria-label': 'Test drawer' }),
		])))
	const context: { teleports?: Record<string, string> } = {}
	const html = await renderToString(app(), context)
	const container = document.body.appendChild(document.createElement('div'))
	const target = document.body.appendChild(document.createElement('div'))
	target.id = 'ssr-drawer-target'
	container.innerHTML = html
	target.innerHTML = context.teleports![`#${target.id}`]
	const selectors = ['[data-drawer-content]', '[data-drawer-overlay]']
	const surfaces = selectors.map(selector => target.querySelector(selector)!)
	const client = app()
	try {
		for (const surface of surfaces) {
			expect(surface.getAttribute('data-state')).toBe('open')
			expect(surface.className).not.toMatch(/enter-(from|active)/)
			expect(surface.hasAttribute('inert')).toBe(false)
		}
		client.mount(container)
		await nextTick()
		for (const [index, surface] of surfaces.entries()) {
			expect(target.querySelector(selectors[index]!)).toBe(surface)
			expect(surface.className).not.toMatch(/enter-(from|active)/)
		}
		expect(onAnimationEnd).not.toHaveBeenCalled()
		client.unmount()
	}
	finally {
		container.remove()
		target.remove()
	}
})
