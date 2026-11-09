# Phase 4 End Architecture Audit

Date: 2026-08-01

Status: Phase 4 is implemented and verified for the local editor and storefront runtime. The Scene Graph now carries typed layout intent, the kernel owns layout measurement/rules/diagnostics, editor changes remain command-backed, and public rendering uses logical viewport geometry without a root CSS scale. This does not make the complete roadmap production-ready: the Phase 3 remote Supabase publication-history gate is still unresolved, and the wider browser/device certification remains assigned to Phase 9.

## Implemented (PASS) ✓

- `LayoutData` now validates and types `absolute`, `horizontal`, `vertical`, `grid`, and `overlay` modes while preserving legacy `flex` documents through a compatibility alias.
- Width and height independently support `fixed`, `hug`, `fill`, `minmax`, and `percentage` sizing with minimum/maximum bounds.
- Auto layout supports direction, four-side padding, row/column gap, alignment, distribution, wrap, grid columns, minimum column width, child order, and absolute children.
- Horizontal and vertical constraints support start/end/center/stretch/scale plus fixed/fill/hug behavior without UI-owned geometry math.
- `IntrinsicMeasurementSystem` centrally measures text wrapping, images/media, buttons, and child-backed containers. It uses browser canvas metrics when available, deterministic fallback metrics in tests, and a bounded cache instead of querying layout DOM during a layout pass.
- `ResponsiveRuleRegistry` owns per-node-type safe widths/heights, readable font minima/maxima, touch targets, aspect-ratio policy, wrapping/stacking behavior, and semantic node overrides.
- `LayoutEngine` performs immutable Scene Graph computation, resolves each breakpoint, respects explicit manual breakpoint transforms, preserves negative coordinates, and persists reflow only when the caller dispatches a command.
- Newly inserted generic sections use semantic vertical/horizontal layout, fill/hug sizing, child order, and responsive intent instead of template-specific Desktop/Tablet/Mobile coordinate formulas.
- Existing structured templates are incrementally adapted: their root page and top-level section flow use the generic engine while native template geometry remains backward compatible.
- The kernel owns independent intrinsic-measurement, responsive-rule, layout-engine, structured-layout, and responsive-diagnostics instances. `StructuredLayoutSystem` no longer reaches into a hidden global responsive owner in the active kernel path.
- `ResponsiveDiagnosticsSystem` detects horizontal overflow, clipped content, unreadable or oversized text, fixed-height text loss, header collisions, undersized grid cards, invalid touch targets, and hidden critical controls.
- Diagnostics are advisory, never publish blockers. The inspector exposes `Fix automatically` when a deterministic fix exists, plus `Review suggested fix`, `Edit breakpoint`, and `Ignore advisory` actions.
- Diagnostic fixes clone the scene, persist only the active breakpoint override, pass through generic reflow and validation, and enter the editor through one `SceneReplace` command/history entry.
- The inspector exposes layout mode, axis sizing, padding, gap, alignment, distribution, wrap, grid behavior, constraints, narrow-screen behavior, overflow intent, aspect policy, and minimum readable text size.
- Generic property and inline-text edits trigger one command-backed reflow; live node data is still owned by the Scene Graph rather than inspector-local state.
- The storefront resolves an immutable logical scene for the browser viewport before rendering and marks it as layout-resolved so `RenderNode` cannot apply responsive geometry a second time.
- Public Scene Graph roots no longer use CSS `transform: scale(...)` or CSS `zoom`. Editor camera zoom remains presentation-only and does not alter persisted logical dimensions.
- A real Chrome Playwright probe certifies `320`, `390`, `768`, `1024`, and `1440` pixel widths for no root scaling, no horizontal document overflow, mobile grid collapse, and minimum touch-target dimensions.
- Layout, measurement, rule-registry, and diagnostic ownership contracts are documented in `docs/SYSTEMS/`.

## Verification

| Gate | Result |
|---|---|
| `npx tsc --noEmit` | Pass |
| focused Phase 4 regression suite | Pass: 9 files, 33 tests |
| `npm run test -- --maxWorkers=1` | Pass: 85 files, 315 tests |
| `npm run lint` | Pass: 0 errors; 20 Fast Refresh warnings |
| `npm run build` | Pass: Vite 6.4.3, 2,279 modules transformed |
| public bundle isolation | Pass: 24 reachable public chunks |
| security-header verification | Pass: 6 headers and 7 mandatory CSP directives |
| `npm run verify:production-audit` | Pass with one reviewed SPA-inapplicable advisory; exception expires 2026-09-01 |
| `npm run test:e2e` | Pass: 2 real-browser tests |
| certified responsive widths | Pass in Chrome at 320, 390, 768, 1024, and 1440 pixels |
| precomputed-scene double-resolution regression | Pass: public X/width geometry remains unchanged in `SceneRenderProvider` |
| command/history integration | Pass: layout and diagnostic changes dispatch one scene command rather than mutating stores |

## Missing (FAIL) ✗

- The full Chrome/Firefox/Safari and physical-device matrix is not certified yet; that production-readiness work belongs to Phase 9.
- The unresolved Phase 3 target-Supabase publication-history/RLS gate still prevents a complete production-release claim.
- Visual screenshot baselines for every existing theme at every certified width are not yet part of CI; functional responsive assertions are present, but broad visual regression is a Phase 9 requirement.

## Partially Implemented (PARTIAL) △

- Existing Basic, Atelier, and Noir Chrono scenes retain native breakpoint geometry and compatibility formulas. New generic sections use the semantic layout engine, but migrating every historical template coordinate to intrinsic layout would be a separate, high-risk compatibility migration.
- Completely legacy, non-structured scenes are fitted through logical geometry resolution rather than CSS root scaling. This prevents browser zoom/overflow defects but cannot infer full semantic reflow intent from old absolute-only data.
- Header collisions are detected and surfaced with Review/Edit/Ignore actions. There is deliberately no blind auto-fix when the system cannot safely infer merchant navigation priority or grouping.
- Text measurement is browser-metric-backed, but exact font metrics can still change after a remote font finishes loading; font-load invalidation should be exercised across the Phase 9 browser matrix.

## Technical Debt

- The deprecated `flex` layout value must remain readable until persisted documents have been migrated to explicit horizontal/vertical modes.
- Historical template generators still contain fixed coordinates for their native art direction and must remain behind the compatibility path until visual parity fixtures exist.
- The intrinsic measurement cache is bounded per kernel but currently uses entry-count eviction rather than byte-aware pressure signals.
- Twenty Fast Refresh export-boundary warnings remain outside the Phase 4 runtime behavior.
- The reviewed React Router advisory exception expires on 2026-09-01 and must be renewed or removed by dependency remediation.

## Regression Risk

- High: removing historical template compatibility formulas before parity fixtures exist would reposition published stores.
- High: resolving a scene both in the storefront surface and again in `RenderNode` would corrupt responsive geometry; the new regression test must remain mandatory.
- Medium: changing manual-breakpoint precedence could overwrite merchant-authored positions during generic reflow.
- Medium: font metric drift can change hug-height content after font load; layout invalidation must remain deterministic and command-free for read-only storefront resolution.
- Medium: an overly aggressive diagnostic auto-fix could change merchant intent; only deterministic fixes may be command-enabled and all diagnostics must remain advisory.
- Low: the public bundle remains isolated from editor-only layout UI and diagnostics modules by the existing bundle traversal gate.

## Next Actions

1. Start Phase 5 with its architecture audit and map component definitions, instances, variants, slots, detach/swap behavior, and override ownership against the current Scene Graph.
2. Preserve the Phase 4 rule that component/layout edits enter document state through Commands and that public rendering consumes an already-resolved logical scene exactly once.
3. Add component-instance tests across responsive layout modes before changing any existing template to components.
4. Resolve the Phase 3 Supabase publication-history/RLS gate in parallel; do not describe the product as release-ready until that external verification passes.
5. Expand visual and browser/device certification in Phase 9 rather than weakening the current compatibility boundary.
