# Agent Tasks

Use this file as the work queue for parallel agents. Prefer one workstream per agent and avoid overlapping write scopes.

## How To Claim Work

- Pick one task with a disjoint write scope.
- Do not edit generated files unless your task explicitly includes regeneration.
- Keep acceptance criteria tight and verifiable.
- If your task touches runtime behavior, add or update Playwright coverage.

## Task A: Docs And Demo Polish

Status: ready

Write scope:

- `docs/index.html`
- `docs/demos.html`
- `docs/styles.css`
- `README.md`

Goals:

- Make docs feel like a product site, not just a scaffold
- Add real examples for inline, external, manual, and themed usage
- Improve copy so a new user understands the component quickly

Acceptance:

- Docs clearly explain the main authoring modes
- At least one Vanilla Breeze-friendly embed example exists
- No API descriptions drift from implementation

## Task B: Editor Runtime Performance

Status: ready

Write scope:

- `src/lib/editor-runtime.js`
- `src/code-playground.js`
- `vite.config.js`
- `package.json`

Goals:

- Reduce the large deferred editor runtime chunk
- Keep current lazy-load behavior intact
- Avoid regressing editor startup or keyboard behavior

Acceptance:

- `npm run build` still passes
- Main bundle does not grow materially
- Bundle size notes are recorded in the final handoff

## Task C: Preview Execution Hardening

Status: ready

Write scope:

- `src/code-playground.js`
- `src/lib/preview-document.js`
- `test/code-playground.spec.js`

Goals:

- Tighten soft-rerun cleanup behavior
- Make execution mode semantics more explicit in events and status
- Cover rapid edit and rerun edge cases

Acceptance:

- Full rebuild and soft rerun paths remain distinct
- Host diagnostics still survive preview reruns
- New edge cases are covered in Playwright

## Task D: Accessibility And Keyboard Pass

Status: ready

Write scope:

- `src/code-playground.js`
- `test/code-playground.spec.js`
- `docs/` if examples need accessibility notes

Goals:

- Audit tabs, toolbar, console controls, and divider keyboard behavior
- Improve labeling and focus behavior
- Confirm disabled states are conveyed clearly

Acceptance:

- Keyboard-only interaction is reliable
- Relevant controls have stable ARIA semantics
- At least one accessibility-focused test is added or improved

## Task E: Release And CI Plumbing

Status: ready

Write scope:

- `package.json`
- `README.md`
- `plan/RELEASE-CHECKLIST.md`
- CI files if introduced

Goals:

- Make releases repeatable
- Add CI if the repo is ready for it
- Keep publish discipline aligned with existing scripts

Acceptance:

- Lint, test, build, and analyze are all automated in one clear flow
- Release steps are explicit and current
- No unnecessary publish-time dependencies are introduced

## Task F: Integration Examples And VB Smoke Coverage

Status: ready

Write scope:

- `docs/`
- `test/`
- example assets if added

Goals:

- Show how `code-playground` should be embedded into Vanilla Breeze docs pages
- Add coverage for theme inheritance and external assets in a more realistic scenario

Acceptance:

- Docs include an embed example with theme-aware output
- Tests cover the integration assumptions the docs rely on
