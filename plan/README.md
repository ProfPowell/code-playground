# Plan Directory

This directory is for internal planning and handoff work on `code-playground`.

It is intentionally separate from the public docs in `docs/` and the package README. The package `files` list does not include `plan/`, so these notes stay repo-local.

## Start Here

1. Read `HANDOFF.md` for the current repo snapshot.
2. Read `ARCHITECTURE.md` before changing runtime behavior.
3. Pick work from `AGENT-TASKS.md` with a disjoint write scope.
4. Use `ROADMAP.md` to decide priority order.
5. Use `RELEASE-CHECKLIST.md` before publishing or tagging a release.

## Quick Commands

```bash
npm run lint
npm test
npm run build
npm run analyze
```

## Repo Rules That Matter

- Keep `code-playground` standalone. Do not add runtime dependencies on `vanilla-breeze`, `browser-window`, or other sibling repos.
- Treat `src/code-playground.js` as the host shell and state coordinator.
- Treat `src/lib/preview-document.js` as the preview bridge and document assembly boundary.
- Do not hand-edit `dist/` or `custom-elements.json`; regenerate them through the normal scripts.
- If you touch preview execution, preserve the distinction between full rebuilds and JS-only soft reruns.
- If you touch console behavior, keep host diagnostics separate from preview-origin output.

## File Index

- `ROADMAP.md`: project phases and priority order
- `ARCHITECTURE.md`: runtime model, key files, invariants
- `AGENT-TASKS.md`: concrete workstreams for parallel agents
- `HANDOFF.md`: current snapshot, risks, next steps
- `RELEASE-CHECKLIST.md`: publish and handoff sanity checklist
