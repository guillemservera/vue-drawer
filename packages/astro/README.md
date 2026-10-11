# @guillemservera/astro-drawer

An ultra-light drawer for Astro: a bottom or top sheet, or a left or right sidebar. It is a custom element around a native modal `<dialog>`, so it ships no framework runtime: about 5.7 KB gzip of JS and 0.7 KB gzip of CSS.

- Opens with `showModal()`: native focus trap, inert page, top layer, and focus returns to the trigger on close.
- Closes on Escape, on backdrop click, and on drag-to-dismiss toward its edge (distance or velocity) from the handle or the content, unless `dismissible="false"`.
- Animates both open and close, and respects `prefers-reduced-motion`.
- Locks background scroll while open, including the iOS Safari body-pin and touch guards. The lock is released when the drawer closes or is removed from the page (for example on a `<ClientRouter />` navigation).
- Snap points and nested drawers, with vue-drawer's rules.
- Safe to import during SSR.

Not supported yet: non-modal drawers and vue-drawer's iOS keyboard input repositioning.

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

The wrapper also takes `direction`, `dismissible`, `snapPoints`, `activeSnapPoint`, `fadeFromIndex` and `snapToSequentialPoint` (same values and defaults as vue-drawer's props) and puts them on `<astro-drawer>` as the attributes below. It renders the handle at the top of a bottom sheet, at the bottom of a top sheet, and not at all for sidebars.

### Snap points

```astro
<Drawer id="sheet" snapPoints={['160px', 0.55, 0.92]} fadeFromIndex={1} aria-label="Details">...</Drawer>
```

As in vue-drawer, snap points go from least to most visible. A number is a fraction of the viewport height (of the viewport width for a right sidebar); a string is a `px` or `rem` length. They apply to bottom sheets and right sidebars; top sheets and left sidebars ignore them. With snap points the sheet spans the whole viewport along its axis and rests translated so only the active snap point shows. A slow release lands on the nearest snap point, a flick moves one snap point, a hard flick skips to the last one or dismisses (`snap-to-sequential-point` limits every release to one snap point), and a drag below the first snap point dismisses unless the drawer is not dismissible. Below the last snap point a swipe toward the open edge expands the sheet; at the last one overflowing content scrolls. The backdrop shows from `fade-from-index`. On open, the dialog focuses its first focusable element and scrolls to it, so keep one near the top of a snap sheet.

### Nested drawers

Put an `<astro-drawer>` (or a `Drawer.astro`) inside another drawer's content and open it with a trigger inside the parent:

```astro
<Drawer id="parent" aria-label="Parent">
  <button data-drawer-open="#child">More</button>
  <Drawer id="child" aria-label="Child">...</Drawer>
</Drawer>
```

The nested drawer stacks above its parent. Escape and backdrop clicks close only the top drawer, and its gestures and `[data-drawer-close]` never reach the parent. Closing the parent in any way (including removing it) closes the drawers above it at once. While open, the nested drawer scales its parent back with the CSS `scale` and `translate` properties, only when both open from the same side (vue-drawer's default `scaleParent`). The `<dialog>` must be a direct child of `<astro-drawer>`.

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
| `snap-points` attribute | Comma-separated snap points, least to most visible: fractions (`0.5`) or lengths (`160px`, `18rem`). Default: none. |
| `active-snap-point` attribute | The snap point it rests on, written like one of `snap-points`. Set it to move the drawer; a drag updates it. It is kept across closes, so it is also the snap point the drawer reopens at. Default: the first snap point. |
| `fade-from-index` attribute | Index of the first snap point that shows the backdrop. Default: the last. |
| `snap-to-sequential-point` attribute | Present: every release moves at most one snap point. |
| `show()` | Opens the drawer. |
| `close()` | Closes the drawer with the close animation. |
| `close` event | Fired on `<astro-drawer>` after the dialog has closed (animated close, Escape, backdrop, drag, `form[method=dialog]`). Not fired when the element is removed from the page while open. |
| `snap-point-change` event | Fired on `<astro-drawer>` when a drag lands on another snap point; `event.detail` is the snap point (number or string). Not fired when you set `active-snap-point`. |
| `data-state="open"` | Set while open; the stylesheet animates from it. |
| `data-backdrop-hidden` | Set while a snap drawer rests below `fade-from-index`; the stylesheet hides the backdrop. |

Inside the drawer:

- `[data-drawer-handle]`: the drag handle. It always starts a drag, even when the sheet is scrolled.
- `[data-drawer-no-drag]`: content that never starts a drag (sliders, maps, ...).
- `[data-drawer-close]`: closes the drawer on click, even when it is not dismissible.

Anywhere on the page:

- `data-drawer-open="<selector>"` on any element opens the matching drawer on click.

Content scrolled away from the drawer's edge keeps the gesture: dragging toward the edge scrolls it back first (for a bottom sheet, content scrolled down; for a top sheet, content not yet scrolled to its end; for sidebars, the same on the horizontal axis). A sheet whose content overflows scrolls natively on touch, so on touch screens it is dismissed from the handle; a sheet that fits can be dragged from anywhere. Sidebars always scroll vertically on touch and are dragged horizontally from anywhere. Give a horizontal scroller inside a sheet `touch-action: pan-x` so vertical swipes on it still drag the sheet.

A `<form method="dialog">` or an Escape press that the browser does not let the page intercept closes the dialog without the animation. A non-dismissible drawer sets `closedby="none"` on the dialog so repeated Escape presses cannot force it closed; browsers without `closedby` support can still close it that way.

Differences from vue-drawer: snap points only on bottom and right drawers, the handle does not cycle snap points on click, the backdrop fades between resting snap points rather than along the drag, a scaled parent does not follow its nested drawer's drag, and there is no `scaleParent`, `closeThreshold`, `container` or `DrawerClose scope="all"`.

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
| `--drawer-easing` | `cubic-bezier(0.32, 0.72, 0, 1)` |
| `--drawer-handle-color` | `rgb(128 128 128 / 0.4)` |

A class passed to `Drawer.astro` lands on the `<dialog>`, so regular CSS can style the sheet directly.

## License

MIT
