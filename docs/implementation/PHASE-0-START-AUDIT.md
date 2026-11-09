# Phase 0 Start Architecture Audit

Date: 2026-08-01

## Implemented (PASS)

- The active editor route is `/dashboard/store`.
- The active component path is `MyStore -> EngineProvider -> EngineEditor -> CanvasShell`.
- The public runtime is routed separately under `/store/:slug` and its page/product descendants.
- Scene Graph, command, renderer, responsive, publishing, and storefront resolver modules exist.
- A pre-change recovery archive was created outside the working tree.

## Missing (FAIL)

- No production browser E2E suite or CI workflow is present.
- Supabase migrations cannot be verified remotely because this checkout is not linked to a Supabase project.
- Existing merchant profile migration cannot be verified without service credentials.
- The editor kernel does not own isolated system instances; it registers module-global systems.
- History uses module-global stacks, so editor instances are not isolated.

## Partially Implemented (PARTIAL)

- EngineContext exists, but active UI still imports global systems directly.
- Draft/publish abstractions exist, but local recovery uses `localStorage` and remote rollback is not environment-verified.
- Public storefront reads use resolvers, while dashboard UI still performs direct Supabase mutations.
- Stored SVG upload sanitation exists, but persisted, clipboard, migration, and renderer boundaries are not consistently protected.

## Baseline Gates

| Gate | Baseline result |
|---|---|
| `npx tsc --noEmit` | Pass |
| `npm run build` | Pass |
| `npm run verify:public-bundle` | Pass, 24 chunks checked |
| `npm run test -- --maxWorkers=1` | Fail, 1 of 264 tests failed in palette normalization |
| `npm run lint` | Fail, 3 errors and 34 warnings |
| `npm audit --omit=dev` | Fail, 4 high and 2 moderate advisories in the captured baseline |

## Technical Debt

- The checkout has no Git metadata, so rollback depends on the external recovery archive and file-level evidence.
- Legacy `StoreBuilderEditor` remains in source beside the active Engine editor.
- Direct system imports and direct Supabase writes cross intended ownership boundaries.
- There is no deployment target configuration proving that security headers are enforced.

## Regression Risk

- High: stored SVG can cross untrusted persistence boundaries.
- High: global system/history state can leak between editor instances.
- High: remote schema and profile migration state is unknown.
- Medium: contact and commerce UI can imply outcomes unsupported by server truth.
- Medium: no browser suite covers editor pointer interaction or public routes.

## Next Actions

1. Complete Phase 0 inventories and representative fixtures.
2. Preserve the pre-change recovery archive and hash.
3. Begin Phase 1 only after the baseline is recorded.

