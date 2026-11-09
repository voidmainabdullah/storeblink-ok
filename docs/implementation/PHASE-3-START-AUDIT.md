# Phase 3 Start Architecture Audit

Date: 2026-08-01

## Implemented (PASS) ✓

- Persisted storefront writes already carry an `expectedRevision` and the Supabase RPCs reject stale revisions with SQLSTATE `40001`.
- Immutable publication snapshots, publication-history RPCs, and publication lookup RPCs exist in the checked-in Supabase migrations and typed client contract.
- `StorefrontPublishingService` serializes writes and exposes persisted-publication listing and rollback entry points.
- An in-memory `PublicationRecoverySystem` captures the loaded publication and pre-publish snapshots for same-session rollback.
- A sequential theme-package migration system exists for package-specific theme payloads.
- Scene and node validation, typed node schemas, command history, transactions, and per-kernel lifecycle infrastructure are available as Phase 3 integration boundaries.
- Dexie is installed as the approved IndexedDB abstraction.

## Missing (FAIL) ✗

- The core project serialization `migrate()` function is a validation-only no-op.
- Persisted Engine Scene documents have no authoritative document version marker or ordered migration registry.
- Node schemas cannot register or execute node-level property migrations.
- Unknown/future document and node versions are not rejected at the document load boundary.
- Migration backups and reports are not stored durably.
- There is no IndexedDB repository for validated drafts, command journal, retry queue, recovery metadata, last-valid snapshots, or conflicts.
- Editor startup does not offer Restore, Preview differences, and Discard when unsaved work exists.
- Failed/offline saves are not queued or retried.
- Revision conflicts are shown as generic failures; local and server copies are not preserved or resolvable.
- Persisted publication history is not loaded into the recovery UI, so rollback disappears after refresh even when the server retained the snapshots.

## Partially Implemented (PARTIAL) △

- `EngineEditor` writes one best-effort `localStorage` draft before a save, but it has no validation, command journal, versioning, storage quota policy, startup restore path, or conflict metadata.
- Revision safety exists on the server RPC path, but the legacy fallback cannot provide equivalent compare-and-swap guarantees.
- Durable publication tables/RPCs are present in repository migrations, but deployment against the target Supabase project has not been verified.
- Same-session publication recovery is functional but intentionally volatile.
- Theme package migrations preserve backups in memory, but they do not migrate the active Engine Scene document contract.

## Technical Debt

- `persistMigratedTheme()` directly updates only `profiles.theme`; it does not update the active `theme_draft` selected by editor startup and bypasses revision-aware publishing.
- Recovery logic currently lives inside the large `EngineEditor` component instead of a kernel-owned persistence service.
- The active page document is embedded beside the compatibility home scene, so migration must validate every page scene without breaking the public `engine_scene` compatibility key.
- Publication recovery has separate volatile and durable APIs with no unified editor view model.

## Regression Risk

- High: a migration that mutates its input can corrupt the only merchant copy unless backup creation and immutable step execution are enforced.
- High: retrying a stale save without conflict classification can overwrite newer work or loop forever.
- High: restoring only the active scene while ignoring the page document can lose custom-page edits.
- Medium: adding node-version enforcement can reject existing unversioned templates unless version 1 is handled explicitly.
- Medium: IndexedDB may be unavailable or quota-constrained; editor operation must degrade without losing the in-memory scene.
- Medium: server publication rollback cannot be claimed until the remote migration/RLS contract is deployed and exercised.

## Next Actions

1. Add a kernel-owned ordered Editor Document Migration Registry with immutable backups, before/after validation, reports, and future-version rejection.
2. Extend `NodeSchemaRegistry` with sequential node migrations and migrate every scene in the page document.
3. Add a Dexie repository behind a testable recovery-store interface and register one recovery service per editor kernel.
4. Journal commands and validated snapshots, coalesce draft retry work, and retry only through `StorefrontPublishingService`.
5. Classify revision conflicts, capture both documents plus local command metadata, and add explicit startup/conflict recovery UI.
6. Merge persisted publication history into the rollback panel and exercise rollback after a new service/session instance.
