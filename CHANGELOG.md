# Changelog

## 0.3.1 - 2026-11-04

### Changed

- **One frame instead of nested boxes.** The toolbar, editor, preview, and console now share a single border, separated by hairlines. This removes the padding and gaps around them, so the default layout is about 3rem shorter. If you reserve space with the "Avoiding a Flash on Load" CSS, change `34rem` to `31rem`.
- **No default drop shadow.** `--cp-shadow` now defaults to `none`, so the playground sits flat in the page. Set it to bring a shadow back.
- **Run is only filled when it's needed.** With `run-mode="manual"` it stays the accent-colored primary action. In auto mode, where edits rerun on their own, it's an outlined button.
- **Theme radii apply to every control.** Buttons, inputs, menu items, and console badges follow `--cp-radius-inner`, and the menu follows `--cp-radius`. Without a design system, the defaults are now `12px` and `6px`.
- **Thinner divider and preview header.** The divider is a hairline with a wider area to grab, and its handle appears on hover or focus. The preview header is slimmer.
- Narrow playgrounds keep the toolbar on one row by visually hiding the status text. Screen readers still announce it.

### Fixed

- The console's expand arrow was invisible, because 0.3.0's new icon had no size.
- Focus rings use `--cp-focus` everywhere, and a focused tab's ring is no longer cut off.
- The "Editor failed to load" message follows the theme's error color.

### Documentation site

- The hero demo is readable in dark mode. Its white card used to get white text, hiding the heading.
- The hero demo's background fills the preview instead of stopping partway down.
- The header puts the brand on the left and navigation on the right. It was using a layout value that vanilla-breeze doesn't recognize, and on phones it no longer stacks into three rows.
- Feature and related-component cards use body text colors instead of making everything link-colored, and related cards put their names on their own line.
- Fixed tall empty space around the headings on the Demos and API pages, and missing space under section headings.
- Calls to action are real links styled as buttons, replacing buttons nested in links.
- The theme picker no longer looks like the page's primary action.

### Dependencies

- Development only: `@profpowell/code-block` to `^2.10.0`, also pinned in the docs.

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
