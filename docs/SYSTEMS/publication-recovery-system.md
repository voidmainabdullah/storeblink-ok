# Publication Recovery System

## Purpose

Preserves immutable publication recovery points and republishes an earlier snapshot as a new revision.

## Owns

- Bounded session recovery points.
- Defensive cloning of recovery snapshots.
- Durable publication history/read gateway contracts.
- Rollback orchestration through normal publish validation.

## Does NOT Own

- Scene editing.
- In-place mutation of publication history.
- Database authorization.
- Theme migrations.

## Public API

```ts
publicationRecoverySystem.capture(input)
publicationRecoverySystem.list(storeId)
publicationRecoverySystem.get(storeId, recoveryPointId)

storefrontPublishingService.listRecoveryPoints()
storefrontPublishingService.rollback(recoveryPointId, input)
storefrontPublishingService.listPersistedPublications(limit)
storefrontPublishingService.rollbackPersistedPublication(id, input)
```

## Depends On

- Storefront Publishing Service.
- Publishing gateway.
- Theme Publication Guard.
- Authenticated Supabase publication RPCs for durable history.

## Folder

`src/platform/publishing/`

## State Ownership

Session recovery owns bounded in-memory cloned snapshots. Durable recovery snapshots remain append-only rows in `storefront_publications`.

## Event Flow

Load published document -> capture session baseline -> validate publish -> atomic write -> capture previous publication -> expose recovery point. Rollback loads a cloned snapshot and sends it through normal production preflight and revision-aware publishing as a new publication.

## Performance Notes

- Session retention defaults to 20 snapshots per store.
- Durable history lists metadata only; full JSON is fetched for one selected publication.
- All writes remain serialized by the publishing queue.

## Known Pitfalls / Anti-Patterns

- Never update an old publication row.
- Never skip preflight during rollback.
- Never return mutable internal snapshot references.
- Session recovery is not a substitute for durable database history.

## Extensibility

A merchant timeline can consume durable publication metadata and invoke `rollbackPersistedPublication` without changing gateway or database semantics.

