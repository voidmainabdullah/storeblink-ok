# PHASE 3 — Geometry Engine, Coordinate System & Hit Testing Foundation (Enhanced)

## Role

Principal Software Architect / Senior TypeScript Engineer / Performance Specialist, continuing the same engine.

## Required Reading Before You Start

- `docs/ARCHITECTURE.md` §9.5 (Viewport → Coordinate System dependency), §9.8 (Hit Testing spec), §10 (System Index — note there is one Geometry System, not three).
- `docs/PHASE-1-SUMMARY.md` — you will use `NodeMeta.locked`/`NodeMeta.hidden`/`NodeMeta.updatedAt` and the Engine Event Bus events (`scene:node:created/updated/deleted/moved`) directly. Do not add parallel flags or a second event mechanism.
- `docs/PHASE-2-SUMMARY.md` — **critical.** Phase 2 already created `rendering/coordinate/` (`documentToScreen`, `screenToDocument`, `composeTransform`) and a placeholder pair of geometry helpers inside `rendering/visibility/` (`getNodeBounds`, `rectsIntersect`), explicitly marked as temporary pending this phase.

If anything here conflicts with `ARCHITECTURE.md` or with what Phase 2 already built, flag it — don't silently duplicate or overwrite.

## Hard Constraints

Same as prior phases: no UI redesign, no rewriting working code, no deleted functionality, preserve backward compatibility, reuse existing code, architecture before features.

## Explicit Out of Scope for Phase 3

Selection, Overlay, Transform, Resize, Rotate, Move (as an interaction), History, Command System, Inspector, Drag & Drop, Snap, Keyboard shortcuts, Moveable, Selecto.

This phase provides math and lookup. It provides no way for a user to touch anything.

---

## Step 0 — Architecture Audit (Gate — do not skip)

1. Analyze: current coordinate/bounding-box calculations, element positioning, nested-element rendering, existing pointer/mouse math, existing utility functions.
2. Specifically identify and list every place the current code calls `getBoundingClientRect()` or otherwise measures the live DOM for geometry — this is the concrete debt this phase exists to make unnecessary going forward. You are not required to fix existing call sites (don't rewrite working code), but the new systems must not reproduce this pattern.
3. Produce **`docs/PHASE-3-AUDIT.md`** with the above, plus reusable vs. rewrite-candidate code.
4. **Stop and wait for explicit confirmation before Step 1.**

---

## Step 1 — Geometry System

**Consolidation vs. the original brief**, which split this into three: "Geometry Engine," "Spatial Utilities," and "Bounding Box System." All three describe internal concerns of one system (`ARCHITECTURE.md` §10, #14) — vectors, matrices, bounds, and intersection tests are organized as internal files inside one module, not three top-level architecture layers with their own folders.

Pure functions only. No DOM access, no state, no store.

```ts
// vectors
add(a: Point, b: Point): Point
subtract(a: Point, b: Point): Point
scale(p: Point, factor: number): Point
distance(a: Point, b: Point): number

// matrix
composeMatrix(transform: TransformData): Matrix2D
multiplyMatrix(a: Matrix2D, b: Matrix2D): Matrix2D
applyMatrix(m: Matrix2D, point: Point): Point

// bounds
getAABB(node: SceneNode): Rect              // axis-aligned bounds, local/parent space
getOBB(node: SceneNode): Polygon            // oriented (rotated) bounds — 4 corner points
getChildrenBounds(node: SceneNode, sceneGraph: SceneGraphAPI): Rect
unionBounds(rects: Rect[]): Rect

// intersection / containment
rectsIntersect(a: Rect, b: Rect): boolean
pointInRect(p: Point, r: Rect): boolean
pointInPolygon(p: Point, poly: Polygon): boolean   // needed for OBB hit testing on rotated nodes
```

**Folder:** `src/rendering/geometry/` (internal files: `vectors.ts`, `matrix.ts`, `bounds.ts`, `intersection.ts`, `index.ts` as the public surface).

---

## Step 2 — Coordinate System (Extend, Don't Recreate)

Phase 2 already built `documentToScreen`/`screenToDocument`/`composeTransform` in `src/rendering/coordinate/`. This phase **adds to that file**, it does not create a parallel one.

New responsibility: nested coordinate conversion — a node inside a rotated/scaled parent needs its bounds resolved in document space by composing the *entire* ancestor chain, not just the single viewport-level conversion Phase 2 needed.

```ts
// existing from Phase 2 — unchanged
documentToScreen(point: Point, viewport: ViewportState): Point
screenToDocument(point: Point, viewport: ViewportState): Point

// new in Phase 3
localToParent(point: Point, node: SceneNode): Point
parentToLocal(point: Point, node: SceneNode): Point
getWorldTransform(node: SceneNode, sceneGraph: SceneGraphAPI): Matrix2D   // composed ancestor matrix
localToWorld(point: Point, node: SceneNode, sceneGraph: SceneGraphAPI): Point
worldToLocal(point: Point, node: SceneNode, sceneGraph: SceneGraphAPI): Point
```

`getWorldTransform` is the one function worth caching (Step 5) — recomputing a full ancestor chain on every hit test for every node is the kind of expensive-repeated-calculation the audit step is looking for.

**Folder:** `src/rendering/coordinate/` (same folder as Phase 2 — add files, don't branch).

---

## Step 3 — Hit Testing System

Finds the Scene Graph node under a point. Returns node IDs, never DOM elements.

```ts
interface HitTestingAPI {
  hitTest(point: Point): NodeId | null;     // topmost eligible node under point, document space
  hitTestRegion(rect: Rect): NodeId[];       // for future marquee selection
  rebuildIndex(): void;                       // triggered by scene:node:* events, not called manually
}
```

Rules:
- **Never reads the DOM.** Bounds come from `getAABB`/`getOBB` (Step 1) applied to `getWorldTransform` (Step 2) — i.e., purely from Scene Graph data. This is the exact anti-pattern the Step 0 audit told you to go find; don't reintroduce it here.
- **Respects `node.meta.locked` and `node.meta.hidden`** from the Phase 1 schema directly — locked/hidden nodes are never returned. Do not add a second flag system.
- **Resolves z-order correctly.** When bounds overlap, return the node that paints on top — determined by tree traversal order (depth-first, later siblings/deeper descendants on top), not by which node happens to be checked first in a loop.
- **Spatial index, built now (this is a deliberate departure from Phase 2's "linear scan is fine for now"):** hit testing runs on every pointer move once interaction lands in Phase 4, which is a much tighter performance budget than Phase 2's culling pass (which only runs on pan/zoom). A basic uniform grid-bucket index is enough — it doesn't need to be a full R-tree/quadtree yet, but a linear scan here will visibly lag on a few hundred overlapping nodes. Keep it behind the `hitTest`/`hitTestRegion` API so a smarter index can replace the bucket structure later without touching call sites.
- Index rebuilds are driven by subscribing to the Phase 1 Engine Event Bus (`scene:node:created/updated/deleted/moved`), not by polling or manual calls scattered through the codebase.

**Folder:** `src/rendering/hit-testing/`

---

## Step 4 — Fulfill Phase 2's Placeholder

**This replaces the vague "Render Integration" step in the original brief with a concrete, checkable task.**

Phase 2's `rendering/visibility/` module currently defines its own `getNodeBounds`/`rectsIntersect` as an explicitly-temporary stand-in. Now that the real Geometry System exists:

- Update `rendering/visibility/` to import `getAABB`/`rectsIntersect` from `rendering/geometry/` and delete its local placeholder implementations.
- No other change to Renderer is required — Renderer already reads `node.transform` directly for positioning and continues to do so; Geometry/Hit Testing are consumed by future systems (Selection, Overlay, Phase 4+), not by Renderer itself.

---

## Step 5 — Performance

- Cache `getWorldTransform(node)` results, keyed by `nodeId` + `node.meta.updatedAt`. Invalidate the cache entry on `scene:node:updated` for that node (and its descendants, since a parent's transform change invalidates every descendant's world transform) — reuse the Phase 1 Event Bus rather than inventing a new invalidation mechanism.
- Reuse `Rect`/`Point`/`Matrix2D` objects where possible instead of allocating new ones per call in hot paths (hit testing, culling).
- No repeated DOM reads anywhere in Geometry, Coordinate, or Hit Testing — this is the load-bearing constraint of this whole phase.

---

## Step 6 — Stores

**None.** This is the third phase in a row where the original brief asks for a store that isn't actually reactive state:

- Geometry System is pure functions — literally nothing to store (the original brief's own Step 2 says "must remain pure," which directly contradicts its own Step 9 asking for a "Geometry Store").
- Coordinate System is pure functions — same reasoning, no "Coordinate Store."
- Hit Testing's spatial index is internal system state that nothing in the UI subscribes to or re-renders on — it's queried imperatively (`hitTest(point)`), not observed. Expose it as a module-level singleton, updated via Event Bus subscription, not a Zustand store.

**Given this is now the third occurrence** (Phase 1: no "Engine Store," Phase 2: no "Renderer Store," Phase 3: no Geometry/Coordinate/Hit-Test stores), it's worth promoting this from a per-phase correction to a standing rule in `ARCHITECTURE.md` — e.g. added to §3 (Principles) or §14 (Coding Standards): *"A Zustand store exists only for state a React component needs to subscribe to and re-render on. Systems with internal-only state (registries, indexes, caches) expose it through an imperative module API instead."* Add this now so it doesn't need re-deriving in Phase 4.

---

## Step 7 — Folder Structure

```
src/
└── rendering/
    ├── geometry/           # new — vectors, matrix, bounds, intersection (internal files)
    ├── coordinate/         # extended, not recreated (Phase 2 + Phase 3 additions in one module)
    ├── hit-testing/        # new — spatial index + hitTest/hitTestRegion
    └── visibility/         # existing (Phase 2) — now imports from geometry/, no local placeholders
```

No top-level `math/`, `bounds/`, `vectors/`, `matrix/`, `intersection/`, `types/`, `utils/` folders — these are internal organization within `rendering/geometry/`, per the one-system-one-folder rule.

---

## Step 8 — Verification Gate

- [ ] `npm run test` green, including:
  - Geometry: AABB/OBB correctness against known fixtures, rotation math, `unionBounds`, containment/intersection edge cases (touching edges, fully-contained rects).
  - Coordinate: round-trip test — `worldToLocal(localToWorld(p, node), node)` returns the original point across at least 3 levels of nested, independently rotated/scaled parents.
  - Hit Testing: correct topmost node returned for overlapping siblings; locked/hidden nodes correctly excluded; nested children resolve correctly.
- [ ] `npm run lint` passes
- [ ] `npm run build` succeeds
- [ ] `npm run dev` — manual smoke test, existing editor unchanged
- [ ] Informal perf check: `hitTest()` over a synthetic scene of 1,000+ nodes stays fast enough that a pointermove-driven caller wouldn't visibly lag (no formal benchmark harness yet — that's a later Performance System phase)
- [ ] No existing feature regressed

---

## Deliverables Checklist

- [ ] `docs/PHASE-3-AUDIT.md` (reviewed/approved before proceeding)
- [ ] Geometry System (`rendering/geometry/`) — vectors, matrix, bounds, intersection, all pure
- [ ] Coordinate System extended in place (`rendering/coordinate/`) with local/parent/world conversions
- [ ] Hit Testing System (`rendering/hit-testing/`) with basic spatial index, locked/hidden respect, correct z-order
- [ ] `rendering/visibility/` updated to consume the real Geometry System, placeholders removed
- [ ] `getWorldTransform` caching wired to the Engine Event Bus
- [ ] No new stores
- [ ] All Step 8 checks passing
- [ ] `docs/PHASE-3-SUMMARY.md` — what's built, what Phase 4 (Selection, Transform, Overlay) will call directly (`hitTest`, `getAABB`/`getOBB`, `getWorldTransform`), and confirmation that the ARCHITECTURE.md store rule (Step 6) was added

## Corrections Recap

1. Coordinate System extended, not duplicated — Phase 2's module gets new functions, doesn't get a sibling.
2. Geometry Engine + Spatial Utilities + Bounding Box System merged into one Geometry System, matching `ARCHITECTURE.md`'s actual system count.
3. Hit Testing derives all geometry from Scene Graph data — never the DOM.
4. No Geometry/Coordinate/Hit-Test stores — internal system state isn't reactive UI state. Recommend formalizing this as a permanent rule in `ARCHITECTURE.md` given it's now recurred three phases running.
5. Phase 2's placeholder geometry helpers are retired here, as promised, without changing `visibility/`'s call sites.

## Stop Condition

Do not implement Selection, Transform, or Overlay even partially — not even a "just to test hit testing works" throwaway click handler. If you need one to verify `hitTest()` manually, note it in `PHASE-3-SUMMARY.md` as a Phase 4 dependency and verify via the unit tests instead.
