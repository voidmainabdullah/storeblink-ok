# Layout Engine

## Purpose
Computes immutable Scene Graph geometry for absolute, horizontal, vertical, grid, and overlay layouts at a requested responsive breakpoint.

## Owns
- Generic flow, wrap, grid, sizing, constraint, and hug-content computation.
- The set of node IDs touched by a layout pass.
- Compatibility fitting of unmanaged absolute children at non-canonical storefront widths.

## Does NOT Own
- Persisted Scene Graph state.
- Breakpoint activation or responsive override storage.
- Inspector state, Commands, or History.
- Browser viewport zoom and pan.

## Public API
```ts
interface LayoutEngineAPI {
  hasGenericLayout(scene: SceneTree): boolean;
  compute(scene: SceneTree, options: LayoutPassOptions): LayoutComputationResult;
  reflowScene(scene: SceneTree): SceneTree;
  resolveSceneForViewport(scene: SceneTree, viewportWidth: number): LayoutComputationResult;
}
```

## Depends On
- Responsive System.
- Intrinsic Measurement System.
- Responsive Rule Registry.
- Scene Graph cloning and validation.

## Folder
`src/layout/engine/`

## State Ownership
None. Computation returns a cloned scene. Editor callers commit the result through one Command; storefront callers consume the resolved clone as read-only data.

## Event Flow
Property or structure command preparation -> Layout Engine reflow -> validated Scene Graph -> one Scene Replace Command -> History/Recovery/Renderer. Public viewport resize -> read-only viewport resolution -> Renderer.

## Performance Notes
- Layout does not run during pointer preview frames.
- Intrinsic measurements are cached and bounded.
- Only touched transforms are persisted during breakpoint reflow.
- Public resolution performs no DOM queries and requires no CSS root scaling.

## Known Pitfalls / Anti-Patterns
- Do not call `reflowScene()` for every pointer move.
- Do not resolve a scene before render and then apply responsive overrides a second time.
- Do not mutate a returned computation and treat it as persisted truth without a Command.
- Manual breakpoint transforms remain authoritative and must not be reflowed.

## Extensibility
New element types register responsive safety rules and optional intrinsic measurement providers. New sections opt in declaratively through `LayoutData`; no theme-specific reflow function is required.
