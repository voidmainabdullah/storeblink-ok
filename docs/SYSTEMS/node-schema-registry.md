# Node Schema Registry

## Purpose

Defines versioned node data and capability contracts and enforces them at every mutable Scene Graph boundary.

## Owns

- Schemas for built-in and `custom:*` element types.
- Typed props, style, extension, parent, child, and capability validation.
- Structured validation errors.

## Does NOT Own

- Scene node records.
- Renderer registration.
- Migration execution between schema versions.

## Public API

```ts
interface NodeSchemaRegistryAPI {
  register(schema: NodeSchema): void;
  unregister(type: ElementType | "custom:*"): void;
  get(type: ElementType): NodeSchema | undefined;
  require(type: ElementType): NodeSchema;
  list(): readonly NodeSchema[];
  validateNode(node: SceneNode): NodeSchemaValidationResult;
  validateRelationship(parent: SceneNode | null, child: SceneNode): NodeSchemaValidationResult;
  validateTree(tree: SceneTree): NodeSchemaValidationResult;
  assertNode(node: SceneNode): void;
  assertRelationship(parent: SceneNode | null, child: SceneNode): void;
  assertTree(tree: SceneTree): void;
}
```

## Depends On

- Zod.
- Scene Graph node types.

## Folder

`src/engine/node-schema/`

## State Ownership

The registry exclusively owns schema registrations. Scene Graph implementations own node values and call the registry before committing mutations.

## Event Flow

Create, update, reparent, clone, and deserialize requests are validated before the Scene Graph store is changed. Invalid trees fail without publishing mutation events.

## Performance Notes

Validation is concentrated at mutation and import boundaries, not render frames. Registered schemas are stable for the lifetime of a kernel.

## Known Pitfalls / Anti-Patterns

- Do not accept unknown node types without a registered `custom:*` contract.
- Do not use capabilities as mutable UI state.
- Do not confuse schema validation with version migration.

## Extensibility

Custom elements register a versioned schema and capabilities before their nodes are loaded or created.
