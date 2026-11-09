# Component System

## Purpose

Creates reusable Scene Graph definitions and keeps physical component instances synchronized while preserving explicitly supported merchant content overrides.

## Owns

- Component definitions and variants stored in the Scene Graph component library.
- Definition-source identity for every physical instance node.
- Instance variant, controlled overrides, propagation, reset, detach, and impact-analysis semantics.
- Shared header/footer definition references used by the page document.
- The Insert tools component catalog contract used to place definitions on any compatible page.

## Does NOT Own

- Selection, hit testing, transform sessions, rendering, or responsive layout.
- Scene mutation from React components; callers dispatch the returned immutable scene through Commands or Transactions.
- Navigation-document values or theme tokens, which remain owned by their existing systems.

## Public API

```ts
interface ComponentSystemAPI {
  createDefinition(scene, nodeId, options?): ComponentSceneResult;
  createVariant(scene, definitionId, sourceNodeId, input): ComponentSceneResult;
  instantiate(scene, definitionId, parentId, options?): ComponentSceneResult;
  updateDefinition(scene, definitionId, variantId?): ComponentSceneResult;
  refreshDefinitionsFromMasters(scene): SceneTree;
  propagate(scene, definitionId): SceneTree;
  propagateAll(scene): SceneTree;
  applyOverride(scene, instanceRootId, override): SceneTree;
  resetOverrides(scene, instanceRootId, filter?): SceneTree;
  captureOverrides(scene, instanceRootId?): SceneTree;
  swapVariant(scene, instanceRootId, variantId): SceneTree;
  detach(scene, instanceRootId): SceneTree;
  getInstanceRootId(scene, nodeId): string | null;
  getImpact(definitionId, pages): ComponentImpact;
  assertScene(scene): void;
}
```

## Depends On

- Scene Graph cloning and node ID generation.
- Scene validation.
- Command/Transaction callers for persisted mutation and history.

## Folder

`src/document/components/`

## State Ownership

Component data is persisted in `SceneTree.components`. The Component System is stateless and is the only service that constructs or rewrites managed component metadata. The Scene Graph remains the live document owner, and only Commands/Transactions may commit returned scenes.

## Event Flow

Selection or inspector action -> Component System computes immutable scene -> Page Document prepares all affected page scenes -> Transaction commits page document plus active Scene Graph -> invalidation -> renderer. A master update rebuilds physical instance subtrees by stable source identity, reapplies controlled overrides, and creates one history entry.

## Performance Notes

- Existing physical node IDs are reused by source identity during propagation.
- Multi-instance propagation performs one scene clone and one validation pass per public operation instead of cloning once per instance.
- Rendering, hit testing, transform, and responsive systems consume ordinary Scene Graph nodes and require no component-specific branch.
- Impact analysis scans instance roots only.
- Component libraries and override values are cloned at mutation boundaries to prevent shared mutable references.
- Insert tools validates the selected destination through the Node Schema registry before a transaction is attempted.

## Known Pitfalls / Anti-Patterns

- Do not render virtual component children with derived DOM-only IDs; they would bypass selection and commands.
- Do not treat arbitrary style/transform edits as content overrides. Structural style remains master-owned.
- Do not mutate instance metadata or definition trees from inspector code.
- Do not copy header/footer as unrelated local sections; pages must reference the shared definition IDs.
- Do not remove source identity while an instance is attached.
- Do not diff an inactive instance against a newer definition before capturing its overrides against the previous definition; inherited stale values are not merchant overrides.

## Extensibility

New override scopes can be added through a typed patch sanitizer and schema update. Variant compatibility uses stable equivalent tree paths today and can later be extended with explicit named slots without changing physical instance rendering.
