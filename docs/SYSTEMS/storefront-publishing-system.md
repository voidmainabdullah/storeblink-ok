# Storefront Publishing System

## Purpose
Serializes draft writes and atomically creates immutable published storefront snapshots.

## Owns
- Client write ordering and current remote revision.
- Database optimistic-concurrency and publication transaction through RPCs.

## Does NOT Own
- Scene Graph mutation, publish validation UI, or storefront rendering.

## Public API
```ts
initialize(revision: number): void
saveDraft(input): Promise<StorefrontWriteResult>
publish(input): Promise<StorefrontWriteResult>
```

## Depends On
- Supabase publishing gateway
- `profiles` compatibility projection
- `storefront_publications`

## Folder
`src/platform/publishing/`

## State Ownership
The service exclusively owns its serialized promise queue and known remote revision. PostgreSQL owns the authoritative revision.

## Event Flow
Committed editor command -> debounced save -> queued service write -> row lock and expected-revision check -> draft update. Publish also appends an immutable snapshot and activates it in one transaction.

## Performance Notes
Pointer preview frames never call this system. Only committed Scene Graph revisions are serialized.

## Known Pitfalls / Anti-Patterns
- Do not use timestamps as conflict detection after the RPC migration is applied.
- Do not expose draft documents from public profile reads.
- Do not update published snapshots in place.

## Extensibility
Large-store publishing can enqueue `storefront_publish_jobs` while retaining the same revision contract.
