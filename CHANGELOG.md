# Changelog

## 0.3.0 - 2026-11-04

### Changed

These can affect existing pages:

- **The console no longer opens by itself.** This applies to errors too, so messages never move the layout. The collapsed bar shows a colored dot and counts, such as `2 entries · 1 error, 1 warning`. A console left open stays open after a reload.
- **`fit-preview` sizes the preview pane, not the element.** The preview follows its content as it grows or shrinks, and the playground's height follows the taller of the editor and the preview. It no longer sets `style.height` on the element, so code reading that value needs updating.
- **Changing a panel's source replaces saved edits to that panel.** With `persist`, each edit remembers the source it was made against. Edits to other panels are kept.
- **The element's layout follows a height you set on it.** The panels used to keep their own height, leaving a gap or overflow. The element now uses `display: grid` by default, and an explicit `display: block` also works.

### Toolbar

- **Simpler toolbar.** Tabs on the left; on the right a preview toggle, a labeled **Run** button, and a **More actions** (⋯) menu. Re-run JS only, Reload sources, Reset, Copy, Download, and Open in CodePen moved into that menu. The duplicate refresh-style icons are gone and every action has its own glyph (one Lucide-style stroke set, 18px, 32px targets).
- **Plain status text.** "Auto run", "Manual run", "Updating…", and "Manual run · changes pending" replace messages like "Auto run, light shell". The preview header no longer repeats the color mode. The status is announced via `role="status"`.
- **Preview toggle is a real toggle.** It keeps the label "Show preview" and reports state with `aria-pressed`, instead of swapping labels and icons.
- In manual mode the Run button gets a ring when changes are pending.

- Contrast: removed the accent glow behind the toolbar; icons use body text color; console level colors (info, warn, debug) and the warning dot now meet 4.5:1 in light mode, using `--color-*-text` tokens when present; timestamps no longer fade with `opacity`.
- Text on accent backgrounds uses `--color-text-on-interactive-auto` instead of hard-coded white. Focus rings use `--color-focus-ring` when present.
- The More actions menu supports arrow keys, Home/End, Escape (focus returns to the trigger), and Tab.

### Fixed

- Playgrounds no longer rebuild every preview each time another connects. On pages with several, this could leave previews blank and stuck on "Rebuilding preview", with their console output lost.
- Loading the editor no longer takes keyboard focus from the page.
- `mode="dark"` on a light page now gives a dark editor instead of a light one with pale syntax colors. The same applies to `mode="light"` on a dark page.
- `text-align` on a parent element no longer reaches the editor.
- A panel the visitor never edited now picks up changes to its source, including `*-src` files.
- The source now shows while the editor loads, replacing the "Loading editor…" placeholder.
- The preview uses the theme's background while loading, instead of white.

### Removed

- The anti-flash CSS injected by the component's script, which could never apply before first paint. To avoid a flash of raw source on load, add the CSS in the README's "Avoiding a Flash on Load" section to your page.

### Upgrade notes

- Entries saved by 0.2.0 don't record which source they were edited from. Any panel that differs from the current source is kept in case it's real work, so some visitors may see an outdated panel until they click Reset.

### Dependencies

- Updated CodeMirror and Lezer packages within their current major versions.
- Development only: `vanilla-breeze` to `^0.5.0` and `@profpowell/code-block` to `^2.9.0`. The docs now pin both on unpkg.
