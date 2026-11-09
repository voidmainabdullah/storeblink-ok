# PHASE 2 — Rendering Engine, Canvas & Viewport Foundation (Enhanced)

## Role

Principal Software Architect / Senior React-TypeScript Engineer / Performance Engineer, continuing work on the same enterprise visual editor engine (Canva/Figma/Framer/Penpot-class).

## Required Reading Before You Start

- `docs/ARCHITECTURE.md` — sections 5 (Layers), 6 (Folder Structure), 9.5–9.9 (Viewport, Canvas, Renderer, Hit Testing, Overlay specs), 11.1 (render flow).
- `docs/PHASE-1-SUMMARY.md` — this phase builds directly on top of Phase 1. Do not create a parallel data source.
- **You must consume, not duplicate, Phase 1's output:** `scene.store` (the node tree) and the Engine Event Bus events `scene:node:created` / `scene:node:updated` / `scene:node:deleted` / `scene:node:moved`.

If anything here conflicts with `ARCHITECTURE.md`, flag it — don't silently resolve it in code.

## Hard Constraints

Same as Phase 1: no UI redesign, no rewriting working code, no deleted functionality, no duplicated logic, preserve backward compatibility, reuse existing code, architecture before features.

## Explicit Out of Scope for Phase 2

Selection, Transform (move/resize/rotate), Snap, History, Command System, Overlay, Keyboard shortcuts, Inspector, Drag & Drop, Property editing, Moveable/Selecto integration, Hit Testing (needs interaction to be meaningful), Geometry System (full spatial-index version — Phase 2 only needs two pure bounding-box helpers, see §8), Computation/Invalidation System (the *full* dependency-cascading version — see §4 for why and what Phase 2 builds instead).

This phase renders the Scene Graph. It does not let anyone touch it.

---

## Step 0 — Architecture Audit (Gate — do not skip)

1. Analyze current: canvas rendering approach, React component hierarchy, render flow, existing viewport implementation (if any), existing DOM structure, rendering bottlenecks, unnecessary nesting/renders.
2. Produce **`docs/PHASE-2-AUDIT.md`**: what exists vs. what this phase specifies, what's reusable, what's a rewrite candidate (don't touch yet — just list), specific render-performance risks given the current approach.
3. **Stop and wait for explicit confirmation before Step 1.**

---

## Step 1 — Coordinate System

**Addition vs. the original brief**, which folded coordinate conversion into Viewport. `ARCHITECTURE.md` §9.5 lists Coordinate System as something Viewport *depends on*, not something Viewport *is* — keeping it separate means Renderer and (later) Hit Testing/Overlay can all use the same conversion math without reaching into Viewport's internal state.

Stateless, pure functions — no store, no React:

```ts
documentToScreen(point: Point, viewport: { zoom: number; pan: Point }): Point
screenToDocument(point: Point, viewport: { zoom: number; pan: Point }): Point
composeTransform(...): Matrix   // for nested-node absolute positioning
```

**Folder:** `src/rendering/coordinate/`

---

## Step 2 — Viewport System

Zoom, pan, camera position, visible-region bounds. Wraps Step 1's pure functions with actual current state.

```ts
interface ViewportAPI {
  zoomTo(level: number, origin?: Point): void;
  panBy(delta: Point): void;
  panTo(point: Point): void;
  getVisibleRegion(): Rect;          // document-space — feeds Step 8 culling
  screenToDocument(p: Point): Point; // delegates to Coordinate System
  documentToScreen(p: Point): Point;
  fitToContent(nodeIds?: NodeId[]): void;
}
```

Backed by `viewport.store` (Zustand — this is genuinely reactive UI state; components need to re-render on zoom/pan).

**Folder:** `src/rendering/viewport/`

---

## Step 3 — Canvas System

Workspace surface — independent of both the node tree and the camera. Canvas size, background, workspace bounds, canvas configuration. Grid/rulers/guides: stub the interfaces now, implement later (Overlay-adjacent, not required for Phase 2 to render nodes).

**Naming note — this confirms the Phase 1 correction:** Phase 1 renamed the node-tree store from `canvas.store` to `scene.store` specifically so this phase could use `canvas.store` for what it actually should mean — workspace-surface state, not the node tree. If Phase 1 wasn't done first, apply that rename now before creating this store.

**Folder:** `src/rendering/canvas/`, store: `canvas.store.ts`

---

## Step 4 — Renderer System

Owns the render tree / draw calls / DOM reconciliation for nodes. Knows nothing about Selection, History, Transform, or Inspector.

```ts
interface RendererAPI {
  renderNode(node: SceneNode): ReactNode;
  invalidate(nodeId: NodeId): void;
  flush(): void;
}
```

**Why `invalidate`/`flush` exist but the full Invalidation System doesn't (yet):** `ARCHITECTURE.md` §10 lists a full Computation/Invalidation System as a separate Core system — that one handles *derived/computed* value cascades (a resized parent recomputing auto-layout children, a changed Variable propagating to every node that references it). None of that exists yet (no Layout Engine, no Variables), so building it now would be architecture for a problem that doesn't exist yet.

What Phase 2 actually needs for "only changed nodes re-render" is simpler and mostly free: **each node-renderer component subscribes to its own node's slice of `scene.store` via a granular Zustand selector** (`useSceneStore(s => s.nodes[nodeId])`), not the whole tree. Zustand's selector equality check already prevents re-renders of unrelated nodes — that's most of the performance win, with zero new abstractions.

`invalidate(nodeId)`/`flush()` on the Renderer are a narrow escape hatch for forcing a redraw that *isn't* driven by a `scene.store` change (e.g. an image finishing async load, a font becoming available) — implement as a simple pending-set + `requestAnimationFrame` batch, not a dependency graph.

**Folder:** `src/rendering/renderer/`

---

## Step 5 — Renderer Registry

Maps element `type` → its renderer component. `register()`, `find()`, `renderNode()` (delegates to `find` + fallback), fallback renderer (renders a labeled placeholder box for unregistered/custom types).

Build this as a standalone exported registry, not logic embedded in the Renderer System's constructor — `ARCHITECTURE.md`'s future Custom Element Registry (Extension Layer, plugin phase) will call this exact same `register()` function when plugins add new element types. Don't build a second registration mechanism later; this is the one.

**Folder:** `src/rendering/registry/`

---

## Step 6 — Node Renderer Components

One presentational component per built-in type: Text, Image, Button, Container, Section, Shape, SVG, Video. Each is a pure function of `(node) => JSX` — no internal state, no event handlers (that's Phase 3+).

**Design rule to prevent duplicated logic across all eight:** recursive child-rendering is the Renderer System's job (a shared `renderChildren(node)` helper that any renderer can call), not something each of the eight components reimplements. Container/Section renderers call the shared helper for their children slot; they don't write their own tree-walk.

**Folder:** each lives with its element module — `src/elements/<type>/<Type>Renderer.tsx` — not centralized under `rendering/`, so element modules stay self-contained per `ARCHITECTURE.md`'s "elements are thin modules" principle.

**Note on "Page Renderer":** a Page (from Phase 1's Project Model) is not a `SceneNode` type — it's a pointer (`page.rootNodeId`) into the tree. There is no "page" entry in the Renderer Registry. The page-level entry point is a `ui/canvas-shell/` component that reads the current page from `project.store`, looks up its root node in `scene.store`, and calls the Renderer System starting there.

---

## Step 7 — Render Pipeline

This phase implements a **simplified subset** of the full flow in `ARCHITECTURE.md` §11.1:

```
Scene Graph → Renderer → Screen
                 ↑
             Viewport
```

The full pipeline (`Scene Graph → Layout Engine → Style System → Renderer → Overlay → Screen`) isn't buildable yet — Layout Engine and Style System are Layout Layer (later phase), Overlay is Interaction Layer (later phase). For now, Renderer reads each node's raw `transform`/`style` stub fields directly (from Phase 1's schema) rather than resolved/computed values. Don't build a fake "resolved style" layer to fill the gap — render the stub data as-is and let the real Style System replace it later without changing Renderer's call sites.

---

## Step 8 — Visibility / Culling (Basic)

**Addition vs. the original brief.** `ARCHITECTURE.md` §10 names this as its own system because it's the highest-leverage performance technique for a canvas holding thousands of nodes — and the original brief's Step 8 (React.memo, lazy rendering) doesn't mention it at all.

Phase 2 scope, deliberately minimal:
- `getNodeBounds(node): Rect` and `rectsIntersect(a, b): boolean` — two pure helpers (this is the only Geometry-System-shaped code this phase writes; the real Geometry System with a spatial index arrives alongside Hit Testing later and will replace this without changing call sites).
- Before rendering, skip (or don't mount) nodes whose bounds don't intersect `viewport.getVisibleRegion()`.
- Linear scan is fine for now — no quadtree/R-tree yet. That's a later optimization, not a Phase 2 blocker.

**Folder:** `src/rendering/visibility/`

---

## Step 9 — Performance

- Granular `scene.store` selectors (Step 4) are the primary lever — confirm this is working before reaching for anything else.
- `React.memo` on node renderer components, keyed on the node's own data, not the whole tree.
- Stable references (avoid inline object/function props that defeat memoization).
- Culling (Step 8) before any of the above matters for off-screen nodes.
- Avoid unnecessary component nesting inherited from the current implementation — flag in the audit, fix if low-risk, defer if not.

The full Performance System (profiling, memory monitor, budget enforcement) is a later phase (`ARCHITECTURE.md` §13, migration step 8) — this step is "don't do anything obviously wasteful," not a benchmarking harness.

---

## Step 10 — Stores

- `scene.store` — **already exists from Phase 1.** Do not recreate it.
- `canvas.store` — **new**, workspace-surface state (Step 3).
- `viewport.store` — **new**, camera state (Step 2).
- **No Renderer Store.** The type→component registry (Step 5) is static config, not reactive UI state — same category of correction as Phase 1's "Engine Store" fix. Expose it as a module-level singleton (`registerRenderer()` / `getRenderer()` exports), not a Zustand store.
- No Selection Store, no History Store (still out of scope).

---

## Step 11 — Folder Structure

Aligned to `ARCHITECTURE.md` §6, replacing the flat structure in the original brief:

```
src/
├── rendering/
│   ├── renderer/        # Renderer System core, invalidate()/flush()
│   ├── canvas/           # Canvas System + canvas.store
│   ├── viewport/         # Viewport System + viewport.store
│   ├── coordinate/       # stateless conversion math
│   ├── registry/         # Renderer Registry
│   └── visibility/       # basic culling helpers
├── elements/
│   ├── text/TextRenderer.tsx
│   ├── image/ImageRenderer.tsx
│   ├── button/ButtonRenderer.tsx
│   ├── container/ContainerRenderer.tsx
│   ├── section/SectionRenderer.tsx
│   ├── shape/ShapeRenderer.tsx
│   ├── svg/SvgRenderer.tsx
│   └── video/VideoRenderer.tsx
├── ui/
│   └── canvas-shell/     # page-level entry point, wires Viewport+Canvas+Renderer together
└── stores/
    ├── scene.store.ts    # Phase 1
    ├── canvas.store.ts   # new
    └── viewport.store.ts # new
```

---

## Step 12 — Verification Gate

- [ ] `npm run test` green — add tests for: Coordinate System conversions (round-trip screen↔document), culling bounds-intersection logic, Renderer Registry register/find/fallback.
- [ ] `npm run lint` passes
- [ ] `npm run build` succeeds
- [ ] `npm run dev` — manual smoke test: existing editor loads and behaves identically
- [ ] Manual sanity check: a scene with a few hundred nodes pans/zooms without visible jank (informal — the real Performance System does formal benchmarking later)
- [ ] No existing feature regressed

---

## Deliverables Checklist

- [ ] `docs/PHASE-2-AUDIT.md` (reviewed/approved before proceeding)
- [ ] Coordinate System (pure functions)
- [ ] Viewport System + `viewport.store`
- [ ] Canvas System + `canvas.store`
- [ ] Renderer System (`renderNode`, `invalidate`, `flush`) using granular `scene.store` selectors
- [ ] Renderer Registry (register/find/fallback)
- [ ] 8 node renderer components, each in its element module folder, sharing one recursive-children helper
- [ ] `ui/canvas-shell/` entry point wiring Viewport + Canvas + Renderer to the current page
- [ ] Basic visibility/culling pass
- [ ] All Step 12 checks passing
- [ ] `docs/PHASE-2-SUMMARY.md` — what's built, what's stubbed (grid/rulers/guides, full Geometry/spatial index, full Invalidation System), what Phase 3 (Selection/Transform/Hit Testing/Overlay) will depend on from this phase

## Corrections Recap (for continuity across phases)

1. `canvas.store` now correctly means workspace-surface state — confirms and depends on the Phase 1 rename of the node-tree store to `scene.store`.
2. Coordinate System extracted as its own stateless module rather than folded into Viewport.
3. No standalone Invalidation System this phase — granular selectors handle direct re-rendering; the full dependency-cascading system is deferred until Layout/Variables exist.
4. Visibility/Culling added as its own minimal step — was absent from the original brief despite being named in `ARCHITECTURE.md`.
5. No Renderer Store — the registry is static config, exposed as a module singleton.

## Stop Condition

Do not implement any Phase 3+ system (Selection, Transform, Hit Testing, Overlay, Command, History) even as a "quick hook." If the renderer seems to need one, note it in `PHASE-2-SUMMARY.md` as a Phase 3 dependency instead of building it here.
