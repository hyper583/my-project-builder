# Design System Master File

> **LOGIC:** When building a specific page, first check `design-system/my-project-builder/pages/[page-name].md`.
> If that file exists, its rules **override** this Master file.
> If not, strictly follow the rules below.

---

**Project:** My Project Builder
**Revised:** 2026-08-19 — premium redesign
**Category:** Academic SaaS workspace (research / university)
**Design Dials:** Variance 5/10 (Balanced) | Motion 4/10 (Standard) | Density 7/10 (Dense)

> This supersedes the original generated system (Variance 3 / Motion 2 / Density 4),
> which produced a correct but visually flat result: every surface a bordered
> rectangle, no elevation, no user theme control.

---

## Direction

A fusion of three sources. Each contributes one layer and nothing else:

| Layer | Source | Contribution |
|---|---|---|
| **Structure** | Swiss Modernism 2.0 | 12-column grid, 8px mathematical spacing, hairline rules, **single accent**, minimal decoration |
| **Character** | Institutional academic | Ink navy + brass, EB Garamond display type, gravity, generous measure |
| **Craft** | Modern product software | Designed dark mode, real elevation scale, information density, precise micro-interactions |

### Anti-patterns — explicitly forbidden

These are the tells that make a product read as generic AI output. None of them
appear in this codebase, and none should be added:

- Violet/purple gradients; gradient text of any kind
- Glassmorphism or `backdrop-blur` used as decoration (a 1px blur on a sticky bar is fine)
- Glowing or gradient borders
- Floating orbs, mesh gradients, blurred colour blobs
- Emoji as icons — **Lucide SVG only**
- More than one accent colour

Depth comes from **surface, hairline and shadow only**.

---

## Colour

All colour is a semantic token in `src/app/globals.css`. Components reference the
token, never a raw hex value.

### The `--ink` / `--primary` distinction — important

`--primary` **inverts** in dark mode (deep navy → light blue) so it stays legible
as text and button fills. `--ink` **stays dark in both modes** and is reserved for
large colour *fields* — the auth panel, the closing call to action. Using
`--primary` for a full-bleed panel turns it into a glaring bright block in dark
mode. This bug has been fixed once; do not reintroduce it.

### Verified contrast

Measured in-browser, both modes. Every text pair clears WCAG AA (4.5:1); every
component boundary clears 3:1.

| Pair | Light | Dark |
|---|---|---|
| foreground / background | 17.6 | 16.2 |
| muted-foreground / card | 6.0 | 6.8 |
| subtle-foreground / card | 4.9 | 5.1 |
| accent / card | 5.1 | 7.9 |
| on-primary / primary | 13.4 | 7.9 |
| input border / card | 3.3 | 3.3 |

`--input` is deliberately darker than `--border`: a form field's boundary is a
UI component (3:1 required), a decorative divider is not.

---

## Theme

Three states, not two — `light`, `dark`, `system`. `system` is a real choice.

- An explicit choice writes `data-theme` on `<html>` and persists to `localStorage`.
- Under `system` the attribute is **removed**, so CSS `prefers-color-scheme` decides.
  The OS stays the single source of truth rather than being snapshotted into storage.
- A blocking inline script in the root layout applies the stored theme **before first
  paint**. Without it there is a white flash on every load.
- The chosen theme is read via `useSyncExternalStore`, not `useState`. The document
  is the owner; a `useState` initialiser returns `"system"` on the server and the
  real value on the client, which leaves `aria-pressed` permanently wrong after
  hydration.

---

## Elevation

Never hand-write a shadow. Use `.elevated-1` … `.elevated-4`.

- **Light:** two-layer cast shadow, tight and neutral.
- **Dark:** shadows are invisible against a dark ground, so elevation is carried by
  a **lighter surface plus a 1px inset top highlight** (`--hairline`). This is the
  single most common reason a dark theme reads as cheap.

---

## Typography

- **Display:** EB Garamond — headings, statistics, section numerals. Letter-spacing `-0.015em`.
- **UI:** Inter.
- **Numerals:** `.tabular` wherever figures are compared or stacked.

Swiss recommends a geometric sans throughout; the serif display is a deliberate
departure. It is what keeps the product reading as academic rather than as another
developer tool — and it is the main reason the page does not look AI-generated.

---

## Motion

Short and near-linear. Interface feedback should feel immediate, not animated.

- `--duration-fast: 140ms` for hover/colour, `--duration-base: 200ms` for layout.
- Buttons use `active:translate-y-px` — the one piece of motion that carries meaning.
- Theme switching applies `.theme-transition` **only during the switch**, so ordinary
  hover states are never slowed by a global transition.
- `prefers-reduced-motion` drops all non-essential motion.

---

## Navigation

Collapsible sidebar + top bar (`src/components/shell/app-shell.tsx`).

- Sidebar collapses to an icon rail; the preference persists and is read during
  render, so it never paints expanded and then snaps shut.
- Inside the workspace it is **always** collapsed — the editor has its own section
  navigator, and two nav columns compete for the same job. Derived from the route,
  not pushed through state; the collapse control is disabled there rather than
  appearing to do nothing.
- Below `lg` it becomes an overlay drawer, tied to the route it was opened on so
  navigating away closes it without an effect.
- Active item is marked by a 2px brass bar — the single accent, used only to mark
  position.

**Every nav entry points at a route that exists.** Features arriving in later
milestones are absent, not present-and-inert.
