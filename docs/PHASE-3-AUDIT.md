# Phase 3 Architecture Audit Report - Start

Date: 2026-07-24

Scope: Geometry System, Coordinate System extension, Hit Testing System, and visibility placeholder retirement.

## Implemented ✓

- `src/rendering/coordinate/` already existed from Phase 2 with viewport/document conversion.
- Scene Graph node transforms and `NodeMeta.locked/hidden/updatedAt` existed and were reusable.
- Engine Event Bus scene events existed for cache/index invalidation.
- Basic visibility helpers existed and could be replaced with real Geometry System imports.

## Missing ✗

- Real Geometry System folder with vector, matrix, bounds, and intersection modules.
- Oriented bounds and world-transform-aware geometry helpers.
- DOM-free Hit Testing System.
- Spatial index for pointer-move and marquee workloads.
- Event-bus-driven hit-test index rebuilds.
- World transform cache invalidation tied to scene graph mutation events.

## Partially Implemented △

- Visibility/culling had placeholder rect helpers but no full Geometry System.
- Coordinate System handled viewport conversion, but nested local/parent/world conversion was incomplete.

## Technical Debt

- Legacy editor/runtime code used DOM measurement patterns from the old iframe/data-style path.
- Phase 2 culling was intentionally minimal and could not support accurate rotated hit testing.

## Regression Risk

- Geometry changes could break renderer culling if `getAABB` semantics changed.
- Hit testing could incorrectly select hidden/locked nodes if eligibility checks were not centralized.
- Nested transforms could drift if world transforms were recomputed inconsistently.

## Verification Evidence

- Required before completion: unit tests for geometry, coordinate round-trips, hit testing, and visibility integration.
- Required before completion: synthetic 1,000-node hit-test performance test.

## Next Actions

- Build `src/rendering/geometry/`.
- Extend `src/rendering/coordinate/`.
- Build `src/rendering/hit-testing/`.
- Update `src/rendering/visibility/` to import Geometry System helpers.
- Verify without using DOM reads for business geometry.
