# Implementation Notes

These notes record implementation details and unresolved browser behavior. They are not consumer guidance or API guarantees.

## Safari browser chrome tint

### Confirmed behavior

Safari 26 derives the color behind its bottom browser controls from fixed or sticky content at the viewport edge. The opaque surface should therefore be applied directly to the fixed `DrawerContent`, not only to an inner panel.

WebKit's fixed-container edge detection treats a full-width fixed element as viewport-sized when its height is approximately 90–105% of the viewport. For viewport-sized, dimming, and sidebar candidates, WebKit can prefer the previously detected edge color. This threshold can preserve an existing color, but it does not by itself determine which color Safari selects.

A normal application shell sized with `100dvh` is not independently a fixed-edge candidate. It can become relevant indirectly when scroll locking changes `body` to `position: fixed`.

### Archivo observations

The Archivo settings drawer originally left Safari's bottom browser controls using the page color. The original composition had:

- a transparent fixed drawer content element;
- the opaque surface on an inner panel;
- an initial bottom transform beyond `100%` using the safe-area inset and a `24px` offscreen offset;
- iOS scroll locking that fixes `body`.

Applying the surface directly to the fixed content and using `min(82dvh, 720px)` colors Safari correctly. The height is an application-level workaround currently verified in Archivo, not a general VueDrawer requirement.

A masked fixed `12px` color sampler also worked, but it was delayed and imposed presentation behavior, so it was removed.

Vaul colors Safari correctly with drawers taller than 90% of the viewport. Vaul also differs in two relevant ways: its fixed content owns the surface directly, and its closed transform stops at exactly `100%`. Therefore the viewport-height threshold is not a complete explanation.

### Unresolved cause

The missing controlled case is the combination of:

1. an opaque surface directly on fixed content;
2. a drawer at or above 90% viewport height;
3. an initial transform of exactly `100%`, without the safe-area or extra offscreen offset.

Previous experiments changed the direct surface and exact `100%` transform separately, so they did not isolate this combination.

If that combination still fails, the next likely difference is lifecycle order: Vue's transition and body-position lock may let WebKit cache the page or overlay color before the drawer reaches the edge, while Vaul mounts Radix content before its React effect applies body positioning.

### Package policy

VueDrawer remains headless:

- do not impose colors or a maximum drawer height;
- do not add a Safari-only tint sampler to core;
- treat the 90–105% range as an implementation clue, not a public sizing rule;
- promote guidance to the README only after the combined case above establishes the cause.
