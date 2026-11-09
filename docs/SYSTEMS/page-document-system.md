# Page Document System

## Purpose
Owns storefront page metadata and the mapping between a page and its Engine Scene.

## Owns
- Page IDs, titles, route slugs, and page kind.
- The active page ID.
- Scene snapshots for inactive pages.
- The store-document component library shared by every page scene.
- Shared header/footer definition IDs and physical page-instance references.

## Does NOT Own
- Live active-page node mutations.
- Selection, rendering, history, responsive layout, or navigation behavior.

## Public API
```ts
interface PageDocumentSystemAPI {
  load(theme: unknown, fallbackScene: SceneTree): PageDocumentSnapshot;
  prepareActivate(pageId: string, currentScene: SceneTree): PreparedPageTransition;
  prepareSceneUpdate(currentScene: SceneTree, nextScene: SceneTree): PreparedPageTransition;
  prepareSharedRootUpdate(
    currentScene: SceneTree,
    updateHomeScene: (homeScene: SceneTree) => SceneTree,
  ): PreparedPageTransition;
  prepareAddPage(input: NewPageInput, currentScene: SceneTree): PreparedPageTransition;
  finalizeTransition(
    transition: PreparedPageTransition,
    scene: SceneTree,
  ): PreparedPageTransition;
  restore(snapshot: PageDocumentSnapshot): void;
  activate(pageId: string, currentScene: SceneTree): SceneTree;
  addPage(input: NewPageInput, currentScene: SceneTree): StorefrontPage;
  serialize(currentScene: SceneTree): StorefrontPageDocument;
}
```

## Depends On
- Scene Graph validation and cloning.
- Component System definition/instance propagation.
- Theme Chrome, Navigation, and structured-layout normalization.

## Folder
`src/document/pages/`

## State Ownership
The system exclusively owns page metadata and inactive page scene snapshots.
The active page remains owned by the Scene Graph and is copied into the
document only through prepared transactions or persistence boundaries. The
document owns one component library; page scenes reference that library and
cache ordinary physical instance nodes so rendering, selection, and transforms
need no virtual component path.

## Event Flow
Page selection first prepares immutable before/after snapshots without changing
live state. The editor reconciles and finalizes the destination Scene, then the
Transaction System restores the page snapshot and Scene Graph as one command.
Creating a page instantiates the shared header/footer definitions with fresh
physical IDs and stable source-node identities. Component mutations use
`prepareSceneUpdate`, which captures page overrides against their previous
definition, installs the new central library, propagates every affected page,
and commits the page document plus active Scene Graph as one transaction.
Store-level root settings use `prepareSharedRootUpdate`; the home page remains
authoritative for navigation, assets, theme chrome, brand typography, and
design tokens, and normalization copies those settings into every page in the
same undoable transaction. Save
and publish serialize the active Scene and version-2 page document together.

## Performance Notes
Scene cloning occurs only at page creation, page switching, component-document
transactions, and save/publish boundaries, never during pointer transforms.
Serialization returns a defensive document copy because persistence must not
retain live editor references.

## Known Pitfalls / Anti-Patterns
- Do not mutate inactive page scenes from React components.
- Do not maintain a second live active Scene Graph.
- Do not switch pages outside the Transaction System; page and Scene Graph
  state must enter history as one entry.
- Do not replace a live scene's component library with an older cached document
  library; the active scene is authoritative at a prepared mutation boundary.
- Capture controlled instance overrides against the page's previous definition
  before attaching and propagating a newer central library.
- Do not copy header/footer as unrelated local sections; use the shared
  definition references and explicit page overrides.
- Do not write shared root settings only to the active page. Prepare them from
  the home scene and commit the normalized document and active scene together.

## Extensibility
Additional page kinds can be introduced by versioning the persisted document
contract and migrating it during `load`. Other shared site sections can reuse
the same explicit component-reference contract without adding renderer or
page-specific inheritance branches.
