# Release Checklist

Use this before publishing or handing the repo off for release work.

## Code And Docs

- Confirm `README.md` matches the actual API and current feature set
- Confirm `docs/index.html`, `docs/demos.html`, and `docs/api.html` are current
- Confirm any new methods, events, or attributes are reflected in `code-playground.d.ts`
- Confirm `plan/HANDOFF.md` still reflects the repo state if this is a major handoff point

## Verification

Run:

```bash
npm run lint
npm test
npm run build
npm run analyze
```

Confirm:

- Playwright passes cleanly
- build output is reasonable
- `custom-elements.json` regenerates without drift

## Package Sanity

- Verify `package.json` version
- Verify `exports`, `types`, and `files` still match the package layout
- Verify no internal-only files are accidentally included in the publish set
- Verify `dist/` is regenerated from current source

## Product Sanity

- Smoke test at least one inline-source demo
- Smoke test at least one external-source demo
- Smoke test `run()` vs `softRun()`
- Smoke test console filters and clear/copy controls
- Smoke test theme inheritance in light and dark contexts

## Optional But Recommended

- Capture updated bundle size notes in `plan/HANDOFF.md`
- Note any deferred work in `plan/ROADMAP.md`
- If release scope changed, refresh `plan/AGENT-TASKS.md`
