# Phase 2 End Architecture Audit

Date: 2026-08-01

Status: The active `/dashboard/store` runtime satisfies the Phase 2 ownership and platform-contract gates. Compatibility seams outside that runtime remain documented technical debt; this is not a claim that the full roadmap is complete or public-ready.

## Implemented (PASS) ✓

- Every mounted `EngineEditor` owns an isolated `EngineKernel` and private scene, selection, transform, viewport, canvas, responsive, tool, command, history, page-document, dependency, publishing, storefront-data, theme-chrome, asset, and telemetry services.
- The active editor resolves business systems through `EngineContext`/`useEngine()` and scoped stores. `CanvasShell`, Moveable, Selecto, overlays, inspector, selection toolbar, text editing, and image replacement no longer fall back to mutable editor singletons.
- Fixed a root selection-pipeline defect: `CanvasShell` resolved the kernel selection system but did not pass it to `SelectionInputOrchestrator`, causing click and hover writes to the global compatibility store.
- Command and history stacks are private per kernel. Command execution and failure telemetry is correlated and payload-free.
- `NodeSchemaRegistry` validates every built-in node plus `custom:*`, capabilities, versions, parent/child relationships, and graph boundaries.
- `TransactionManager` applies cross-system changes atomically, rolls back on failure, and creates one history entry for one logical operation.
- Page switch and page creation now commit the page document and active Scene Graph together. Undo/redo restores both without clearing unrelated history.
- `DependencyGraph` indexes node-to-asset/product/collection, component-instance-to-definition, navigation-to-page, root-to-template, template-to-shared-chrome, and published-revision-to-asset-manifest relationships.
- Renderer invalidation/event subscriptions are instance-owned and disposable. Geometry/coordinate caches are scoped per graph.
- Platform boundaries now expose editor data, storefront data, publishing, shared theme chrome, and telemetry through kernel-owned contracts.
- Removed the public bundle leak caused by `RenderNode` importing the broad kernel barrel. Public storefront chunks no longer pull Moveable/Selecto editor code.
- Added system documentation for the kernel, commands, history, schemas, transactions, dependencies, telemetry, editor data, and page documents.
- Added isolation, schema, relation, transaction, page-transition, dependency, publishing, command-telemetry, selection-input, and active-canvas regression tests.

## Verification

| Gate | Result |
|---|---|
| `npm run test -- --maxWorkers=1` | Pass: 77 files, 288 tests |
| `npx tsc --noEmit` | Pass |
| `npm run lint` | Pass: 0 errors; 20 pre-existing Fast Refresh warnings |
| `npm run build` | Pass: Vite build, 2,251 modules transformed |
| `npm run verify:public-bundle` | Pass: 24 reachable public chunks; no editor interaction dependency |
| `npm run verify:security-headers` | Pass: 6 headers and 7 mandatory CSP directives |
| `npm run verify:production-audit` | Pass under the reviewed, expiring React Router RSC exception |
| Two-kernel isolation | Pass: scene, selection, history, command, telemetry, and renderer lifecycles remain independent |
| Invalid graph relationships | Pass: schema boundary rejects invalid parent/child and malformed node data |
| Cross-system page transition | Pass: one transaction and one history record restore page plus scene atomically |

## Missing (FAIL) ✗

- No missing item remains inside the active Phase 2 acceptance boundary.
- Phase 3 durability work is intentionally not counted as Phase 2: ordered document migrations, durable local recovery, conflict preservation, offline retry, and cross-session publication rollback still need implementation.

## Partially Implemented (PARTIAL) △

- Compatibility singleton exports remain for inactive legacy modules and selected public/test adapters. They are no longer the mutable source used by `/dashboard/store`, but removal must wait until their consumers are migrated.
- Shared public renderers retain stateless/read-only fallbacks because public storefront rendering has no editor kernel. Production bundle verification confirms those fallbacks do not import Moveable or Selecto.
- Telemetry is bounded and instance-owned but currently in memory; durable transport and operational aggregation belong to Phase 9.
- Dependency impact is queryable in the live kernel but is not yet persisted as a recovery artifact or deployment report.

## Technical Debt

- `StoreBuilderEditor.tsx` and its iframe/postMessage compatibility path remain in the repository although they are not the active `/dashboard/store` runtime.
- Compatibility barrels make accidental broad imports possible; the public-bundle gate must remain mandatory.
- Twenty Fast Refresh export-boundary warnings remain.
- The reviewed React Router RSC advisory exception expires on 2026-09-01 and must be revisited before that date.

## Regression Risk

- Medium: changing page-transition ordering can desynchronize the active page and scene unless the transaction integration test stays in place.
- Medium: adding a new node type without registering its schema/capabilities will now fail at the graph boundary by design.
- Medium: active runtime isolation is covered by component/unit tests, but dual-editor and pointer behavior still lack a real-browser Playwright gate.
- Low: public editor-dependency leakage is guarded by a production chunk traversal test.

## Next Actions

1. Start Phase 3 with an ordered, versioned Migration Registry and real v1-to-v2 fixtures.
2. Add schema-aware node migrations and fail closed on unknown document or node versions.
3. Add Dexie-backed validated drafts, command journal, retry queue, last-valid snapshot, and startup restore/discard flow.
4. Preserve both local and remote copies on revision conflicts and expose an explicit resolution UI.
5. Persist publication rollback metadata so a previous valid release can be restored after refresh or a new session.
6. Run focused migration/recovery tests and all repository gates before closing Phase 3.
