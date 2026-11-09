# Dynamic Source System

## Purpose
Resolves live store, product, and collection values at the shared renderer boundary while persisted nodes retain references only.

## Owns
- Dynamic binding parsing and safe value resolution.
- Formatting of supported live fields.

## Does NOT Own
- Commerce database records.
- Scene Graph mutations.
- Editor selection or inspector UI state.

## Public API
```ts
interface DynamicSourceSystemAPI {
  resolveNode(node: SceneNode, data: DynamicSourceData): SceneNode;
}
```

## Depends On
- Scene Graph node types.

## Folder
`src/document/dynamic-sources/`

## State Ownership
None. Data is supplied by the editor preview or published storefront render context.

## Event Flow
RenderNode resolves breakpoint data, then dynamic bindings, then sends the resulting node to RendererRegistry. Editor preview and published storefront therefore use the same path.

## Performance Notes
Product records are indexed by ID once per provider value. Resolution clones only a bound node.

## Known Pitfalls / Anti-Patterns
- Never copy complete product or collection records into page JSON.
- Never fork dynamic resolution between editor and storefront.

## Extensibility
Additional source kinds and formatters can be registered without changing element renderers.
