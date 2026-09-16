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

it('keeps GPU layer hints off settled content so text keeps subpixel antialiasing', () => {
  const base = drawerCss.match(/\n\.drawer-content \{[^}]*\}/)?.[0] ?? ''
  expect(base).not.toContain('will-change')
  expect(base).not.toContain('backface-visibility')
  expect(base).not.toContain('translate3d')
  const overlay = drawerCss.match(/\n\.drawer-overlay \{\n\topacity[^}]*\}/)?.[0] ?? ''
  expect(overlay).toContain('opacity: var(--drawer-rest-overlay-opacity, 1);')
  expect(overlay).not.toContain('will-change')
  for (const direction of ['top', 'left', 'right']) {
    const rule = drawerCss.match(new RegExp(`\\n\\.drawer-content\\[data-direction='${direction}'\\] \\{[^}]*\\}`))?.[0] ?? ''
    expect(rule).toContain('translate(')
    expect(rule).not.toContain('translate3d')
  }
  expect(drawerCss).toMatch(/\.drawer-content-enter-active,\s*\.drawer-content-leave-active,\s*\.drawer-content-leave-active--slide,\s*\.drawer-content-leave-active--fade,\s*\.drawer-content--dragging \{\s*will-change: transform;/)
})
