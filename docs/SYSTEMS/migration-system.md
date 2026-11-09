# Migration System

## Purpose

Upgrade persisted editor documents and individual Scene Graph nodes through explicit, ordered, validated versions while preserving an untouched rollback copy.

## Owns

- The current Engine Document version.
- Ordered document migration registrations.
- Migration planning, immutable execution, reports, and rollback metadata.
- Node-schema migration sequencing and node-version markers.

## Does NOT Own

- Persisting backups or reports; the Recovery System owns durable storage.
- Live Scene Graph mutation; migration returns a validated replacement document.
- Theme-package installation migrations in `themes/migrations`.
- UI decisions about restoring or discarding migrated documents.

## Public API

```ts
interface EditorDocumentMigrationAPI {
  readonly currentVersion: number;
  isEngineDocument(value: unknown): value is EditorEngineDocument;
  getVersion(document: EditorEngineDocument): number;
  migrate(document: EditorEngineDocument): EditorDocumentMigrationResult;
  validateCurrent(document: EditorEngineDocument): MigrationValidation;
}
```

## Depends On

- Node Schema Registry
- Scene validation
- Serialization types

## Folder

`src/engine/migration/`

## State Ownership

The registry owns immutable migration definitions only. It does not own live document state or write a Zustand store.

## Event Flow

Persisted document load -> detect version -> clone backup -> plan every intermediate migration -> validate before and after each step -> normalize every node schema -> validate all page scenes -> return document plus report -> Recovery System persists evidence -> Scene Graph loads the result.

## Performance Notes

Migration runs at trust-boundary load/save, not in pointer or render hot paths. Complete cloning is intentional because the operation must preserve an exact rollback document.

## Known Pitfalls / Anti-Patterns

- Never infer an unknown future version as the current version.
- Never mutate a migration input or live Scene Graph in place.
- Never skip an absent intermediate migration.
- Never migrate only the compatibility home scene while leaving custom page scenes stale.
- Never let node migrations change node IDs, type, parent, or child ordering.

## Extensibility

Document versions register one adjacent migration at a time. Node types register adjacent `NodeMigration` entries on their `NodeSchema`; custom node schemas use the same contract.
