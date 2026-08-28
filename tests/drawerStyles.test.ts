import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { expect, it } from 'vitest'

const drawerCss = readFileSync(resolve(process.cwd(), 'src/styles/drawer.css'), 'utf8')

it('preserves keyboard focus-visible when suppressing pointer-origin return focus rings', () => {
  expect(drawerCss).toContain("[data-drawer-return-focus='true']:not(:focus-visible)")
})
