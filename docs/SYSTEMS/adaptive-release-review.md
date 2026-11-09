# Adaptive Release Review Surface

## Purpose

Give merchants one clear, capability-separated path from a saved Adaptive Commerce source to validation, explicit shadow review, and atomic publication without moving compiler or artifact authority into the browser.

## Owns

- The capability-checked release-status read model for one exact installation/source revision.
- Merchant-facing release states and intentional accept/reject/publish confirmations.
- Browser orchestration of shadow-only validation, exact pending-shadow review, and reviewed publication requests.
- The authenticated publication Edge forwarder and protected Worker route.

## Does NOT Own

- Authoring commands or draft persistence.
- Compiler execution, artifact bytes, hashes, versions, or timestamps.
- Shadow evidence creation or trusted visual-comparison execution.
- Runtime rollout, rollback policy, or live-provider deployment.

## Public API

```ts
interface AdaptiveReleaseReviewController {
  load(identity: {
    storeId: string;
    installationId: string;
    sourceRevision: number;
  }): Promise<AdaptiveReleaseReviewSnapshot>;

  requestValidation(snapshot: AdaptiveReleaseReviewSnapshot):
    Promise<AdaptiveReleaseReviewSnapshot>;

  review(snapshot: AdaptiveReleaseReviewSnapshot, decision: "accept" | "reject"):
    Promise<AdaptiveReleaseReviewSnapshot>;

  publish(snapshot: AdaptiveReleaseReviewSnapshot):
    Promise<AdaptiveReleaseReviewSnapshot>;
}
```

Browser-readable SQL boundary:

- `load_adaptive_storefront_release_review(store, installation, source_revision)` requires an authenticated `theme.read` or `theme.publish` capability and rejects stale source identities.

Mutation boundaries:

- Validation invokes `compile-adaptive-storefront` with `intent: "shadow-only"`.
- Review invokes `review_adaptive_shadow_compilation` with an exact shadow id and expected review revision.
- Publication invokes `publish-reviewed-adaptive-storefront` with only store id, persisted job id, and expected live-pointer revision.

## Depends On

- Adaptive Storefront Authoring
- Adaptive Server Compiler
- Adaptive Shadow Review Lifecycle
- Supabase authentication and store capability policy
- Protected StoreBlink Worker runtime

## Folder

Client system: `src/adaptive-commerce/release-review/`

Merchant UI: `src/pages/dashboard/AdaptiveStoreReleaseReviewPanel.tsx`

Edge boundary: `supabase/functions/publish-reviewed-adaptive-storefront/`

Worker boundary: `worker/adaptive-commerce-reviewed-publication.ts`

Database read model: `supabase/migrations/20260827000100_adaptive_release_review_surface.sql`

## State Ownership

The React panel owns only ephemeral loading/error state and the last server snapshot. Compile jobs own candidate and compiler state, shadows own review status/revision/diffs, and the active-publication row owns the live pointer. Every action reloads the exact server read model after completion.

`theme.edit` controls authoring. `theme.publish` independently controls validation, accept/reject, and publish. A user may therefore edit while seeing release controls disabled.

## Event Flow

```text
saved canonical source
  -> capability-checked exact status read
  -> Validate saved draft
  -> authenticated Edge trigger
  -> protected compiler Worker (shadow-only)
  -> compiling / failed / pending / uncomparable / accepted
  -> pending: explicit accept or reject under review_revision
  -> accepted: explicit publish confirmation
  -> authenticated publication Edge forwarder
  -> protected reviewed-publication Worker
  -> service-role publish-by-job RPC
  -> exact persisted candidate + accepted shadow + pointer CAS
  -> published and current
```

An unsaved local command session blocks validation because only canonical saved source is eligible. An opaque legacy comparison stays `uncomparable`; browser review buttons are not shown until trusted visual evidence moves it to `pending`.

## Performance Notes

- The read RPC selects one installation, one latest exact-source job, one shadow, and one current pointer. It strips compiler hashes from structural/visual evidence before returning the merchant-safe diff summary.
- Running jobs are polled every 2.5 seconds only while the panel is mounted.
- Neither Edge publication forwarding nor the reviewed Worker recompiles or transmits artifact bytes.

## Known Pitfalls / Anti-Patterns

- Never validate unsaved local commands or imply that draft save publishes.
- Never accept/reject an `uncomparable`, stale, or already terminal shadow.
- Never let the publication request carry artifact bytes, artifact hash, compiler version, installation id, or source revision.
- Never publish directly from the browser RPC client; the service-role gateway exists only inside the protected Worker.
- Never collapse `theme.edit` and `theme.publish` into one UI permission.
- Never label a locally wired route as deployed. Production requires the migration, both Edge functions, Worker code, and four secrets/URLs to be configured.

## Extensibility

A trusted screenshot comparator may attach the existing visual-evidence contract and the same panel will become reviewable on its next status refresh. Future audit detail can extend the read snapshot with service-owned review metadata, but must not expose candidate bytes or add browser-controlled artifact selectors.

Production configuration requires:

- Edge: `ADAPTIVE_COMPILER_WORKER_URL`, `ADAPTIVE_COMPILER_WORKER_SECRET`
- Edge: `ADAPTIVE_REVIEWED_PUBLICATION_WORKER_URL`, `ADAPTIVE_REVIEWED_PUBLICATION_WORKER_SECRET`
- Worker: `ADAPTIVE_COMPILER_WORKER_SECRET`, `ADAPTIVE_REVIEWED_PUBLICATION_WORKER_SECRET`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`
