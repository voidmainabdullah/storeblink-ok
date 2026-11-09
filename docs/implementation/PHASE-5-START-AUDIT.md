# Phase 5 Start Architecture Audit

Date: 2026-08-01

## Implemented (PASS) ✓

- `SceneNode.meta.componentId` already provides a persisted reference slot for component instances.
- `DependencyGraph` recognizes `component-instance -> component-definition` edges and can report dependent entities.
- Scene mutations, page transitions, and whole-scene replacements already participate in command/history transactions.
- Physical Scene Graph subtrees remain independently selectable, editable, responsive, and renderable through the existing renderer registry.
- `PageDocumentSystem` persists multiple page scenes and synchronizes navigation/theme-chrome root contracts.
- Header and footer sections are identifiable through canonical section metadata.
- Theme chrome settings, navigation bindings, responsive overrides, validation, migration, serialization, and public rendering already have shared system boundaries that a component layer can reuse.

## Missing (FAIL) ✗

- There is no Component System, component definition registry, or typed definition schema.
- Scene documents do not persist reusable component masters or component variants.
- `componentId` is not interpreted by any renderer, editor operation, property path, or propagation service.
- Instances do not store controlled overrides or detached state.
- There is no supported operation to create a definition from a selected group/section, create an instance, update a master, swap a variant, reset an override, or detach an instance.
- Master changes cannot propagate to instances while preserving merchant content overrides.
- No impact preview counts affected instances/pages before a master update.
- Header/footer are copied as unrelated local subtrees when a page is created; they are not true shared component references.
- Page-specific shared-chrome overrides and reset-to-global behavior do not exist.
- The inspector exposes no component/instance status or component actions.

## Partially Implemented (PARTIAL) △

- Dependency edges can describe a component relationship, but they do not validate that a referenced definition exists or participate in propagation.
- Page navigation and theme-chrome settings synchronize globally, while header/footer structure and styles intentionally remain local in the current implementation.
- Scene replacement commands can make propagation undoable, but no component operation currently constructs a validated before/after scene.
- Section duplication creates independent local instances; this is useful for detach semantics but is not component instancing.
- Theme packages provide reusable React renderers, but those are renderer implementations rather than merchant-editable Scene Graph components.

## Technical Debt

- `PageDocumentSystem` is version 1 and embeds complete header/footer copies in every page scene.
- Existing tests explicitly assert that page chrome is copied and style-isolated; those tests encode behavior that Phase 5 must migrate deliberately.
- Component metadata is currently a single optional string, with no schema for source-node identity, override scope, variant, or detach lifecycle.
- The active Scene Graph is page-local while shared definitions need store-document scope; ownership must be explicit to avoid duplicate writable masters.
- A renderer-only virtual instance model would make derived child IDs difficult to select/edit, while blind physical cloning would lose inheritance. The implementation needs physical instance nodes plus source identity and controlled propagation.

## Regression Risk

- High: replacing copied chrome with shared references can change all custom pages and published navigation if migration is not deterministic.
- High: propagating a master without stable source-node identities can delete or overwrite valid instance content.
- High: definitions duplicated across page scenes would reintroduce drift under a different name.
- Medium: variant swaps can orphan overrides when source nodes do not exist in the target variant.
- Medium: page/document and active-scene updates must be one transaction so undo cannot leave them divergent.
- Medium: component-derived nodes must remain ordinary Scene Graph nodes so hit testing, selection, layout, responsive overrides, and storefront rendering do not fork.

## Next Actions

1. Define and validate a persisted Component Library, component definitions, variants, physical instance metadata, and controlled override types.
2. Implement a kernel-owned Component System with immutable create/instantiate/propagate/override/reset/swap/detach operations.
3. Preserve stable source-node identity on physical instance subtrees so all existing editor systems continue to operate without a renderer fork.
4. Extend the page document to own one shared component library and represent header/footer as component references with explicit page overrides.
5. Add impact analysis across pages and execute master/chrome changes through one transaction or scene command.
6. Add focused inspector actions through `useEngine()` and verify definition propagation, override survival, detach validity, shared-chrome drift prevention, and undo/redo.
