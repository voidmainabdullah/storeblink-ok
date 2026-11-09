# Phase 2 Audit - Rendering, Canvas, and Viewport

Date: 2026-07-24

## Current Result

`CanvasShell` is now the primary runtime for `/dashboard/store`. It renders the active Scene Graph root through:

`CanvasShell -> RenderNode -> RendererRegistry -> element renderers`

Scene mutations are emitted through the engine event bus and connected to `RendererSystem.invalidate()`, `flush()`, and `subscribe()`.

## Rendering Flow

| Required Piece | Current Implementation |
|---|---|
| Coordinate System | `src/rendering/coordinate` |
| Viewport System | `ViewportSystem` and `viewport.store` |
| Canvas System | `CanvasSystem` and `canvas.store` |
| Renderer System | `RendererSystem.renderNode/invalidate/flush/subscribe/connectEventBus` |
| Renderer Registry | `RendererRegistry`, `registerBuiltInRenderers`, fallback renderer |
| Node renderers | Text, image, button, container, section, shape, svg, video |
| Canvas shell entry point | `src/ui/canvas-shell/CanvasShell.tsx` |
| Basic culling | `src/rendering/visibility` |

## Runtime Wiring

- `createEditorKernel()` registers canvas, viewport, renderer, selection, transform, hit-testing, scene graph, and command scene graph systems.
- `CanvasShell` reads the optional `EngineContext` and connects the event bus to:
  - `sceneStoreCommandGraph`
  - `selectionSystem`
  - `hitTestingSystem`
  - `transformSystem`
  - `rendererSystem.connectEventBus()`
  - `rendererSystem.subscribe()`

## Reused Pieces

- `CanvasShell`
- `RenderNode`
- `RendererRegistry`
- built-in element renderers
- `MoveableAdapter`
- `SelectoAdapter`
- overlay renderer
- viewport/canvas stores

## Replaced For `/dashboard/store`

- The iframe preview is no longer the dashboard store editor renderer.
- Store editor layers and inspector now read from `scene.store`.
- Inserts, edits, deletes, duplicate, lock/hide, z-order updates, undo/redo, copy/paste, zoom, grid, guides, selection, drag, resize, and rotate operate on Scene Graph nodes.

## Known Compatibility Boundary

The public storefront route (`/store/:slug`) still renders the legacy storefront templates. This preserves customer-facing compatibility while the dashboard editor source of truth migrates to Scene Graph.

## Verification Evidence

- Renderer and CanvasShell focused tests pass.
- New adapter tests pass.
- TypeScript, build, lint, and full tests are run as part of this migration.

## Implemented ✓

- Canvas System exists with size, background, grid, rulers, guides, and safe area APIs.
- Viewport System exists with zoom, pan, viewport size, visible region, and coordinate conversion.
- Renderer System exists with render, invalidate, flush, subscribe, and event-bus connection APIs.
- Renderer Registry and built-in element renderers are present.
- CanvasShell is the live `/dashboard/store` editor rendering shell.

## Missing ✗

- None for Phase 2 scoped rendering/canvas/viewport requirements after current migration.

## Partially Implemented △

- Visibility/culling is basic and intentionally depends on Geometry System for correctness after Phase 3.
- Browser visual verification is route-smoke based, not automated screenshot comparison.

## Technical Debt

- Bundle size warning remains from the general app build.
- Renderer culling should continue to avoid duplicating Geometry System calculations.

## Regression Risk

- Renderer must stay independent from Selection/Transform business state except active transform preview in `RenderNode`.
- CanvasShell must remain the primary dashboard editor runtime.

## Next Actions

- Keep future overlay, selection, and transform visuals layered above Renderer instead of changing renderer ownership.
