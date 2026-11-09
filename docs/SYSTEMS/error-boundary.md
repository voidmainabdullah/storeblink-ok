# Scene Render Error Boundary

## Purpose
Contain unexpected renderer failures so an invalid asset or node cannot crash the editor shell or published storefront.

## Owns
- Render failure state for one mounted scene surface
- Retry of that surface

## Does NOT Own
- Scene validation
- Scene Graph data
- Persistence or recovery drafts

## Public API
```ts
type SceneRenderErrorBoundaryProps = {
  surfaceName: string;
  children: ReactNode;
  onRetry?: () => void;
};
```

## Depends On
- React error-boundary lifecycle only

## Folder
`src/infrastructure/error-boundary/`

## State Ownership
Local component failure state. It never writes document state.

## Event Flow
Renderer exception -> boundary fallback -> user retry -> renderer remount.

## Performance Notes
The boundary is inert during successful renders and introduces no Scene Graph subscription.

## Known Pitfalls / Anti-Patterns
- Do not use the boundary instead of validating scene data.
- Do not mutate or discard the current draft when rendering fails.

## Extensibility
Diagnostics reporting can subscribe through `onError` later without changing renderer contracts.
