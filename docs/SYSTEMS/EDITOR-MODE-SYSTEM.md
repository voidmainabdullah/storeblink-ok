# Editor Mode System

## Purpose
Controls which editor capabilities are available in Fixed and Independent modes without changing Scene Graph data or element implementations.

## Owns
- The active editor mode for the current editor runtime.
- The capability policy for content, image, transform, style, and structural mutations.
- Mode change subscriptions used by editor UI and interaction adapters.

## Does NOT Own
- Scene Graph nodes or persisted storefront data.
- Selection, transform previews, commands, or history.
- Inspector values or viewport state.

## Public API
```ts
interface EditorModeSystemAPI {
  getSnapshot(): EditorMode;
  subscribe(listener: () => void): () => void;
  setMode(mode: EditorMode): void;
  can(capability: EditorCapability, node?: SceneNode | null): boolean;
  filterContentPatch(node: SceneNode, patch: Record<string, unknown>): Record<string, unknown>;
}
```

## Depends On
- Scene Graph node types for node-aware content permissions.

## Folder
`src/interaction/modes/`

## State Ownership
The system owns only ephemeral editor-mode state. It does not write any Zustand document store.

## Event Flow
The editor switcher changes the mode. Transform, inspector, layer, toolbar, keyboard, and inline-text entry points query the same kernel-owned system before dispatching commands.

## Performance Notes
Mode snapshots are primitive values and only notify on an actual mode change. Pointer hot paths use a direct capability check and do not trigger React renders.

## Known Pitfalls / Anti-Patterns
- Hiding a button is not authorization; mutation handlers must enforce the policy too.
- Fixed mode must not fork or duplicate Scene Graph state.
- The system is a UX capability boundary, not an account authorization mechanism.

## Extensibility
Future element types can participate through node-aware capability rules without adding template-specific branches to the editor.
