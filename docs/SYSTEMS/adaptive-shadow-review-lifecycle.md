# Adaptive Shadow Review Lifecycle

## Purpose

Turn an intentional, structurally different compiled storefront into an explicit merchant review instead of a failed release, while keeping all artifact authority on the trusted compiler side.

## Owns

- The `pending -> accepted | rejected` review transition.
- Optimistic `review_revision` and immutable idempotency-command records.
- The exceptional `uncomparable -> pending` transition after service-owned visual evidence.
- Trusted publication of the exact persisted job candidate after acceptance.

## Does NOT Own

- Storefront compilation or artifact hashing.
- Browser previews, screenshots, or visual-comparison execution.
- StoreKit installation staging, runtime rollout, or pointer rollback policy.
- Automatic acceptance of structural or visual differences.

## Public API

```ts
interface AdaptiveShadowReviewGateway {
  review(input: {
    storeId: string;
    shadowId: string;
    expectedReviewRevision: number;
    idempotencyKey: string;
    decision: "accept" | "reject";
  }): Promise<ShadowReviewResult>;
}

interface TrustedReviewedPublicationGateway {
  publishPersistedCandidate(input: {
    storeId: string;
    jobId: string;
    expectedPointerRevision: number;
  }): Promise<ReviewedPublicationResult>;
}
```

SQL boundaries:

- `record_adaptive_compile_job_shadow` — service role only; derives source/artifact identity from a persisted job.
- `record_adaptive_shadow_visual_evidence` — service role only; makes opaque legacy output reviewable but never accepts it.
- `review_adaptive_shadow_compilation` — authenticated `theme.publish`; accepts no artifact, hash, compiler, or source input.
- `publish_reviewed_adaptive_storefront_compile_job` — service role only; atomically consumes the exact persisted candidate and accepted shadow.

## Depends On

- Trusted Server Storefront Compiler
- Adaptive Shadow Compiler
- Adaptive StoreKit Installation Lifecycle
- Store capability policy

## Folder

`src/adaptive-commerce/server/`

Persistence migration: `supabase/migrations/20260826000100_adaptive_shadow_review_lifecycle.sql`.

## State Ownership

The shadow table owns review status and revision. The append-only review-command table owns idempotent review results. Compile jobs continue to own candidate bytes. Runtime publication tables and the active pointer remain owned by the publication transaction.

## Event Flow

```text
trusted compile -> exact candidate persisted
  -> equal structural result -> accepted automatically -> publish may continue
  -> different structural result -> pending -> theme.publish accept/reject
       -> accepted -> trusted reviewed-publication request -> atomic persisted-candidate publish
       -> rejected -> terminal, live pointer unchanged
  -> uncomparable -> blocked
       -> trusted visual evidence proves comparability -> pending -> same manual review
```

After the first adaptive activation, canonical source loading uses the exact current active adaptive artifact as the next shadow baseline. This makes later adaptive edits deterministically `equal` or `different`; an opaque legacy snapshot is used only when no adaptive publication exists.

## Performance Notes

Review and publication take the existing per-store advisory transaction lock. They operate on one shadow and one compile job, and do not compile, hash, or transmit artifact bytes again.

## Known Pitfalls / Anti-Patterns

- Never map a comparable structural difference directly to `rejected`.
- Never let the review request carry artifact bytes, artifact hashes, compiler versions, or source hashes.
- Never allow visual evidence to auto-accept an opaque candidate.
- Never publish a fresh recompilation after review.
- Never mutate accepted/rejected evidence; rollback swaps only the active publication pointer.

## Extensibility

A screenshot service can supply the narrow visual-evidence contract through a service-role adapter. The production Worker adapter is `worker/adaptive-commerce-reviewed-publication.ts`; it hosts `createReviewedPublicationWorkerHandler` with a service client, rejects extra artifact fields, and delegates to the same atomic SQL boundary.
