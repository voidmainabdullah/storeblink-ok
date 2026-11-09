# Section Registry System

## Purpose
Defines the structured storefront vocabulary used by the existing Engine: section types, allowed block types, setting schemas, capabilities, defaults, and validation rules.

## Owns
- Section and block definition registry.
- Settings schema metadata.
- Section/block compatibility and count validation.

## Does NOT Own
- Scene Graph node data.
- Selection, rendering, history, persistence, or commerce records.
- Direct store mutations.

## Public API
```ts
interface SectionRegistryAPI {
  registerSection(definition: SectionDefinition): () => void;
  getSection(type: string): SectionDefinition | undefined;
  listSections(): SectionDefinition[];
  getNodeSettings(node: SceneNode): SettingDefinition[];
  validatePlacement(
    scene: SceneTree,
    parentId: string,
  ): SectionPlacementValidation;
  validateScene(scene: SceneTree): StructuredSceneValidationResult;
}
```

## Depends On
- Scene Graph node types.
- Zod validation.

## Folder
`src/document/sections/`

## State Ownership
Registry metadata only. Persisted section and block values remain in Scene Graph nodes.

## Event Flow
The add-section UI asks this registry for a definition, validates the requested
root or compatible-container placement, creates a new subtree with unique IDs,
and dispatches one Command. The inspector reads the selected node schema and
dispatches field Commands. Rejected placement and block constraints are shown
in place and never create a partial scene.

## Performance Notes
Definitions are immutable after registration. Lookup is map-based and scene validation is linear in node count.

## Known Pitfalls / Anti-Patterns
- Do not hand-build inspector panels per section.
- Do not persist copied product payloads in section settings.
- Do not allow unsupported blocks or silently exceed count constraints.
- Do not make a section instance global merely because its definition is
  reusable.

## Extensibility
Plugins can register additional definitions through the public registry API without changing the editor shell or inspector.
