# Inspector System

## Purpose

Presents typed controls for the selected node and translates committed UI edits into command-backed Scene Graph updates.

## Owns

- Inspector section composition
- Local input drafts and disclosure state
- Type-specific control presentation
- Image export UI state

## Does NOT Own

- Node property values
- Transform preview state
- Scene Graph mutation
- Undo or redo stacks
- External image-processing credentials

## Public API

```ts
interface InspectorBindings {
  onRename(name: string): void;
  onUpdateTransform(patch: Partial<TransformData>): void;
  onUpdateProps(patch: Record<string, unknown>): void;
  onUpdateStyle(patch: Partial<StyleData>): void;
  onUpdateExtensions(patch: Record<string, unknown>): void;
}
```

## Depends On

- Engine editor command bindings
- Responsive System
- Selection and transform preview stores for read-only display
- Shared color picker
- Renderer property contracts

## Folder

`src/ui/inspector-panel/`

## State Ownership

Numeric and naming inputs keep local drafts until commit. Document values remain owned by Scene Graph and are changed through Commands. Rapid slider and text updates merge into one History entry when they target the same field.

## Event Flow

Selection -> resolved breakpoint node -> optional live transform preview -> typed control -> editor command binding -> Command System -> Scene Graph -> renderer and inspector refresh.

## Performance Notes

- The Inspector subscribes only to the selected node preview.
- Numeric transform values commit on blur or Enter.
- Rapid same-field commands coalesce in History.
- Image adjustments are renderer-backed SVG and CSS effects; export reuses the same adjustment model.

## Known Pitfalls / Anti-Patterns

- Do not add controls that only mutate local React state.
- Do not write directly to Scene Graph or Zustand document stores.
- Do not expose provider-dependent AI actions as successful without a configured provider.
- Structured template controls and generic controls must not render duplicate editors for the same property.

## Extensibility

Image background removal and enhancement accept provider callbacks. New element inspectors can compose the shared Header, Transform, Appearance, Typography, Image, and Export sections without changing command ownership.
