# Adaptive StoreKit Installation Lifecycle

## Purpose

Install an exact released StoreKit without risking the live storefront. The lifecycle separates merchant-authorized source staging from service-owned compilation and activation.

## Owns

- Stable installation UUID creation before StoreDefinition compilation.
- Exact released lockfile and eight-route catalog validation.
- Canonical StoreDefinition, base, patch, preset/token override, and commerce-binding persistence.
- Optimistic installation and source revisions.
- The atomic staged-to-active transition.

## Does NOT Own

- Storefront compilation algorithms.
- Shadow diff algorithms or visual review policy.
- Rollout percentage and cohort assignment.
- Legacy theme projection writes.

## Public API

```ts
interface StoreKitInstallationStageGateway {
  stageAtomic(
    source: StoreKitInstallationStageCommit,
  ): Promise<StoreKitInstallationStageResult>;
}

interface StoreKitInstallationActivationGateway {
  activateAtomic(
    candidate: StoreKitInstallationActivation,
  ): Promise<StoreKitInstallationActivationResult>;
}
```

The corresponding database functions are:

- `stage_adaptive_store_kit_installation` — authenticated `theme.edit`; source only.
- `record_adaptive_installation_shadow` — service role only; binds exact source and artifact identities.
- `activate_adaptive_store_kit_installation` — service role only; one activation transaction.

## Depends On

- Adaptive Commerce Registry and released catalog tables.
- Merchant Patch System.
- Trusted server compiler jobs.
- Immutable shadow, artifact, publication, and active-pointer records.

## Folder

`src/adaptive-commerce/installation/`

Database lifecycle: `supabase/migrations/20260821000300_adaptive_store_kit_staged_activation.sql`

## State Ownership

The staging RPC exclusively creates staged installations and their canonical source rows. The activation RPC exclusively changes a staged installation to active while archiving the previous active installation and advancing the publication pointer. Browser code never writes artifact or pointer identity.

The active legacy editor exposes a review entry through `MyStore -> EngineEditor.headerActions`. That entry reads only the latest RLS-visible installation revision, materializes the current authorized store name, handle, locale, currency, and business name into a complete released eight-route source, then calls `StoreKitInstallationService.stage()`. The retry idempotency key is retained until the exact staged installation is returned by the Adaptive authoring loader.

After that verification, `MyStore` replaces the legacy editor with `AdaptiveStoreEditor` for the staged source. The public storefront and publication pointer remain unchanged. Legacy page-template labels and mutations are not reused or rewritten by this transition.

## Event Flow

```text
merchant request
  -> review exact StoreKit version, preset, merchant profile, and 8/8 route coverage
  -> read current installation revision under RLS
  -> deterministic preflight
  -> stage exact source under stable UUID
  -> load and verify the exact staged authoring source
  -> open AdaptiveStoreEditor in review-needed state

trusted release path (separate authority)
  -> trusted compile candidate
  -> exact immutable shadow acceptance
  -> service activation transaction
     -> artifact + publication
     -> previous active archived
     -> staged installation active
     -> active pointer advanced
```

Any error before transaction commit rolls back every activation write, preserving the previous active installation and pointer.

## Performance Notes

- Per-store advisory locks serialize stage, compile-source mutation, and activation boundaries.
- Idempotent staging compares a database-canonical request hash before replaying the original UUID.
- Exact revisions avoid expensive document comparisons at activation time.

## Known Pitfalls / Anti-Patterns

- Do not accept artifact IDs or hashes from the browser staging request.
- Do not archive the current active installation during staging.
- Do not auto-compile, accept shadow evidence, activate, or publish from the legacy upgrade entry.
- Do not switch editors until the authoring boundary returns the exact staged installation UUID.
- Do not relabel legacy page templates as StoreKits; released StoreKits retain their registry identity.
- Do not activate a stale staged revision after a newer installation was staged.
- Do not update a terminal shadow record.
- Do not use the deprecated one-shot `commit_adaptive_store_kit_installation`; it fails closed by design.
- Do not confuse the persisted stage-source hash with the compiler source hash. Both are required on the accepted shadow.

## Extensibility

Additional server quality gates may run between compilation and shadow acceptance. They do not change the installation API: activation still requires one exact source revision/hash, compiler source hash, artifact hash, and accepted shadow ID.
