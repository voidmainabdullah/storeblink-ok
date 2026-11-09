# Structured Layout System

## Purpose
Resolves ordered Page to Section to Block documents into stable responsive Scene Graph geometry.

## Owns
- Deterministic section flow and root page height calculation.
- Compatibility block flow for existing registered patterns.
- Promotion of structured page roots to generic vertical flow.

## Does NOT Own
- Scene Graph persistence.
- Reorder interaction state.
- Command or History stacks.
- Freeform transforms.

## Public API
```ts
interface StructuredLayoutSystemAPI {
  isStructuredScene(scene: SceneTree): boolean;
  reflowScene(scene: SceneTree): SceneTree;
  reorderNode(scene: SceneTree, nodeId: NodeId, targetIndex: number): SceneTree;
}
```

## Depends On
- Responsive System.
- Layout Engine.
- Scene Graph cloning and validation.

## Folder
`src/layout/structured/`

## State Ownership
None. It returns a new validated SceneTree; callers commit it through the Command System.

## Event Flow
Reorder or add-section UI creates a transient order, calls reflow, then dispatches one scene replacement Command on drop.

## Performance Notes
Work is linear in the number of top-level sections and registered flow blocks. It never runs per pointer frame.

## Known Pitfalls / Anti-Patterns
- Do not persist section order as arbitrary z-index values.
- Do not run full reflow during every drag pointer event.

## Extensibility
New sections declare generic layout data and need no section-specific formula. Existing block resolvers remain compatibility adapters and can be retired as templates migrate.
