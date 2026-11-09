# Adaptive Commerce Persistence System

## Purpose

Persist versioned Adaptive Commerce catalogs, semantic merchant state, compiled artifacts, publications, rollout assignments, and bounded runtime observations without changing the legacy theme tables during canary migration.

## Owns

- Immutable released DesignPack, ComponentLibrary, TemplateBlueprint, and StoreKit versions.
- Atomic StoreKit installation revisions and immutable storefront base revisions.
- Merchant patch records and explicit merge-conflict state.
- Immutable compiler artifacts and publications.
- The single active adaptive-publication pointer.
- Shadow-review, rollout, cohort-assignment, RUM, incident, and AI-plan audit records.

## Does NOT Own

- Semantic validation or compilation algorithms.
- Live editor Scene Graph state.
- Legacy `theme_*` compatibility projections.
- Rollout policy recommendations or browser Web Vitals collection.

## Public API

```ts
type AdaptivePersistenceRpc =
  | "stage_adaptive_store_kit_installation"
  | "record_adaptive_installation_shadow"
  | "activate_adaptive_store_kit_installation"
  | "publish_adaptive_storefront"
  | "activate_adaptive_storefront_publication"
  | "set_adaptive_storefront_runtime_assignment"
  | "get_public_adaptive_storefront_artifact"
  | "ingest_adaptive_storefront_rum";
```

Installation is deliberately two-phase. An authenticated merchant stages canonical source using an idempotency key and expected installation revision. A trusted compiler then records the exact source/artifact shadow and a service-only activation transaction archives the prior installation, persists the immutable artifact/publication, and swaps the active pointer. The deprecated `commit_adaptive_store_kit_installation` signature now fails closed and performs no mutation. Rollback changes only the pointer.

## Depends On

- Store tenant and capability helpers from the authentication platform.
- PostgreSQL transactions, row locks, advisory locks, RLS, and JSONB.
- A server-owned compiler and rollout controller.

## Folder

Core schema: `supabase/migrations/20260821000100_adaptive_commerce_runtime_v3.sql`

Trusted compiler jobs: `supabase/migrations/20260821000200_adaptive_server_compiler_jobs.sql`

Staged installation lifecycle: `supabase/migrations/20260821000300_adaptive_store_kit_staged_activation.sql`

## State Ownership

Only the database functions declared by this system may mutate installations, artifacts, active publication pointers, and runtime assignments. Released catalogs, base revisions, artifacts, and publications are immutable.

## Event Flow

1. A validated exact released StoreKit is staged under a database-generated stable installation UUID. The previous active installation and pointer do not change.
2. The stage persists the canonical StoreDefinition, semantic base, merchant patches, selected preset/token overrides, commerce bindings, source revision, and database-canonical source hash.
3. A server compiler loads that staged source and persists one exact candidate.
4. A service-only shadow record binds the stage source revision/hash, compiler source hash, and artifact hash. Reviewed terminal shadow records are immutable.
5. Service-only activation repeats all revision/hash checks, inserts the artifact/publication, archives the previous installation, activates the staged installation, and swaps the pointer in one transaction.
6. The rollout controller assigns each store to legacy or adaptive runtime.
7. The public resolver fails closed to legacy when config, assignment, artifact, or policy is missing.
8. Validated RUM feeds a recommendation; an authorized controller applies pause, widen, or pointer rollback.

## Performance Notes

Runtime reads are one indexed store lookup plus single-row rollout, assignment, pointer, publication, and artifact joins. Artifact payloads are immutable and hash-addressable for edge caching.

## Known Pitfalls / Anti-Patterns

- Never update or republish an old artifact to implement rollback.
- Never activate an artifact without an accepted shadow record for the exact hash.
- Never accept a browser-provided artifact during staging; the staging RPC has no artifact arguments.
- Never mark an installation active before its exact compiled candidate and accepted immutable shadow exist.
- Never treat the compiler `sourceHash` and the staged canonical-source hash as interchangeable; the shadow binds both identities.
- Never derive a client-controlled cohort assignment.
- Never expose direct anonymous table reads for runtime artifacts or RUM events.
- Never delete the legacy projection until the retirement gate has production evidence.

## Extensibility

Catalog definitions are JSON contracts pinned by exact version and integrity hash. New compiler or rollout workers integrate through the narrow RPC surface without acquiring direct mutation ownership.
