# Production Resize Performance Contract

## Frame architecture

- Pointer and Moveable events only compute the newest absolute transform patch.
- `TransformSystem` owns the single `requestAnimationFrame` preview gate.
- Repeated events before paint replace `pendingTransforms`; they do not publish extra store updates.
- One atomic preview map is published to the transform store and preview listeners.
- Renderer, Overlay, Inspector, and dimension labels consume this same preview map.
- Scene Graph is not mutated until `commitTransform()`.

## React integration requirement

To preserve the 500-1000 node guarantee, scene-node components must not subscribe to the entire preview map. Each node selects only its own preview transform and uses an equality comparator. Non-selected nodes then retain the same selected value and do not re-render.

```ts
const preview = useTransformStore(
  (state) => state.previewTransforms[nodeId],
  shallowTransformEqual,
);
```

Do not subscribe every scene node to `state.previewTransforms`.

## DOM and layout rules

- No `getBoundingClientRect`, `offsetWidth`, `offsetHeight`, computed style, or DOM query runs in a resize event handler.
- Moveable `useAccuratePosition` stays disabled because it uses bounding-client-rect positioning.
- Width and height badges and Inspector dimensions read the RAF-published preview map.
- Moveable may call `updateRect()` once per camera or committed-scene change. This camera-only RAF gate must not subscribe to transform previews.
- The adapter never mutates scene-node DOM; rendering remains owned by Renderer System.

## Selection visual ownership

- SVG Overlay owns the only visible 2px selection outline and live dimension badge.
- Moveable owns interactive resize and rotation handles.
- `hideDefaultLines` remains enabled on Moveable. Removing it recreates the duplicate selector bug.
- Overlay visuals use screen-space geometry from Viewport System and non-scaling strokes.

## Commit rules

- Preview updates are ephemeral and active-node-only.
- History, Command System, and Scene Graph receive one final transform at gesture end.
- Cancel discards pending and published preview state without Scene Graph mutation.
