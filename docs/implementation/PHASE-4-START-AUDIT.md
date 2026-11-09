# Phase 4 Start Architecture Audit

Date: 2026-08-01

## Implemented (PASS) ✓

- Scene nodes already carry a `layout` record and independent Desktop, Tablet, and Mobile overrides.
- `ResponsiveSystem` owns breakpoint activation, override inheritance, property-source lookup, reset/share operations, scene widths, and read-only breakpoint resolution.
- Renderer, hit testing, transform, inspector, and storefront paths resolve the same responsive node geometry.
- `ResponsiveSceneGraphView` keeps breakpoint resolution read-only and directs mutations back through Commands.
- `StructuredLayoutSystem` returns cloned, validated Scene Graphs and computes top-level section flow without writing document state directly.
- Structured section reorder/add/delete operations commit one command/history entry after reflow.
- Existing Basic, Atelier, and Noir Chrono templates carry explicit Desktop, Tablet, and Mobile geometry and render through the shared registry/runtime.
- Editor preview zoom is presentation-only and does not mutate persisted logical dimensions.

## Missing (FAIL) ✗

- `LayoutData` does not implement the required `absolute`, `horizontal`, `vertical`, `grid`, and `overlay` modes as a typed contract.
- Per-axis `fixed`, `hug`, `fill`, `minmax`, and `percentage` sizing modes do not exist.
- Auto-layout direction, padding, gap, alignment, distribution, wrap, fill/hug sizing, child order, and absolute-child behavior are not centrally computed.
- Constraint behavior is an untyped `Record<string, unknown>` and has no reusable solver.
- There is no central intrinsic measurement service for text, images, buttons, product-card content, menus, or available parent size.
- Semantic responsive intent is not persisted or resolved.
- Node-type responsive rules, safe minima/maxima, wrapping, stacking, aspect ratio, typography, and breakpoint policies have no registry.
- Responsive diagnostics and the Fix/Review/Edit/Ignore action model do not exist.
- Public legacy scenes still use a storefront-root CSS `transform: scale()` path.
- There is no certified-width browser suite proving horizontal overflow, touch targets, clipping, and Chrome 100% scale behavior.

## Partially Implemented (PARTIAL) △

- `StructuredLayoutSystem` reflows sections and product grids, but it contains fixed Basic-template coordinates, heights, gaps, card sizes, and header ranges.
- `ResponsiveSystem.ensureSceneOverrides()` creates breakpoint snapshots by scaling complete transforms and typography rather than storing semantic intent.
- `resolveNodeForWidth()` adjusts horizontal geometry and selected heading sizes, but it is not a layout pass and cannot reflow changed text or nested content.
- Header navigation has one measurement-driven public chrome path, while Scene Graph header-node placement still uses hardcoded ranges in structured reflow.
- Grid collapse exists for the Basic product section through section-specific formulas, not a generic grid layout mode.
- Existing responsive inspector controls edit overrides, but do not expose layout intent, sizing modes, constraints, or diagnostics.

## Technical Debt

- `StructuredLayoutSystem` calls the module-global `responsiveSystem` even when a kernel-owned system exists.
- `LayoutData.constraints`, `autoLayout`, and `responsive` are weak records at the core schema boundary.
- Template generators encode substantial responsive geometry directly in scene factories.
- The public renderer has separate structured and legacy scaling branches.
- The legacy `flex` layout enum value is declared but no renderer/layout engine consumes it.

## Regression Risk

- High: changing layout defaults could reposition every existing absolute template; compatibility must default to absolute and preserve old geometry.
- High: resolving responsive data twice can scale or override transforms twice between storefront preparation and `RenderNode`.
- High: text measurement differences between browser fonts and deterministic tests can create unstable section heights.
- Medium: generic auto-layout may conflict with manually transformed breakpoint overrides unless manual intent wins explicitly.
- Medium: removing public root scaling without converting legacy geometry can cause overflow or excessive whitespace.
- Medium: auto-fixes must be command-backed and advisory-only; diagnostics cannot mutate merchant documents implicitly.

## Next Actions

1. Introduce validated layout/sizing/constraint/responsive-intent types with absolute compatibility defaults.
2. Add a kernel-owned intrinsic measurement service and generic layout engine with immutable scene computation.
3. Inject the kernel responsive system into structured layout and route generic containers through the new engine before legacy compatibility adapters.
4. Add a node-type Responsive Rule Registry and diagnostic engine with explicit, command-ready fixes.
5. Integrate layout intent and diagnostics into the existing inspector without redesigning the panel.
6. Resolve public scenes into logical browser-width geometry and remove storefront-root CSS scaling.
7. Add unit and browser tests at certified widths, then run all repository gates before writing the Phase 4 end audit.
