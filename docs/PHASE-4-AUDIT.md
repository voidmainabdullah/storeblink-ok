# Phase 4 Architecture Audit Report - Start

Date: 2026-07-24

Scope: Selection System, Selection Store, input orchestration, and Overlay System foundation.

## Implemented ✓

- Phase 3 provided `hitTest`, `hitTestRegion`, `getAABB`, `getOBB`, and `getWorldTransform`.
- `selection.store` was present and array-shaped for future multi-selection.
- `CanvasShell` mounted an overlay layer and pointer input surface.
- Scene Graph metadata exposed `locked` and `hidden` flags for selection eligibility.

## Missing ✗

- Central `SelectionSystem` gate for all selection mutations.
- Pointer input orchestrator routing canvas coordinates through Hit Testing.
- Dangling-reference pruning on `scene:node:deleted`.
- Overlay visuals computed from Scene Graph/Coordinate System rather than DOM.
- Hover state and hover overlay.
- Proof that selection/hover does not re-render node renderers.

## Partially Implemented △

- Overlay shell existed, but selection visuals needed real selected/hovered geometry.
- Canvas pointer handlers existed, but selection flow needed to be system-owned.

## Technical Debt

- Selection could regress if future layer-panel or keyboard selection bypassed `canSelect`.
- Overlay pointer events could block canvas selection if not explicitly disabled.

## Regression Risk

- Click selection could select page/root instead of editable child nodes.
- Overlay could drift from rendered nodes if it did not use viewport pan/zoom.
- Hidden/locked nodes could stay selected after scene mutations.

## Verification Evidence

- Required before completion: selection state transition tests.
- Required before completion: deletion-pruning test.
- Required before completion: click/hover integration tests through real hit testing.
- Required before completion: render-count proof that node renderers do not re-render on selection/hover.

## Next Actions

- Implement `interaction/selection/state.ts`.
- Implement `interaction/selection/input-orchestrator.ts`.
- Implement `rendering/overlay/geometry.ts` and `OverlayRenderer.tsx`.
- Wire `CanvasShell` pointer events to Selection System.
