# Theme Functionality System

## Purpose
Provides theme-independent storefront behavior for product carousels, category discovery, advanced search triggers, and button destinations.

## Owns
- The persisted `root.extensions.themeFunctionality` contract.
- Discovery and annotation of product carousel groups.
- Materialization of missing editable carousel and category controls.
- Compatibility normalization for legacy button destinations.

## Does NOT Own
- Catalog records or product persistence.
- Storefront navigation history.
- Scene Graph mutation commands inside the editor.
- Theme-specific visual design.

## Public API
```ts
interface ThemeFunctionalitySystemAPI {
  getSettings(scene: SceneTree): ThemeFunctionalitySettings;
  ensureScene(scene: SceneTree): SceneTree;
  audit(scene: SceneTree): ThemeFunctionalityAudit;
}
```

## Depends On
- Scene Graph cloning and node factories.
- Responsive System for control placement overrides.
- Navigation target compatibility normalization.

## Folder
`src/theme-engine/functionality/`

## State Ownership
Settings are persisted in the Scene Graph root. Runtime search and menu visibility remain ephemeral React state in the public storefront.

## Event Flow
Theme load or reconciliation calls `ensureScene`. Storefront pointer events resolve the normalized node action through `StorefrontActionSystem`, then navigation or carousel state updates are performed by the public runtime.

## Performance Notes
Normalization runs once per scene load/reconciliation. Runtime carousel stepping only queries the active carousel group.

## Known Pitfalls / Anti-Patterns
- Do not add theme ID checks to this system.
- Do not store live search text or carousel position in the Scene Graph.
- Do not create runtime-only controls that cannot be selected in the editor.

## Extensibility
Future themes participate automatically by using canonical `product-card` block metadata. Additional actions should be added to the shared action registry, not implemented inside templates.
