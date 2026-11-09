# Navigation System

## Purpose

Own one typed, ordered store navigation document and resolve it consistently for
theme header, mobile menu, footer, and user-added navigation surfaces.

## Owns

- Root `extensions.navigation`.
- Navigation item identity, order, hierarchy, visibility and destination.
- Typed internal, entity, external, contact and section-anchor targets.
- Broken-link resolution state.

## Does NOT Own

- Theme-specific navigation geometry or visual styling.
- Mobile-menu open/close state.
- Router rendering.

## Public API

```ts
interface NavigationSystemAPI {
  getDocument(scene: SceneTree): SceneNavigationDocument;
  ensureScene(scene: SceneTree): SceneTree;
  applyDocument(scene: SceneTree, document: SceneNavigationDocument): SceneTree;
  synchronizeNode(scene: SceneTree, nodeId: string): SceneTree;
  addItem(scene: SceneTree, item: SceneNavigationItem): SceneTree;
  updateItem(scene: SceneTree, itemId: string, patch: Partial<SceneNavigationItem>): SceneTree;
  removeItem(scene: SceneTree, itemId: string): SceneTree;
  resolve(
    scene: SceneTree,
    context: StorefrontLinkContext,
    breakpoint?: "desktop" | "tablet" | "mobile",
  ): ResolvedSceneNavigationItem[];
}
```

## Depends On

- Runtime Link Resolver.
- Scene Graph clone API.
- Responsive System for preserving each theme surface's visibility contract.

## Folder

`src/content/menus/`

## State Ownership

Navigation data is serialized on the Scene root. Theme nodes are materialized
views of that document so they remain directly selectable and editable. Header,
mobile-menu, footer, and added navigation sections read the same ordered
document; they do not own copies.

## Event Flow

Inspector/Add tool -> Navigation validation -> Scene replacement Command ->
History/Scene Graph -> Responsive renderer -> autosave -> public resolver.
Invalid targets never produce a next scene. Resolved missing entities or
sections are retained with broken diagnostics in the editor and omitted from
the public result by default.

## Performance Notes

Resolution is linear in the small navigation item list. No DOM discovery or
route string mutation occurs during rendering.

## Known Pitfalls / Anti-Patterns

- Do not create separate desktop, mobile or footer link arrays.
- Do not persist product/page handles as identity; persist entity IDs.
- Do not render unresolved or unsafe public links.
- Do not construct store paths in React components; use Runtime Link Resolver.

## Extensibility

Nested menus use `parentId`, ordered traversal, and cascading removal. Free
canvas themes may present that hierarchy as a flat ordered surface while
structured themes can render nested menus from the same document. Route keys
and target types can be extended in the resolver without changing theme
renderers.
