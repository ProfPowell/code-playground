# Roadmap

## Current Baseline

The repo already has a solid first product slice:

- Standalone custom element package with Vite library build
- Lazy-loaded CodeMirror editors
- Sandboxed preview iframe via `srcdoc`
- External source loading for `html-src`, `css-src`, `js-src`, and `head-src`
- Full rebuilds plus JS-only soft reruns
- Console filtering, search, repeat collapsing, and copy-visible output
- Host diagnostics that persist across preview reruns
- Playwright coverage for the main authoring loop

## Near Term

### 1. Docs And Demo Polish

Priority: high

Goals:

- Make the docs site strong enough to demonstrate real usage, not just API surface
- Add more realistic demos, especially Vanilla Breeze integration examples
- Add a clear story for external asset loading and themed embedding

Success looks like:

- `docs/index.html` and `docs/demos.html` feel like product docs
- Demos cover inline sources, external sources, manual mode, and theme inheritance
- A new contributor can understand the component from docs alone

### 2. Performance And Bundle Trimming

Priority: high

Goals:

- Reduce the large deferred editor runtime chunk
- Trim or split language/editor imports where practical
- Keep the main host bundle small

Success looks like:

- `npm run build` reports a smaller editor-runtime chunk
- No loss of the current feature set
- No regression in tests or startup behavior

### 3. Accessibility And Keyboard Hardening

Priority: medium

Goals:

- Audit tabs, toolbar controls, console controls, and divider behavior
- Improve focus management and keyboard semantics
- Tighten labels, live-region behavior, and disabled-state affordances

Success looks like:

- Keyboard-only flows are reliable
- Core interactions have targeted tests
- Control semantics stay correct after UI changes

### 4. Preview And Runtime Hardening

Priority: medium

Goals:

- Improve cleanup and edge-case handling around repeated soft reruns
- Broaden runtime error coverage
- Make execution-mode details easier to consume in events and docs

Success looks like:

- Execution state stays correct under rapid edits and reruns
- Preview-specific failures do not pollute host diagnostics
- Event payloads are stable and documented

## Mid Term

### 5. Publish And CI Readiness

Goals:

- Add CI for lint, test, build, and manifest generation
- Define release discipline and changelog expectations
- Make the repo safe to hand off and publish repeatedly

### 6. Authoring Ergonomics Beyond V1

Goals:

- Better export options
- Optional formatting hooks
- Better asset-loading helpers
- More polished docs author workflow

## Explicitly Deferred

These are out of scope until the core component is more mature:

- Multi-file project trees
- npm package installs inside the playground
- bundler or transpiler pipelines inside the iframe
- server-side execution
- a full devtools clone
- turning the component into a full IDE
