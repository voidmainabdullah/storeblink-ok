# Tool System

## Purpose

Owns the editor's active interaction tool so canvas input and UI controls always use the same mode.

## Owns

- Active editor tool (`select` or `hand`)
- Tool activation and reset transitions
- Active-tool subscriptions

## Does NOT Own

- Pointer coordinate conversion
- Viewport pan state
- Selection membership
- Node transforms

## Public API

```ts
interface ToolSystemAPI {
  activate(tool: "select" | "hand"): void;
  getActiveTool(): "select" | "hand";
  isActive(tool: "select" | "hand"): boolean;
  reset(): void;
  subscribe(listener: (tool: "select" | "hand") => void): () => void;
}
```

## Depends On

- `tool.store`

## Folder

`src/interaction/tools/`

## State Ownership

The Tool System is the only writer of `tool.store.activeTool`. React components read the store and call the Tool System API to change modes.

## Event Flow

Toolbar or canvas gesture -> Tool System -> `tool.store` -> CanvasShell input routing -> Selection or Viewport System.

## Performance Notes

Tool changes are low-frequency UI transitions. Canvas pointer movement does not write to the tool store.

## Known Pitfalls / Anti-Patterns

- Do not keep a second local hand-tool boolean in CanvasShell or a toolbar.
- Do not pan by mutating Scene Graph node transforms.
- Do not run selection hit testing while the hand tool owns the pointer gesture.

## Extensibility

Additional tools can extend `EditorTool` and route their pointer sessions through CanvasShell without changing viewport or document-state ownership.
