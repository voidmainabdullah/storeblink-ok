# Phase 1 Summary: Editor Foundation and Scene Graph

Date: 2026-07-24

## Built

- Canonical editor engine types in `src/types/`.
- Engine Event Bus in `src/engine/event-bus/`.
- Engine Kernel, read-only Engine Context, and React `useEngine()` provider in `src/engine/kernel/`.
- Scene Graph System in `src/engine/scene-graph/`.
- Node Lifecycle hook registry in `src/engine/node-lifecycle/`.
- Zod validation schemas and typed validation functions in `src/engine/validation/`.
- Versioned Project JSON serialization and validation-only migration stub in `src/engine/serialization/`.
- Root Zustand stores:
  - `src/stores/scene.store.ts`
  - `src/stores/project.store.ts`
  - `src/stores/preferences.store.ts`
- Architecture naming correction in `docs/ARCHITECTURE.md`: `scene.store` owns scene nodes; `canvas.store` remains available for the later workspace-surface system.

## Scene Events for Phase 2

The Event Bus supports these scene mutation events:

- `scene:node:created`
- `scene:node:updated`
- `scene:node:deleted`
- `scene:node:moved`

Phase 2 Rendering/Invalidation should subscribe to these event names instead of introducing a parallel event contract.

## Complete vs Stubbed

Complete for Phase 1:

- SceneNode/Project/Page type contracts.
- Structural scene tree validation.
- Project, SceneTree, SceneNode, and imported-data validation boundaries.
- Project JSON round-trip.
- Scene graph create/delete/update/move/clone/find/traverse/parent/children/ancestors/descendants operations.
- Kernel system registration, resolution, init, and dispose order.

Stubbed or intentionally deferred:

- Migration behavior: `migrate()` currently validates and returns the project unchanged.
- Clipboard serialization: marked as a future Persistence Layer hook.
- Style/Layout engines: Phase 1 only stores raw `style` and `layout` containers.
- Command, History, Selection, Transform, Overlay, Snap, Dependency Graph, Invalidation, Components, Variables, Responsive resolution, Moveable, and Selecto.

## Compatibility

The existing Storeblink editor UI, iframe preview, storefront templates, `profiles.theme` persistence shape, and `postMessage` contracts were left untouched. Phase 1 is additive engine groundwork for later migration.

## Verification Evidence

- `npm run test`: passes with Phase 1 unit tests.
- `npm run build`: passes.
- `npx tsc -p tsconfig.app.json --noEmit`: passes.
- `npx eslint src/engine src/stores src/types`: passes for the new Phase 1 engine foundation.
- `npm run lint`: still fails on pre-existing repo-wide lint debt in legacy editor/store/dashboard files.
- `npm run dev`: smoke checked at `http://127.0.0.1:8081` with HTTP 200.

## Implemented ✓

- Phase 1 foundation systems were implemented and later connected to the live `/dashboard/store` route.
- Scene Graph is the editor document model and validates loaded trees.
- Engine Context exists for UI/system access.

## Missing ✗

- None for Phase 1 scoped deliverables after current migration.

## Partially Implemented △

- Lifecycle hooks are present but not heavily consumed.
- Project migration behavior remains validation-only.

## Technical Debt

- Later systems in the full architecture index must still get their own reports and verification.

## Regression Risk

- Scene Graph must remain the single editor document writer path.

## Next Actions

- Keep later phase implementations additive and routed through the Scene Graph/Command architecture.
