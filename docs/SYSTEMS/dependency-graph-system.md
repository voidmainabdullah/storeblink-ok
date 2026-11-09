# Dependency Graph System

## Purpose

Maintains queryable relationships between scene nodes and assets, products, collections, components, and templates.

## Owns

- Directed dependency edges.
- Incoming and outgoing indexes.
- Cycle-safe transitive impact queries.

## Does NOT Own

- Referenced entity records.
- Scene Graph nodes.
- Cascade mutation policy.

## Public API

```ts
interface DependencyGraphAPI {
  link(edge: DependencyEdge): void;
  unlink(edge: DependencyEdge): void;
  replaceSource(source: DependencyRef, edges: readonly DependencyEdge[]): void;
  removeEntity(entity: DependencyRef): void;
  getDependencies(source: DependencyRef): readonly DependencyEdge[];
  getDependents(target: DependencyRef): readonly DependencyEdge[];
  getImpact(target: DependencyRef): DependencyImpact;
  rebuildScene(scene: SceneTree): void;
  clear(): void;
}
```

## Depends On

- Scene Graph event bus integration through `SceneDependencyIndexer`.

## Folder

`src/engine/dependency-graph/`

## State Ownership

The graph exclusively owns edge and index maps. `SceneDependencyIndexer` updates them from scoped Scene Graph events.

## Event Flow

Kernel initialization rebuilds dependencies from the current scene. Node create,
update, and delete events refresh node, navigation-to-page, template-to-shared-
chrome, asset, catalog, and component edges. Successful publication adds a
published-revision-to-asset-manifest edge plus manifest asset edges. Consumers
query dependencies or transitive impact without scanning the document.

## Performance Notes

Incoming and outgoing maps keep direct queries proportional to edge count for the requested entity. Impact traversal tracks visited entities to terminate cycles.

## Known Pitfalls / Anti-Patterns

- Do not store domain objects in dependency edges.
- Do not infer destructive cascade behavior from impact results.
- Dispose the event indexer with its kernel.

## Extensibility

New entity kinds and relation types can be added to the typed contracts and indexed from node extensions without changing graph traversal.
