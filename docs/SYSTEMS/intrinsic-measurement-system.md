# Intrinsic Measurement System

## Purpose
Provides one deterministic, cached service for measuring text, media, buttons, and content containers without layout-thrashing DOM queries.

## Owns
- Intrinsic measurement provider registry.
- Bounded measurement cache.
- Text wrapping and line-height measurement policy.

## Does NOT Own
- Node dimensions persisted in the Scene Graph.
- Asset upload state.
- Auto-layout placement.
- Browser rendering.

## Public API
```ts
interface IntrinsicMeasurementSystemAPI {
  register(type: ElementType | "custom:*", provider: IntrinsicMeasurementProvider): () => void;
  measure(node: SceneNode, context?: IntrinsicMeasureContext): Size;
  invalidate(nodeId?: string): void;
}
```

## Depends On
- Scene Graph node types.
- `OffscreenCanvas` when available, with a deterministic fallback.

## Folder
`src/layout/measurement/`

## State Ownership
The system exclusively owns its ephemeral provider map and bounded cache. It writes no document or UI store.

## Event Flow
Layout/diagnostic request -> intrinsic provider -> cached `Size` -> Layout Engine or Responsive Diagnostics. Resulting document changes still flow through Commands.

## Performance Notes
- No synchronous DOM measurements are used.
- Cache keys include content, typography, intrinsic media size, available size, and node revision.
- Cache size is bounded to prevent unbounded editor-session memory growth.

## Known Pitfalls / Anti-Patterns
- Do not call `getBoundingClientRect()` from measurement providers.
- Do not persist a measurement as document truth without a layout command.
- Custom font metrics may differ until fonts are available; providers can be replaced per platform.

## Extensibility
Custom elements register a provider by exact type or `custom:*`. Asset-backed providers may resolve authoritative media metadata before calling the layout pass.
