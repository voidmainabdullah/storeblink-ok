# Transform System

## Purpose

Runs move, resize, rotate, and scale gestures as ephemeral previews, then commits one command when the gesture ends.

## Owns

- Active transform session
- Immutable gesture-start transforms
- RAF-coalesced preview transforms
- Gesture-local snap target index
- Temporary interaction elevation

## Does NOT Own

- Selection membership
- Persistent Scene Graph transforms
- Selection outline rendering
- Viewport camera state
- History stacks

## Public API

```ts
interface TransformAPI {
  beginTransform(ids: NodeId[], kind: TransformKind): void;
  updateTransform(delta: TransformDelta): void;
  commitTransform(): void;
  cancelTransform(): void;
  flushPreview(): void;
  getInitialTransform(nodeId: NodeId): TransformData | undefined;
  subscribePreview(listener: PreviewTransformListener): () => void;
}
```

## Depends On

- Scene Graph read API
- Command System
- Responsive System
- Snap Engine
- Interaction Elevation System
- Transform preview store

## Folder

`src/interaction/transform/`

## State Ownership

`TransformSystem` is the only writer of active gesture and preview transform state. Scene Graph changes occur only through the final transform command.

## Event Flow

Moveable input -> immutable-start transform math -> one RAF preview publication -> node renderer, Overlay, and Inspector -> pointer release -> one Command -> Scene Graph -> History.

## Performance Notes

- Pointer events replace the pending absolute patch; they never queue frame work.
- Snap sibling bounds are indexed once at gesture start.
- Only active node renderers subscribe to their own preview transform.
- Camera changes remeasure Moveable through a separate one-RAF gate.
- SVG Overlay owns the outline; Moveable renders handles with default lines hidden.

## Known Pitfalls / Anti-Patterns

- Do not use the previous preview as the next resize base.
- Do not divide Moveable resize width, height, or nested translation by viewport zoom.
- Do not mutate Scene Graph state during pointer movement.
- Do not subscribe Moveable camera measurement to preview frames.
- Do not let Moveable and SVG Overlay both render selection borders.

## Extensibility

Additional transform modes can emit absolute `TransformMapDelta` patches while retaining the same preview and single-command commit lifecycle.
