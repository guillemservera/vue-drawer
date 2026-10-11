# Drawer monorepo

This monorepo holds the drawer packages. The Vue 3 drawer, a headless and unstyled primitive with gestures, snap points and nested drawers, is published to npm as `@guillemservera/vue-drawer`. A private core package contains the framework-agnostic drawer logic that the other packages bundle, and an Astro drawer built on custom elements is in progress.

| Package | Published | Path | Purpose |
| --- | --- | --- | --- |
| `@guillemservera/vue-drawer` | Yes (npm) | `packages/vue` | Headless, unstyled drawer for Vue 3. |
| `@guillemservera/drawer-core` | No (private) | `packages/core` | Framework-agnostic drawer logic, bundled into the other packages. |
| `@guillemservera/astro-drawer` | Not yet (in progress) | `packages/astro` | Lightweight Astro drawer built on custom elements. |

For Vue usage, see the [Vue package README](packages/vue/README.md).

## Development

Install dependencies with `pnpm install`. Node.js and pnpm versions, the pull request workflow and release steps are in [CONTRIBUTING.md](CONTRIBUTING.md).

- `pnpm dev`: starts the Vue playground.
- `pnpm test`: runs the tests of every package.
- `pnpm run ci`: runs each package's `ci` script one after another (typecheck, tests, build, publint and package dry run for the Vue package).
