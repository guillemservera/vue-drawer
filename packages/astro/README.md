# @guillemservera/astro-drawer

An ultra-light drawer for Astro: a bottom or top sheet, or a left or right sidebar. It is a custom element around a native modal `<dialog>`, so it ships no framework runtime: about 9 KB gzip of JS and 1.1 KB gzip of CSS for the whole feature set (vue-drawer's options and events, without Vue).

- Opens with `showModal()`: native focus trap, inert page, top layer, and focus returns to the trigger on close.
- Closes on Escape, on backdrop click, and on drag-to-dismiss toward its edge (distance or velocity) from the handle or the content, unless `dismissible="false"`.
- Animates both open and close. Under `prefers-reduced-motion` the transitions are off; a sheet with `data-reduced-motion="fade"` cross-fades in place instead (vue-drawer's per-drawer opt-in).
- Locks background scroll while open, including the iOS Safari body-pin and touch guards. The lock is released when the drawer closes or is removed from the page (for example on a `<ClientRouter />` navigation).
- Snap points on every side, nested drawers, handle cycling, non-modal drawers, a fade animation, and vue-drawer's events and options (see the API table).
- Keeps a focused input above the iOS keyboard.
- Safe to import during SSR.

It follows vue-drawer's behavior on purpose; see [Differences from vue-drawer](#differences-from-vue-drawer) for the few places it cannot.

## Install

```sh
npm install @guillemservera/astro-drawer
```

Requires Astro 7.

## Usage

```astro
---
import Drawer from '@guillemservera/astro-drawer/Drawer.astro'
---

<button data-drawer-open="#menu">Open menu</button>

<Drawer id="menu" aria-labelledby="menu-title">
  <h2 id="menu-title">Menu</h2>
  <p>Drawer content.</p>
</Drawer>
```

`Drawer.astro` renders the markup, includes the stylesheet and loads the element. `id` and `open` go on the `<astro-drawer>` element; every other attribute (`aria-label`, `aria-labelledby`, `class`, ...) goes on the `<dialog>`, which is the visible sheet. Give the drawer an accessible name with `aria-labelledby` or `aria-label`.

A sidebar, and a drawer that only closes from an explicit action:

```astro
<Drawer id="nav" direction="left" aria-label="Navigation">...</Drawer>

<Drawer id="confirm" dismissible={false} aria-label="Confirm">
  <button data-drawer-close>Confirm</button>
</Drawer>
```

The wrapper also takes `direction`, `dismissible`, `modal`, `snapPoints`, `activeSnapPoint`, `defaultSnapPoint`, `fadeFromIndex`, `snapToSequentialPoint`, `instantClose`, `autoFocus`, `handleOnly`, `repositionInputs`, `fixed`, `container`, `preventScroll`, `noBodyStyles`, `preventScrollRestoration`, `animation`, `closeAnimation`, `closeThreshold`, `scrollLockTimeout` and `scaleParent` (same names, values and defaults as vue-drawer's props) and puts them on `<astro-drawer>` as the attributes below. It renders the handle at the top of a bottom sheet, at the bottom of a top sheet, and not at all for sidebars.

### Snap points

```astro
<Drawer id="sheet" snapPoints={['160px', 0.55, 0.92]} fadeFromIndex={1} aria-label="Details">...</Drawer>
```

As in vue-drawer, snap points go from least to most visible. A number is a fraction of the viewport height (of the viewport width for a right sidebar); a string is a `px` or `rem` length. They apply to every direction. With snap points the sheet spans the whole viewport along its axis and rests translated so only the active snap point shows. A slow release lands on the nearest snap point, a flick moves one snap point, a hard flick skips to the last one or dismisses (`snap-to-sequential-point` limits every release to one snap point), and a drag below the first snap point dismisses unless the drawer is not dismissible. Below the last snap point a swipe toward the open edge expands the sheet; at the last one overflowing content scrolls. The backdrop shows from `fade-from-index`. `default-snap-point` picks the one it first opens at, and a tap on the handle moves to the next snap point (a tap on the last one closes it; add `data-prevent-cycle` to a handle to turn that off).

### Nested drawers

Put an `<astro-drawer>` (or a `Drawer.astro`) inside another drawer's content and open it with a trigger inside the parent:

```astro
<Drawer id="parent" aria-label="Parent">
  <button data-drawer-open="#child">More</button>
  <Drawer id="child" aria-label="Child">...</Drawer>
</Drawer>
```

The nested drawer stacks above its parent. Escape and backdrop clicks close only the top drawer, and its gestures and `[data-drawer-close]` never reach the parent (`data-drawer-close="all"` closes the whole chain). Closing the parent in any way (including removing it) closes the drawers above it at once. While open, the nested drawer scales its parent back with the CSS `scale` and `translate` properties, only when both open from the same side unless `scale-parent` forces it (`"true"`) or stops it (`"false"`). The `<dialog>` must be a direct child of `<astro-drawer>`.

### Non-modal drawers and `container`

`modal="false"` opens with `show()` instead of `showModal()`: no backdrop, no focus trap, no scroll lock, and the page stays interactive. An outside press or focus announces `pointer-down-outside`, `focus-outside` and `interact-outside` but does not close it; Escape closes the topmost one. `container="#panel"` moves a non-modal drawer into that element and measures its snap points against it (the container needs `position: relative`). A modal drawer lives in the top layer, so `container` does not apply to it.


### With `<ClientRouter />`

A drawer that is removed from the page by a navigation releases its scroll lock and focus guards, and no `close` event fires, like unmounting a Vue drawer. To keep an open drawer open across navigations, wrap it in an element with `transition:persist` (the directive does not go through a component to the custom element):

```astro
<div transition:persist="menu">
  <Drawer id="menu" aria-label="Menu">...</Drawer>
</div>
```

The router moves the element, so it connects again already open: it is shown in place, without the opening animation (like vue-drawer's `defaultOpen`), and `after-open` and `open-auto-focus` fire again. A drawer that is rendered with `open` appears in place the same way.

### Without the wrapper

Without the wrapper, write the markup yourself and import the element and the CSS:

```html
<astro-drawer id="menu">
  <dialog aria-label="Menu">
    <div data-drawer-handle></div>
    ...
  </dialog>
</astro-drawer>

<script>
  import '@guillemservera/astro-drawer'
  import '@guillemservera/astro-drawer/style.css'
</script>
```

## API

`<astro-drawer>`

| Member | Description |
| --- | --- |
| `open` attribute / property | Present (or `true`) while the drawer is open. Set it to open, remove it to close. |
| `direction` attribute | `bottom` (default), `top`, `left` or `right`: the edge the drawer slides in from and is dragged back to. |
| `dismissible` attribute | `"false"` stops Escape, backdrop click and drag from closing the drawer. `close()`, the `open` attribute and `[data-drawer-close]` still close it. Default: dismissible. |
| `modal` attribute | `"false"` makes it a non-modal drawer (see above). Default: modal. |
| `snap-points` attribute | Comma-separated snap points, least to most visible: fractions (`0.5`) or lengths (`160px`, `18rem`). Default: none. |
| `active-snap-point` attribute | The snap point it rests on, written like one of `snap-points`. Set it to move the drawer; a drag updates it. It is kept across closes, so it is also the snap point the drawer reopens at. Default: the first snap point. |
| `fade-from-index` attribute | Index of the first snap point that shows the backdrop. Default: the last. |
| `default-snap-point` attribute | The snap point it first opens at. Default: the first. |
| `snap-to-sequential-point` attribute | Present: every release moves at most one snap point. |
| `animation` / `close-animation` attributes | `slide` (default) or `fade`, for opening and closing. A drag always closes with the slide. A `[data-drawer-close]` can pick its own with `data-drawer-animation="fade"`. |
| `instant-close` attribute | Present: skip the close animation. |
| `auto-focus` attribute | Present: once the open transition is over (after `open-auto-focus`, unless that was prevented) focus moves to the first focusable control. By default the sheet itself keeps focus, like vue-drawer. |
| `handle-only` attribute | Present: only `[data-drawer-handle]` starts a drag. |
| `close-threshold` attribute | Fraction of the drawer a slow drag must cover to close it. Default `0.25`. |
| `scroll-lock-timeout` attribute | Milliseconds after a scroll attempt during which a drag stays a scroll. Default `500`. |
| `scale-parent` attribute | `"true"` / `"false"`: force a nested drawer's parent to step back, or not. |
| `container` attribute | Selector of the element a non-modal drawer lives in. |
| `prevent-scroll`, `no-body-styles`, `prevent-scroll-restoration` attributes | vue-drawer's `preventScroll` (`"false"` leaves the page scrollable), `noBodyStyles` (the app owns the document and body styles: no `overflow` lock and no `position: fixed` pin; only the iOS overscroll and touch guards remain) and `preventScrollRestoration`. |
| `reposition-inputs`, `fixed` attributes | `"false"` turns off keeping a focused input above the iOS keyboard (bottom modal sheets). With `fixed` the sheet shrinks instead of rising. |
| `show()` | Opens the drawer. |
| `close()` | Closes the drawer with the close animation. |
| `open-change` event | `detail` is the new open state. Also fires when you set or remove `open`. |
| `close` event | Fired with the `open-change` to `false`, as soon as the drawer starts closing (Escape, backdrop, drag, `close()`, `form[method=dialog]`), like vue-drawer. Not fired when the element is removed from the page while open. |
| `after-open`, `after-close`, `animation-end` events | Once the open or close transition has finished (only for a real open or close, not for an option that changes on an open drawer). `animation-end`'s `detail` is the open state. |
| `snap-point-change` event | Fired on `<astro-drawer>` when a drag or the handle lands on another snap point; `event.detail` is the snap point (number or string). Not fired when you set `active-snap-point`. |
| `drag`, `release` events | While dragging, `detail` is `{ originalEvent, percentageDragged }`; on release, `{ originalEvent, open }`. |
| `escape-key-down`, `pointer-down-outside`, `focus-outside`, `interact-outside` events | Cancelable (`preventDefault()`): the first keeps it open on Escape, the other three keep it open on an outside press or focus. |
| `open-auto-focus` event | Cancelable; fired once the open transition is over, right after `after-open`, like vue-drawer. With `auto-focus`, `preventDefault()` keeps focus on the sheet instead of moving it to the first control; or focus your own element in the handler. A native modal always holds focus inside it, so focus cannot stay on the trigger. |
| `close-auto-focus` event | Cancelable; fired after focus has returned to the trigger on close. Focus the element you want inside the handler; with `preventDefault()` and no focus call of your own, nothing is left focused. |
| `data-state="open"` | Set while open; the stylesheet animates from it. |
| `data-backdrop-hidden` | Set while a snap drawer rests below `fade-from-index`; the stylesheet hides the backdrop. |

Inside the drawer:

- `[data-drawer-handle]`: the drag handle. It always starts a drag, even when the sheet is scrolled.
- `[data-drawer-no-drag]`: content that never starts a drag (sliders, maps, ...).
- `[data-drawer-close]`: closes the drawer on click, even when it is not dismissible. `data-drawer-close="all"` closes this drawer and every drawer it is nested in.
- `[data-drawer-title]`, `[data-drawer-description]`: name and describe the dialog (`aria-labelledby`, `aria-describedby`) unless it already has them.
- `data-prevent-cycle` on a handle: a tap does not move to the next snap point.
- `[data-drawer-branch]`: UI that belongs to the drawer but lives elsewhere (a menu you render next to the sheet). An Escape or an outside press that starts inside it is not the drawer's, and a non-modal drawer does not announce it as outside. A modal sheet still makes the rest of the page inert, so a branch has to be rendered inside the sheet to be usable.

Anywhere on the page:

- `data-drawer-open="<selector>"` on any element opens the matching drawer on click (unless a handler prevented the click) and gets `aria-haspopup`, `aria-controls` (the `<dialog>`, which gets an `id` if it has none) and `aria-expanded`.

Events do not bubble: listen on the `<astro-drawer>` itself.

Content scrolled away from the drawer's edge keeps the gesture: dragging toward the edge scrolls it back first (for a bottom sheet, content scrolled down; for a top sheet, content not yet scrolled to its end; for sidebars, the same on the horizontal axis). A sheet whose content overflows scrolls natively on touch, so on touch screens it is dismissed from the handle; a sheet that fits can be dragged from anywhere. Sidebars always scroll vertically on touch and are dragged horizontally from anywhere. Give a horizontal scroller inside a sheet `touch-action: pan-x` so vertical swipes on it still drag the sheet.

A `<form method="dialog">` closes the dialog without the animation. Escape is handled on the keydown (and canceled there), so a vetoed `escape-key-down` holds on every press; a non-dismissible drawer also sets `closedby="none"` on the dialog.

## Differences from vue-drawer

- There is no `v-model` or slot API: set the `open` attribute, call `show()` / `close()`, or use `data-drawer-open` and `data-drawer-close`, and listen to `open-change`.
- A modal drawer lives in the top layer, so `container` only applies to `modal="false"` drawers.
- Under `prefers-reduced-motion` every transition is off by default (vue-drawer keeps sliding unless a sheet carries `data-reduced-motion="fade"`); the same opt-in cross-fades here.
- A modal drawer is in the top layer and makes everything outside it inert: UI portalled out of the sheet (a date picker that renders into `<body>`) cannot be used. Render it inside the sheet, or use `modal="false"`, which is also the way to have a drawer inside a `container`.
- A non-modal drawer stays where you put it in the DOM (vue-drawer portals to `<body>`): inside a transformed or scaled ancestor it is laid out against that ancestor.
- The title and description links are made when the drawer connects: if you swap the `[data-drawer-title]` element later, keep an element with a stable id or set `aria-labelledby` yourself.
- `modal`, `prevent-scroll`, `no-body-styles`, `reposition-inputs`, `fixed` and `container` are read when the drawer opens; changing them on an open drawer takes effect on its next opening. Everything else (`dismissible`, snap points, `direction`, ...) is read live.
- Focus: a native modal always takes focus, so the sheet itself takes it on open (a transient `inert` keeps the browser from focusing and scrolling to the first control), and focus returns to the trigger on every close, also after a swipe or an outside press, where vue-drawer leaves it alone. The native `autofocus` attribute on a control is applied by the browser while the sheet opens, before `open-auto-focus`: use `auto-focus` instead.
- While the on-screen keyboard is up, a bottom sheet with snap points sits at its fully open position (vue-drawer keeps the snap offset) and goes back on blur. The Safari root-viewport correction while the body is pinned, and vue-drawer's `touchend`, window blur and `visibilitychange` fallbacks for stuck gestures, are not ported.
- A press on the backdrop dismisses on its click, not on pointer down.
- The page scroll lock is shared between bundles through a `globalThis` key, but the iOS body pin is not: do not mix this package with `@guillemservera/vue-drawer` on one page.
- Nothing here has been checked on a real iOS Safari device; the iOS paths are exercised with WebKit in Playwright.

## Styling

`style.css` only sets layout, the sheet transform and the backdrop. Override these custom properties on `astro-drawer` (or on `:root`). Top sheets and sidebars use their own radius and padding defaults (rounded on the inner edge, safe-area aware):

| Property | Default |
| --- | --- |
| `--drawer-background` | `Canvas` |
| `--drawer-color` | `CanvasText` |
| `--drawer-backdrop` | `rgb(0 0 0 / 0.4)` |
| `--drawer-radius` | `1rem 1rem 0 0` |
| `--drawer-padding` | `0 1rem max(1rem, env(safe-area-inset-bottom))` |
| `--drawer-max-width` | `100%` |
| `--drawer-width` | `min(20rem, 85vw)` (sidebars) |
| `--drawer-max-height` | `90dvh` |
| `--drawer-duration` | `0.5s` |
| `--drawer-ease` | `cubic-bezier(0.32, 0.72, 0, 1)` |
| `--drawer-close-duration` | `--drawer-duration` |
| `--drawer-close-ease` | `--drawer-ease` |
| `--drawer-fade-enter-duration`, `--drawer-fade-leave-duration` | `260ms`, `180ms` (the fade animation) |
| `--drawer-fade-ease` | `cubic-bezier(0.2, 0, 0, 1)` |
| `--drawer-z-index` | `50` (non-modal drawers; each newly opened one stacks above the previous) |
| `--drawer-handle-color` | `rgb(128 128 128 / 0.4)` |

A class passed to `Drawer.astro` lands on the `<dialog>`, so regular CSS can style the sheet directly.

## License

MIT
