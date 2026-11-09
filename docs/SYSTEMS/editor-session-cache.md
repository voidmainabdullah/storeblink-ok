# Editor Session Cache

## Purpose
Keeps the active Scene Graph, page state, store data, and camera available across short dashboard route changes while durable recovery and server persistence continue independently.

## Owns
- A bounded, time-limited in-memory cache keyed by store ID.
- Warm-start metadata required to paint the editor without a blocking reload.

## Does NOT Own
- The live document source of truth.
- Durable autosave, revision conflict resolution, or publication.

## Public API
```ts
interface EditorSessionCacheAPI {
  get(storeId: string): EditorWarmSession | null;
  put(session: EditorWarmSession): void;
  clear(storeId?: string): void;
}
```

## Depends On
- Scene Graph snapshots.
- Page Document snapshot and Viewport state supplied by the editor runtime.

## Folder
`src/persistence/project-save-load/`

## State Ownership
This cache stores immutable references to the latest editor snapshots. Scene Graph and Page Document systems remain the only writers of live state.

## Event Flow
Command or camera update -> editor stages warm snapshot -> route unmount -> new Engine Kernel seeds from cache -> server and Dexie recovery revalidate in the background.

## Performance Notes
Staging is O(1) and avoids cloning or serializing the document on the interaction path. The cache is limited to four stores and expires after 30 minutes.

## Known Pitfalls / Anti-Patterns
- Never publish directly from the cache.
- Never replace a dirty warm session with an older server revision.
- Do not treat the cache as durable recovery.

## Extensibility
Additional ephemeral editor UI state can be added without changing persisted Engine Scene documents.
