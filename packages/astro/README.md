# @guillemservera/astro-drawer

An ultra-light drawer for Astro: a bottom or top sheet, or a left or right sidebar. It is a custom element around a native modal `<dialog>`, so it ships no framework runtime: about 4 KB gzip of JS and 0.6 KB gzip of CSS.

- Opens with `showModal()`: native focus trap, inert page, top layer, and focus returns to the trigger on close.
- Closes on Escape, on backdrop click, and on drag-to-dismiss toward its edge (distance or velocity) from the handle or the content, unless `dismissible="false"`.
- Animates both open and close, and respects `prefers-reduced-motion`.
- Locks background scroll while open, including the iOS Safari body-pin and touch guards. The lock is released when the drawer closes or is removed from the page (for example on a `<ClientRouter />` navigation).
- Safe to import during SSR.

Not supported yet: snap points, nested drawers, non-modal drawers, and vue-drawer's iOS keyboard input repositioning.

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

The wrapper also takes `direction` and `dismissible` (same values and defaults as vue-drawer's props) and puts them on `<astro-drawer>`. It renders the handle at the top of a bottom sheet, at the bottom of a top sheet, and not at all for sidebars.

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
| `show()` | Opens the drawer. |
| `close()` | Closes the drawer with the close animation. |
| `close` event | Fired on `<astro-drawer>` after the dialog has closed (animated close, Escape, backdrop, drag, `form[method=dialog]`). Not fired when the element is removed from the page while open. |
| `data-state="open"` | Set while open; the stylesheet animates from it. |

Inside the drawer:

- `[data-drawer-handle]`: the drag handle. It always starts a drag, even when the sheet is scrolled.
- `[data-drawer-no-drag]`: content that never starts a drag (sliders, maps, ...).
- `[data-drawer-close]`: closes the drawer on click, even when it is not dismissible.

Anywhere on the page:

- `data-drawer-open="<selector>"` on any element opens the matching drawer on click.

Content scrolled away from the drawer's edge keeps the gesture: dragging toward the edge scrolls it back first (for a bottom sheet, content scrolled down; for a top sheet, content not yet scrolled to its end; for sidebars, the same on the horizontal axis). A sheet whose content overflows scrolls natively on touch, so on touch screens it is dismissed from the handle; a sheet that fits can be dragged from anywhere. Sidebars always scroll vertically on touch and are dragged horizontally from anywhere. Give a horizontal scroller inside a sheet `touch-action: pan-x` so vertical swipes on it still drag the sheet.

A `<form method="dialog">` or an Escape press that the browser does not let the page intercept closes the dialog without the animation. A non-dismissible drawer sets `closedby="none"` on the dialog so repeated Escape presses cannot force it closed; browsers without `closedby` support can still close it that way.

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
