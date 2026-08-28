# VueDrawer

A headless, unstyled and behaviorally opinionated drawer primitive for Vue 3 with gestures, snap points, nested drawers and zero runtime dependencies.

VueDrawer extracts the drawer behavior from a production Vue application into a standalone primitive. It owns the hard interaction details while leaving visual design to your app.

## Status

VueDrawer is an initial `0.1.0` release. The API is usable, but still expected to evolve before `1.0`.

## Installation

```bash
npm install @guillemservera/vue-drawer
```

```bash
pnpm add @guillemservera/vue-drawer
```

Zero runtime dependencies. Vue is the only peer dependency. VueDrawer is ESM-only: use `import`; CommonJS `require()` is not supported.

## Quick Start

```vue
<script setup lang="ts">
import { ref } from 'vue'
import {
  DrawerRoot,
  DrawerTrigger,
  DrawerPortal,
  DrawerOverlay,
  DrawerContent,
  DrawerHandle,
  DrawerTitle,
  DrawerDescription,
  DrawerClose,
} from '@guillemservera/vue-drawer'

const open = ref(false)
</script>

<template>
  <DrawerRoot v-model:open="open">
    <DrawerTrigger>Open drawer</DrawerTrigger>

    <DrawerPortal>
      <DrawerOverlay class="fixed inset-0 bg-black/40" />

      <DrawerContent class="fixed inset-x-0 bottom-0 z-50 bg-white p-6">
        <DrawerHandle class="mx-auto h-1.5 w-12 rounded-full bg-zinc-300" />
        <DrawerTitle>Drawer title</DrawerTitle>
        <DrawerDescription>Drawer description</DrawerDescription>
        <DrawerClose>Close</DrawerClose>
      </DrawerContent>
    </DrawerPortal>
  </DrawerRoot>
</template>
```

VueDrawer ships only the functional CSS required for transforms, transitions, touch behavior, scroll locking hooks and state attributes. Bring your own classes, CSS Modules, Tailwind, UnoCSS or design system.

## Features

- Headless and unstyled visual surface.
- Behaviorally opinionated drawer lifecycle.
- Pointer gestures and swipe to close.
- Snap points with controlled active snap point.
- Nested drawers with clean stacking, top-layer dismissal and parent-only depth scaling.
- Mobile-friendly scroll locking and iOS overscroll guards.
- Reka/Radix-inspired dismiss layer without runtime dependencies.
- Escape handling that closes only the top active drawer.
- Modal focus scope with focus loop, focus restoration and outside focus guard.
- Pointer-origin focus restoration avoids a spurious ring without suppressing keyboard `:focus-visible`.
- `aria-hidden` isolation for modal content.
- Preventable outside interaction and autofocus events.
- Data attributes for styling and tests.
- Compatible no-drag hooks: `data-drawer-no-drag` and `data-vaul-no-drag`.

## API

### Components

```ts
import {
  DrawerRoot,
  DrawerRootNested,
  DrawerTrigger,
  DrawerClose,
  DrawerPortal,
  DrawerOverlay,
  DrawerContent,
  DrawerHandle,
  DrawerTitle,
  DrawerDescription,
} from '@guillemservera/vue-drawer'
```

`DrawerRoot` owns state and behavior. `DrawerPortal` teleports overlay/content to `body` by default. `DrawerOverlay` is optional and visual; outside dismissal is handled by the internal dismiss layer so consumers can style, omit or replace the overlay. `DrawerContent` is the dialog surface. `DrawerHandle` cycles snap points on click and owns handle-only gestures when `handleOnly` is enabled. `DrawerClose` closes the current root by default and can close the full nested stack with `scope="all"`. `DrawerTitle` and `DrawerDescription` register accessible IDs for `DrawerContent`.

### Root Props

| Prop | Type | Default |
| --- | --- | --- |
| `open` | `boolean` | `undefined` |
| `defaultOpen` | `boolean` | `false` |
| `modal` | `boolean` | `true` |
| `dismissible` | `boolean` | `true` |
| `instantClose` | `boolean` | `false` |
| `autoFocus` | `boolean` | `false` |
| `handleOnly` | `boolean` | `false` |
| `container` | `string \| HTMLElement \| null` | `null` |
| `repositionInputs` | `boolean` | `true` |
| `fixed` | `boolean` | `false` |
| `preventScroll` | `boolean` | `true` |
| `noBodyStyles` | `boolean` | `false` |
| `animation` | `'slide' \| 'fade'` | `'slide'` |
| `closeAnimation` | `'slide' \| 'fade'` | `'slide'` |
| `direction` | `'top' \| 'bottom' \| 'left' \| 'right'` | `'bottom'` |
| `closeThreshold` | `number` | `0.25` |
| `scrollLockTimeout` | `number` | `500` |
| `nested` | `boolean` | `false` |
| `preventScrollRestoration` | `boolean` | `false` |
| `snapToSequentialPoint` | `boolean` | `false` |
| `snapPoints` | `Array<number \| string>` | `undefined` |
| `activeSnapPoint` | `number \| string \| null` | `undefined` |
| `defaultSnapPoint` | `number \| string \| null` | `null` |
| `fadeFromIndex` | `number` | last snap point |

Use `DrawerRootNested` instead of setting `nested` manually for nested drawers.

### Trigger Props

| Prop | Type | Default |
| --- | --- | --- |
| `as` | `string \| Component` | `'button'` |
| `asChild` | `boolean` | `false` |
| `disabled` | `boolean` | `false` |

### Handle Props

| Prop | Type | Default |
| --- | --- | --- |
| `preventCycle` | `boolean` | `false` |

### Close Props

| Prop | Type | Default |
| --- | --- | --- |
| `as` | `string \| Component` | `'button'` |
| `asChild` | `boolean` | `false` |
| `animation` | `'slide' \| 'fade'` | `undefined` |
| `disabled` | `boolean` | `false` |
| `scope` | `'current' \| 'all'` | `'current'` |

`modal` controls whether outside content is interactive. Modal drawers trap focus, hide outside content from assistive tech, lock page scroll and disable outside pointer interaction. Non-modal drawers leave the page interactive, emit outside interaction events, and stay open while users work with the underlying page.

`dismissible=false` prevents Escape, modal outside pointer, close-direction drag and overlay dismissal from closing the drawer. Use it with controlled state so your app still has an explicit way to close.

`animation` controls the open animation and `closeAnimation` controls normal non-gesture closes. The default matches Vaul's slide-in and slide-out feel, with a shorter close duration than open duration. For example, `animation="fade" closeAnimation="slide"` gives a fade-in and the classic slide-out close. Drag gestures still follow the pointer and close with transform. The fade defaults are intentionally quick (`260ms` in, `180ms` out) with no movement, and can be tuned with CSS variables such as `--drawer-fade-enter-duration`, `--drawer-fade-leave-duration`, `--drawer-fade-ease`, and `--drawer-fade-enter-offset`.

`DrawerTitle` and `DrawerDescription` automatically register generated IDs with `DrawerContent`, which sets `aria-labelledby` and `aria-describedby` unless you provide those attributes yourself. `DrawerTrigger` renders an accessible button with `aria-haspopup="dialog"`, `aria-expanded`, and `aria-controls`. `DrawerClose` renders a button that closes the active root. Inside nested drawers, set `scope="all"` to close the top-level root and let the nested stack clean itself up. Opening a nested drawer adds Vaul-style depth only to the direct parent drawer content; VueDrawer does not scale the page background globally.

`DrawerTrigger` and `DrawerClose` support `as` for changing the rendered element and `asChild` for merging drawer behavior into their only child. Use `asChild` when wrapping a design-system button so the DOM keeps a single interactive element instead of nesting a button inside another button.

```vue
<DrawerTrigger as-child>
  <MyButton>Open drawer</MyButton>
</DrawerTrigger>
```

`preventScroll` controls the document/body scroll-lock layer. Keep it enabled unless your app already owns scroll locking. `noBodyStyles` keeps iOS touch and overscroll guards active, but skips writing positioning styles to `document.body`.

`repositionInputs` keeps focused inputs inside a bottom drawer visible when Mobile Safari changes the visual viewport for the keyboard. `fixed` changes that keyboard behavior by shrinking the drawer height instead of preserving the full drawer height above the keyboard.

`snapPoints` accepts percentages (`0.55`) or pixel/rem strings (`'280px'`, `'18rem'`). Percentage values are resolved against the viewport axis, or against the custom `container` axis when one is provided, matching Vaul's snap point semantics. Values should go from least visible to most visible, for example `['160px', 0.55, 0.92]`. `activeSnapPoint` can be controlled with `v-model:active-snap-point`. `fadeFromIndex` controls when the overlay starts fading in across snap points.

Clicking `DrawerHandle` advances to the next snap point. When the active snap point is the last one, the handle closes a dismissible drawer. Set `preventCycle` on `DrawerHandle` to disable click cycling while keeping the drag affordance.

`snapToSequentialPoint=false` matches Vaul's fast-swipe behavior: a strong close-direction swipe can skip intermediate snap points and close. Set `snapToSequentialPoint=true` when every release should move at most one snap point.

### Root Events

| Event | Payload |
| --- | --- |
| `update:open` | `boolean` |
| `update:activeSnapPoint` | `number \| string \| null` |
| `after-open` | none |
| `after-close` | none |
| `animation-end` | `boolean` |
| `close` | none |
| `drag` | `PointerEvent, number` |
| `release` | `PointerEvent, boolean` |
| `content:error` | `error, instance, info` |

### Content Events

These events are emitted by `DrawerContent`. Outside interaction and autofocus events are cancelable: call `event.preventDefault()` to take control.

| Event | Payload |
| --- | --- |
| `open-auto-focus` | `Event` |
| `close-auto-focus` | `Event` |
| `escape-key-down` | `KeyboardEvent` |
| `pointer-down-outside` | `CustomEvent<{ originalEvent: PointerEvent }>` |
| `focus-outside` | `CustomEvent<{ originalEvent: FocusEvent }>` |
| `interact-outside` | `pointer-down-outside \| focus-outside` |

```vue
<DrawerContent
  @pointer-down-outside="(event) => {
    if (hasUnsavedChanges) event.preventDefault()
  }"
  @escape-key-down="(event) => {
    if (isBusy) event.preventDefault()
  }"
  @open-auto-focus="(event) => {
    event.preventDefault()
    searchInput?.focus()
  }"
/>
```

### Types

```ts
import type {
  DrawerDirection,
  DrawerAnimation,
  DrawerCloseScope,
  DrawerFocusOutsideEvent,
  DrawerHandleProps,
  DrawerInteractOutsideEvent,
  DrawerPointerDownOutsideEvent,
  DrawerPrimitiveAs,
  DrawerRootProps,
  DrawerRootEmits,
  DrawerSnapPoint,
  DrawerPortalTarget,
} from '@guillemservera/vue-drawer'
```

## Accessibility

VueDrawer implements the dialog behavior internally instead of depending on Reka/Radix:

- `DrawerContent` renders `role="dialog"`.
- Modal content receives `aria-modal="true"`.
- `DrawerTitle` and `DrawerDescription` wire `aria-labelledby` and `aria-describedby`.
- `DrawerTrigger` exposes `aria-haspopup`, `aria-expanded` and `aria-controls`.
- Modal drawers hide outside DOM siblings with `aria-hidden`.
- Focus is kept inside the active modal drawer.
- Tab and Shift+Tab loop through focusable content.
- Focus returns to the previously focused element on close unless close autofocus is prevented.
- Escape only targets the top active drawer.

Provide a visible `DrawerTitle` whenever possible. If your UI needs a visually hidden label, render your own visually-hidden title inside `DrawerTitle`.

```vue
<DrawerContent aria-label="Account filters">
  <!-- aria-label disables automatic aria-labelledby fallback -->
</DrawerContent>
```

## Dismissal And Overlay

`DrawerOverlay` is a styling hook, not a required dialog dependency. The actual outside click/focus handling lives in the internal dismiss layer, which tracks the top active drawer. This keeps nested drawers predictable and lets consumers customize the overlay freely.

For `modal=false`, outside pointer and focus events are still emitted but do not close the drawer by default.

```vue
<DrawerRoot v-model:open="open">
  <DrawerPortal>
    <DrawerOverlay class="fixed inset-0 bg-black/40" />
    <DrawerContent class="fixed inset-x-0 bottom-0">
      ...
    </DrawerContent>
  </DrawerPortal>
</DrawerRoot>
```

To prevent outside dismissal for a specific case, use the content event:

```vue
<DrawerContent @pointer-down-outside="$event.preventDefault()" />
```

To disable all implicit dismissal, use the root prop:

```vue
<DrawerRoot :dismissible="false" v-model:open="open">
  ...
</DrawerRoot>
```

## Scroll And iOS

VueDrawer has two scroll-lock paths:

- Desktop and non-iOS browsers use document overflow locking and scrollbar compensation.
- Mobile Safari uses body fixed positioning, touch guards, edge-bounce prevention and input repositioning. It intentionally avoids forcing `html/body { overflow: hidden }` on iOS because that path causes Safari keyboard and browser-chrome issues.

For scrollable content inside the drawer, mark the scrollable element:

```vue
<DrawerContent class="fixed inset-x-0 bottom-0 h-[85dvh]">
  <div data-drawer-scroll-axis="y" class="h-full overflow-y-auto">
    ...
  </div>
</DrawerContent>
```

For controls that must own touch gestures, use `data-drawer-no-drag` or the Vaul-compatible `data-vaul-no-drag`:

```vue
<div data-drawer-no-drag>
  <input type="range" />
</div>
```

Use `preventScroll=false` only when your application already owns scroll locking. Use `noBodyStyles=true` only when an app shell already owns body positioning; iOS touch and overscroll guards remain active, but VueDrawer skips writing body position styles.

## Styling

VueDrawer uses neutral classes and data attributes:

- `[data-drawer-content]`
- `[data-drawer-overlay]`
- `[data-drawer-handle]`
- `[data-state="open" | "closed"]`
- `[data-direction="top" | "bottom" | "left" | "right"]`
- `[data-dragging="true" | "false"]`
- `[data-snap-points="true" | "false"]`
- `[data-snap-points-overlay="true" | "false"]`
- `[data-active-snap-point-index]`

The package CSS intentionally does not include colors, shadows, borders, spacing, border radius or typography.

For percentage snap points, size the drawer content along the snap axis so it can cover the largest requested snap point, for example a bottom drawer with `height: min(100dvh, 720px)` or a full-height side drawer.

Animation can be tuned with CSS variables on your drawer content and overlay:

| Variable | Default |
| --- | --- |
| `--drawer-duration` | `420ms` |
| `--drawer-duration-ms` | `420` |
| `--drawer-ease` | `cubic-bezier(0.32, 0.72, 0, 1)` |
| `--drawer-close-duration` | `260ms` |
| `--drawer-close-duration-ms` | `260` |
| `--drawer-close-ease` | `var(--drawer-ease)` |
| `--drawer-offscreen-offset` | `24px` |
| `--drawer-fade-enter-duration` | `260ms` |
| `--drawer-fade-leave-duration` | `180ms` |
| `--drawer-fade-ease` | `cubic-bezier(0.2, 0, 0, 1)` |
| `--drawer-fade-enter-offset` | `0px` |

`--drawer-duration` and `--drawer-duration-ms` should represent the same value; the `ms` variant is used by gesture-driven inline transitions. The same applies to `--drawer-close-duration` and `--drawer-close-duration-ms`.

When page scroll is locked on desktop, VueDrawer keeps the lock active until the close transition finishes, sets `--vuedrawer-scrollbar-width` on `:root`, and compensates `document.body` padding so fixed layouts do not jump. If the host page uses `scrollbar-gutter: stable`, VueDrawer temporarily normalizes the root gutter while locked so the scrollbar space is not reserved twice.

## Examples

Copyable examples are available in `examples/`.

The examples use Tailwind CSS for demonstration only. VueDrawer does not ship visual styles and does not depend on Tailwind.

The local playground includes:

- Basic bottom drawer
- Right side drawer
- Snap points
- Nested drawers
- Scrollable content
- Form inside drawer
- Non-modal drawer
- No-drag zones
- Styled / Unstyled toggle

## Local Development

```bash
pnpm install
pnpm dev
pnpm test
pnpm typecheck
pnpm build
```

The playground lives in `playground/` and is not published to npm. It imports VueDrawer with the public package name, `@guillemservera/vue-drawer`; the playground Vite config aliases that name to `src/index.ts`.

## License

MIT (c) 2026 Guillem Servera
