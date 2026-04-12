# Architecture

## Repo Layout

- `src/code-playground.js`
  - Host custom element
  - UI rendering
  - editor/persistence/source-loading state
  - execution mode selection
  - console rendering
- `src/lib/preview-document.js`
  - preview HTML document assembly
  - iframe bridge script
  - runtime bootstrap for full and soft execution
- `src/lib/editor-runtime.js`
  - lazy-loaded CodeMirror runtime
- `src/lib/theme-observer.js`
  - page theme detection for `data-mode` / `data-theme`
- `src/lib/storage.js`
  - `localStorage` helpers
- `test/code-playground.spec.js`
  - Playwright end-to-end coverage
- `test/test-page.html`
  - test harness page
- `docs/`
  - public docs and demos

## Runtime Model

### Host Shell

The host custom element is the system boundary. It owns:

- authored values
- applied preview values
- dirty tracking
- toolbar and console state
- persistence
- source loading
- theme syncing

The host decides whether a pending run needs:

- `run()`: full iframe rebuild
- `softRun()`: JS-only rerun against the existing iframe document

### Preview Document

The preview document is generated in `src/lib/preview-document.js`.

A full build includes:

- normalized HTML/CSS/JS/head payload
- `<base href>`
- theme attributes when `inherit-theme` is enabled
- a bridge script for messaging back to the host
- a runtime bootstrap that executes user JS

### Soft Rerun Path

Soft reruns work by sending a `postMessage` payload into the iframe. The bridge updates the active run id, evaluates the new JS, and sends a fresh `ready` message with `executionMode: 'soft'`.

This means:

- JS state inside the iframe can accumulate across soft reruns
- HTML/CSS/head changes still require a full rebuild
- host-side diagnostics must not be cleared by preview-only reruns

## Console Model

Console entries are stored in one list but carry an origin:

- `origin: 'preview'`
- `origin: 'host'`

Important invariant:

- preview-origin entries are cleared on each execution
- host-origin entries survive reruns and rebuilds until explicitly cleared

Current host-origin examples:

- source loading failures
- editor runtime loading failures
- clipboard failures raised by host controls

## Persistence Model

`persist` stores:

- current values
- active tab
- split position

External source files become the reset baseline when they are successfully loaded. Persisted authored values may override what is displayed until a forced reload applies new source content.

## Build And Generated Files

Generated files:

- `dist/`
- `custom-elements.json`

Do not hand-edit these. Regenerate with:

```bash
npm run build
npm run analyze
```

## Invariants To Preserve

- Standalone package, no runtime coupling to sibling repos
- semantic CSS token usage and light/dark friendliness
- full rebuild vs soft rerun distinction
- host diagnostics survive preview reruns
- test harness remains stable on port `4178`
- Playwright remains the source of truth for the authoring loop
