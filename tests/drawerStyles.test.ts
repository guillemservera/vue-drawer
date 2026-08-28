import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { expect, it } from 'vitest'

const drawerCss = readFileSync(resolve(process.cwd(), 'src/styles/drawer.css'), 'utf8')

it('preserves keyboard focus-visible when suppressing pointer-origin return focus rings', () => {
  expect(drawerCss).toContain("[data-drawer-return-focus='true']:not(:focus-visible)")
})

it('uses Vaul-compatible 500ms slide timing for drawer and overlay motion', () => {
  expect(drawerCss).toContain('--drawer-duration: 500ms;')
  expect(drawerCss).toContain('--drawer-duration-ms: 500;')
  expect(drawerCss).toContain('--drawer-close-duration: 500ms;')
  expect(drawerCss).toContain('--drawer-close-duration-ms: 500;')
  expect(drawerCss).toContain('transition: opacity var(--drawer-duration, 500ms) var(--drawer-ease);')
})
