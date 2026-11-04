# Handoff

Snapshot date: 2026-11-04 (version 0.3.0; see `CHANGELOG.md`)

## Current State

The repo is past initial scaffolding and already has a working first release candidate.

Current capabilities:

- HTML, CSS, and JS editing with lazy-loaded CodeMirror
- Sandboxed preview iframe using `srcdoc`
- external source loading via `html-src`, `css-src`, `js-src`, and `head-src`
- persistence for values, active tab, and split position
- console capture with filters, search, repeat collapsing, and copy-visible output
- full rebuilds plus JS-only soft reruns
- host diagnostics that survive preview executions

## Verification Snapshot

Most recently verified:

- `npm run lint`
- `npm test`
- `npm run build`
- `npm run analyze`

Recent test count:

- Playwright: 45 passing tests

Recent build snapshot:

- `dist/code-playground.js`: about 81 kB
- `dist/editor-runtime-*.js`: about 682 kB

The large editor runtime chunk is still the biggest obvious technical debt item.

## Key Files To Read First

- `src/code-playground.js`
- `src/lib/preview-document.js`
- `test/code-playground.spec.js`
- `README.md`
- `docs/api.html`

## Important Design Decisions

- The repo is standalone. It should remain friendly to Vanilla Breeze without becoming coupled to it.
- `run()` means full iframe rebuild.
- `softRun()` means JS-only rerun inside the existing iframe.
- Console entries track whether they came from the host or the preview.
- Host diagnostics are intentionally preserved across preview reruns and rebuilds.
- A saved edit is tied to a fingerprint of the source it was edited from, and is dropped when that source changes.
- The console never opens by itself; the collapsed bar shows severity instead.
- Pre-upgrade flash can only be prevented by CSS the page loads in `<head>`, not by the component's own script.

## Known Risks And Gaps

- The deferred editor bundle is still large.
- Soft reruns intentionally preserve in-iframe state, which can surprise users if they expect a clean slate.
- There is no CI workflow yet.
- The docs are serviceable but not yet polished enough for a public-facing product push.
- Accessibility and keyboard behavior should get a focused pass before a broader release.

## Recommended Next Sequence

1. Docs and demos pass
2. Bundle trimming / editor runtime pass
3. Accessibility pass
4. CI and release plumbing

## Notes For The Next Agent

- If you touch execution logic, read `ARCHITECTURE.md` first.
- If you touch preview behavior, add Playwright coverage.
- The docs load the published package from unpkg, so `npm run dev` on the docs doesn't show local changes. Use `test/test-page.html`, which loads `src/`.
- If you regenerate build artifacts, keep `dist/` and `custom-elements.json` in sync.
- If you add a task not captured here, update `AGENT-TASKS.md` and `ROADMAP.md` so the repo stays handoff-friendly.
