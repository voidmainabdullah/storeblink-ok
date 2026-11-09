# Final Deep Resize Pipeline Audit

## Audited scope

The supplied archive contains only the transform boundary:

- `transform/MoveableAdapter.tsx`
- `transform/resizeMath.ts`
- `transform/state.ts`
- transform tests

The renderer, overlay, geometry, coordinate, responsive, scene graph, command,
history, selection, and store implementations are imported but not included.
Their contracts were audited from this boundary, but their internals cannot be
truthfully certified without the complete repository.

## Confirmed root causes

### 1. Resize position had no explicit handle invariant

The previous implementation applied `drag.beforeTranslate` to x/y for every
resize direction. That makes the engine trust Moveable translation even when the
mathematically correct translation is exactly zero.

For an axis-aligned node:

- east resize must keep x unchanged;
- south resize must keep y unchanged;
- south-east resize must keep both x and y unchanged;
- west resize changes x by `startWidth - currentWidth`;
- north resize changes y by `startHeight - currentHeight`.

Without these invariants, tiny nested-drag noise, stale target geometry, renderer
rounding, or a duplicate translation in another layer can move the object while
resizing from the right or bottom. This is the behavior visible in the supplied
screenshot.

### 2. Position and size were sourced from different authorities

Width/height came from Moveable's resize event while x/y came from its nested
drag event. For an unrotated rectangle, this is unnecessary and less stable than
solving all four values from one immutable start transform plus direction and
current size.

The corrected pipeline uses one authority:

- immutable transform captured at gesture start;
- current event width/height;
- current resize direction.

Moveable translation remains necessary only for rotated targets, where keeping a
transformed fixed point stationary requires world-space compensation.

### 3. Preview previously trailed Moveable by an extra frame

The transform system formerly deferred every preview publication. The corrected
scheduler publishes the first result immediately and coalesces only subsequent
high-frequency events to the latest absolute patch per animation frame.

### 4. Resize must never consume preview state as its next base

Every resize frame now resolves from the transform captured by
`beginTransform()`. Preview transforms are output only. They are never input to
the next frame, preventing cumulative drift and exponential x/y growth.

## Final execution flow

Pointer
→ Moveable resize event
→ immutable gesture snapshot
→ direction-aware pure resize math
→ atomic `{x, y, width, height}` preview
→ one preview store clock for renderer/overlay/inspector
→ one command at resize end

## Exact x/y rules now enforced

For rotation `0°`:

| Handle | x | y |
|---|---|---|
| East | unchanged | unchanged |
| South | unchanged | unchanged |
| South-East | unchanged | unchanged |
| West | `startX + startWidth - width` | unchanged |
| North | unchanged | `startY + startHeight - height` |
| North-West | both fixed-edge formulas | both fixed-edge formulas |

For rotated nodes, Moveable's start-relative `drag.beforeTranslate` is used.
`beforeDist` is never used and resize translation is never divided by viewport
zoom.

## Systems intentionally preserved

- rotation handlers;
- normal drag and snapping;
- scale handlers;
- responsive commit behavior;
- scene graph mutation boundary;
- commands, history, undo, and redo;
- selection and target resolution.

## Regression coverage

- east/south/south-east never modify x/y;
- west/north/north-west keep the opposite edge fixed;
- 500 right/bottom frames produce zero position drift;
- 500 left/top frames remain start-relative and exact;
- zoom from 0.25x to 4x does not alter resize math;
- rotated nodes use Moveable's start-relative translation;
- NaN and infinity cannot teleport a node.

## Integration limitation

This archive is not the full editor repository. Project-wide TypeScript,
Vitest, browser performance, renderer/overlay synchronization, and real DOM
Moveable integration must be run after these files are placed back into the host
project.
