# `local-iframe` vs `code-playground` — Analysis & Improvement Plan

Comparing [`AleksandrHovhannisyan/local-iframe`](https://github.com/AleksandrHovhannisyan/local-iframe) to this repo's `code-playground` component.

## TL;DR

`local-iframe` and `code-playground` solve different problems and should not be conflated:

- **`local-iframe`** (~220 LOC, single class): a tiny, declarative wrapper that renders a `<template>`'s HTML into an `iframe[srcdoc]`. No editor, no console, no persistence. Designed for **static, author-controlled demos** inside blog posts/tutorials.
- **`code-playground`** (~2,320 LOC, plus 4 lib modules): a full interactive editor with CodeMirror, sandboxed preview, console capture, persistence, theme observer, CodePen export, external source loading, JS-only soft rerun, etc. Designed for **live, learner-editable** code playgrounds.

There is no need to "rewrite to match" `local-iframe`. However, three of its design choices are worth adopting selectively, and one pattern it uses is worth deliberately *not* adopting.

---

## Side-by-side scope

| Concern | `local-iframe` | `code-playground` |
| --- | --- | --- |
| Source of HTML | Child `<template>` or `template="id"` ref | `<textarea slot="…">` or `*-src` URL attrs |
| Editing | None (static) | CodeMirror per language |
| Console capture | None | Bridge script + host UI w/ filters, search |
| Persistence | None | `localStorage` by `persist` key |
| Theme | None | `inherit-theme`, observer on `data-mode`/`data-theme` |
| Extensibility | Subclass + override protected `_render(html)` | Attribute surface + `reloadSources()` |
| `fit-content` (auto-resize to inner doc) | **Yes**, via `ResizeObserver` on `contentDocument.scrollingElement` | **No** |
| Custom iframe (BYO `<iframe>` child for attrs) | **Yes** | **No** |
| External template reference by id | **Yes** (`template` attr) | **No** (only URL refs) |
| TypeScript types | First-class `.ts` source | Hand-written `.d.ts` |
| Public render-customisation API | `_render(templateHtml)` overridable in subclass | Internal to `preview-document.js`, not exposed |

---

## What `local-iframe` does that we should consider

### 1. `fit-content` attribute — auto-size preview to inner content **(recommended)**

`local-iframe` ships an opt-in `fit-content` boolean attribute. When set, it `ResizeObserver`s the iframe's `contentDocument.scrollingElement` and mirrors its `scrollHeight` onto the host element's `style.height`. When the attribute is removed, height falls back to either the inline `style="height: …"` it captured in the constructor or `auto`.

Why this matters for us: tutorial demos often have short, variable-height output. Today, `code-playground` forces the author to size the preview (split pane, fixed height). For short demos this wastes space and prevents inline-flowing playgrounds.

**Plan:**

- Add an opt-in `fit-preview` attribute (different name to avoid colliding with our existing layout knobs).
- Only honour it when `preview-position` is full/stacked **and** there are no editors visible (or when the host explicitly opts in even with editors visible — TBD).
- Implementation cribs directly from `LocalIframe.#observeIframeResize` (see `src/LocalIframe.ts` lines 175–193 in their repo): keep a single `ResizeObserver` on the iframe's `scrollingElement`, rewrite on each soft/hard rerun (the observer must be re-attached on iframe rebuild — they only rebuild srcdoc, we sometimes rebuild the whole iframe).
- Restore the original inline height on attribute removal.

### 2. Explicit "bring your own `<iframe>`" pattern **(consider)**

`local-iframe` lets you pre-place an `<iframe sandbox="…" loading="lazy" allow="…">` child and it will use that one instead of inserting a new one. This sidesteps having to add every iframe attribute as a forwarded API.

Today our preview iframe is created internally; consumers who want `loading="lazy"`, a custom `sandbox` policy, `allow="…"`, or `referrerpolicy` have no escape hatch.

**Plan:**

- In the constructor, look for a `<iframe slot="preview">` (or unslotted `<iframe>` child inside our preview region) and adopt it.
- Document which attributes we will set/override (`srcdoc`, `title`) and which we will leave alone (`sandbox`, `loading`, `allow`, `referrerpolicy`).
- Defer this until someone actually asks for it — speculative API risk otherwise.

### 3. Overridable `_render(html)` for subclassing **(consider, lower priority)**

`local-iframe` exposes a `protected _render(templateHtml)` so subclasses can wrap user content in a shared doc shell (common stylesheet, framing copy, etc.). Our equivalent lives in `src/lib/preview-document.js` and is not reachable from outside.

A subclass-friendly hook would let consumers inject a shared design-system stylesheet, analytics, or wrapper markup without forking. The cost is a stability commitment on the hook signature.

**Plan:**

- Promote one seam in `preview-document.js` to a protected instance method on `CodePlayground`, e.g. `buildPreviewDocument({ html, css, js, head, runId })` returning a string.
- Keep the default implementation private; document it as "override at your own risk; signature may evolve in 0.x".

### 4. Cleaner attribute getter/setter ergonomics **(stylistic)**

`local-iframe` exposes paired getters/setters for every observed attribute (`fitContent`, `description`, `template`) using `toggleAttribute` / `setAttribute` underneath. Our class has many `get`s but several `set`s are missing (the file shows getters for `persistKey`, `inheritTheme`, `showConsole`, `sourceUrls` with no setters — see `code-playground.js:307–320`).

Whether this matters depends on whether we want JS-side mutation parity. Today many of these attrs are set-once-via-HTML; that's a defensible choice. Worth a deliberate decision rather than an accident.

### 5. TypeScript source **(not recommended yet)**

`local-iframe` is authored in TypeScript and compiled via Vite. Our `code-playground.d.ts` is hand-maintained. Migrating 2.3k LOC of working JS to TS is a large task and not justified by the comparison alone, but every time we touch a public attribute we *do* pay the cost of keeping the `.d.ts` accurate. Track this as a "if we ever do a 1.0" item.

---

## What `local-iframe` does that we should **not** copy

### Throwing from `#render` when no `<template>` is present

`LocalIframe.#render` throws if it can't find a template (`src/LocalIframe.ts` line 169). For a static-demo helper, throwing is fine — the author sees the error at dev time. For a learner-facing playground, an empty/missing source is a normal state (the user just hasn't typed anything yet, or `*-src` fetches are mid-flight). Our current behaviour — render an empty preview and report any fetch errors through the diagnostics surface — is correct for our audience. Don't regress on it.

### `<template>` as the only input shape

Their `<template>`-only API is elegant but mixes the "HTML body" with `<style>` and `<script>` blocks into one blob. For an *editor* product, separating html/css/js into discrete editors (which we do via slots) is non-negotiable. Don't be tempted by their cleaner-looking external-`<template>` reference; our `*-src` URLs serve the same purpose and keep the html/css/js separation intact.

---

## Concrete proposed work, ranked

| # | Item | Effort | Value | Priority |
| --- | --- | --- | --- | --- |
| 1 | `fit-preview` attribute with `ResizeObserver` | S–M | High for tutorial embeds | **Do next** |
| 2 | Audit attribute getter/setter symmetry; decide which need setters | S | Low–Med | Soon |
| 3 | BYO-`<iframe>` escape hatch | M | Low until a user asks | On request |
| 4 | Protected `buildPreviewDocument()` override seam | M | Low until a user asks | On request |
| 5 | TS migration | L | Med over long run | Defer to 1.0 |

## Open questions for the user

- Are there real tutorial pages today where a `fit-preview`-style auto-height playground would replace a fixed pane? If yes, that confirms #1 is worth doing now.
- Any consumers asking for custom `sandbox`/`allow` on the preview iframe? That decides #3.
- Is there appetite to commit to a stable subclassing seam in a 0.x release? That decides #4.
