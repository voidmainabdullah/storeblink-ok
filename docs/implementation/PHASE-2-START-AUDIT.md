# Phase 2 Start Architecture Audit

Date: 2026-08-01

## Implemented (PASS)

- `EngineKernel`, `EngineProvider`, `EngineContext`, typed system keys, and lifecycle hooks exist.
- `MyStore` creates one kernel per mounted editor route.
- Scene Graph and most interaction/rendering systems expose class constructors or factory functions.
- Page documents are already instantiated per editor kernel.
- Command factories use explicit command contexts.

## Missing (FAIL)

- Kernel registration is not instance isolation: most registered systems are imported module-global singletons.
- Scene, selection, transform, viewport, canvas, responsive, tool, and history state use global Zustand stores.
- History uses module-global `undoStack` and `redoStack` arrays.
- Command dispatch imports the module-global history recorder.
- Active UI reads global stores and imports system singletons directly.
- No transaction manager spans scene, page, navigation, asset, and product-binding mutations.
- No authoritative node schema/capability registry validates parent/child relations.
- No queryable cross-domain dependency graph exists.
- No two-kernel isolation test exists.

## Partially Implemented (PARTIAL)

- EngineContext is used to resolve several systems in `EngineEditor`, but direct imports remain in `EngineEditor`, `CanvasShell`, inspector, layer tree, renderer, and transform adapters.
- Scene validation checks structural integrity and node shape, but not a per-node versioned schema/capability contract.
- Page operations provide localized atomic behavior, but cross-system rollback is not generalized.
- Event bus notifications exist for Scene Graph changes, but ownership is mixed between global adapters and per-kernel buses.

## Technical Debt

- Compatibility exports are widely used by tests and legacy modules; removal must follow an incremental migration.
- React subscriptions currently bind directly to global Zustand hooks.
- Responsive and transform systems directly reference global responsive/elevation state.
- Publishing remains a module-global service and is not registered in the editor kernel.

## Regression Risk

- High: replacing store ownership can break React subscriptions while commands still mutate a different store.
- High: history isolation changes can break undo/redo keyboard behavior.
- High: transform preview and renderer must share the same scoped store or live manipulation disappears.
- Medium: stricter node schemas can reject existing merchant scenes.
- Medium: transaction rollback can duplicate events unless commit publication is deferred.

## Next Actions

1. Introduce kernel-owned history and command manager first, retaining compatibility exports.
2. Add isolated Scene Graph/session ownership with a tested React store bridge.
3. Move active UI to typed kernel facades before removing singleton fallbacks.
4. Add node schemas, transaction rollback, and dependency queries after core isolation is stable.
5. Require a two-kernel test and full editor regression suite before Phase 2 completion.

