// @vitest-environment node
import { expect, it } from 'vitest'

it('imports in Node without DOM globals', async () => {
	expect(typeof globalThis.HTMLElement).toBe('undefined')
	const module = await import('../src/index')
	expect(typeof module.AstroDrawer).toBe('function')
})
