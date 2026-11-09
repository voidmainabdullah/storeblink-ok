# Adaptive Server Compiler and Publication Job

## Purpose

Own the trusted release boundary that loads one canonical storefront source revision, compiles all eight routes once, persists the exact candidate, records shadow evidence, and publishes through one atomic database transaction.

## Owns

- Idempotent compiler-job claim, state transitions, terminal result, and failure evidence.
- Server-generated artifact identity and creation time.
- Canonical source revision checks before and inside publication.
- Exact candidate persistence before shadow comparison.
- Service-only publish-by-job orchestration.
- The authenticated Edge trigger that forwards intent to a configured trusted compiler worker.
- Scheduled tagged-RUM evaluation and atomic rollout recommendation commit.

## Does NOT Own

- Browser-side compilation, artifact hashes, compiler versions, or shadow acceptance.
- StoreKit authoring, registry package release, or staged installation creation.
- Visual screenshot review or a legacy projection adapter.
- Runtime rendering, cohort selection, or publication-row mutation.
- Deployment, worker credentials, provider configuration, or production scheduling.

## Public API

```ts
new ServerStorefrontCompileJob({
  registryLoader, // resolves the installation's exact released package pins
  gateway,
  releaseGate: new ProductionArtifactReleaseGate(),
}).run({
  jobId,
  idempotencyKey,
  storeId,
  installationId,
  expectedSourceRevision,
  expectedPointerRevision,
  intent: "shadow-only" | "publish",
});

new ScheduledRolloutController(gateway, windowMinutes).run(storeId, evaluatedAt);

new ScheduledRolloutBatchController(gateway, windowMinutes, limit).run(evaluatedAt);
```

The server API is exported only from `src/adaptive-commerce/server/index.ts`. It is intentionally absent from the browser-facing `src/adaptive-commerce/index.ts` barrel.

The protected Worker route accepts only the seven compiler-job coordination
fields shown above. It requires an exact Bearer secret, an identical
`Idempotency-Key` header, `application/json`, UUID identities, safe integer
revisions, and a streamed body no larger than 8 KiB. Artifact JSON, hashes,
compiler identity, and timestamps are rejected as unknown fields. The Worker
constructs the service-role gateway, exact registry loader, compiler, and
production release gate itself.

## Depends On

- Storefront Compiler for deterministic batch artifacts.
- Adaptive Commerce Registry for exact released package resolution.
- Continuous Release Gate for fail-closed artifact policy.
- Structural Artifact Diff for shadow evidence.
- Rollout Threshold Evaluator for tagged RUM policy.
- Supabase service-role RPCs for job/source/candidate/publication/rollout persistence.

## Folder

`src/adaptive-commerce/server/`

## State Ownership

The application service owns no global mutable state. SQL owns compile-job state, append-only job events, canonical source heads, immutable artifact/publication records, rollout state, and immutable incident evidence. Browser roles receive no write grant to these compiler-owned records or RPCs.

## Event Flow

```text
Authenticated publish intent
  -> Edge capability check
  -> staged installation with stable UUID and complete canonical source
  -> trusted worker creates server job id/time
  -> idempotent job claim
  -> canonical source load at expected revision
  -> exact eight-route batch compile
  -> pure release gate (schema + recomputed hash + canonical pins)
  -> exact compiler stages and merchant patch set
  -> certified route, responsive, section, global, layout, and a11y contracts
  -> source-race assertion
  -> persist exact candidate
  -> structural shadow record
  -> accepted candidate only
  -> service-only publish-by-job RPC
  -> immutable artifact + publication + atomic active pointer
```

```text
Scheduled store evaluation
  -> one Vault-backed pg_cron schedule
  -> secret-authenticated Supabase scheduler tick (no tenant decisions)
  -> exact protected Worker route /.storeblink/internal/adaptive-rollouts/evaluate
  -> ScheduledRolloutBatchController + SupabaseScheduledRolloutGateway
  -> trusted worker enumerates eligible rollouts
  -> bounded adaptive-only RUM load for active publication
  -> RolloutThresholdEvaluator
  -> kill switch override first
  -> commit_adaptive_rollout_evaluation under row/revision lock
  -> pause/widen/rollback + immutable incident
  -> critical rollback reassigns runtime to legacy
```

The publication RPC consumes the candidate already persisted on the job. It never recompiles after shadow review. Equal structural projections are accepted automatically; comparable differences are persisted as `pending`, and opaque projections stay `uncomparable` until a service-owned visual comparator makes them reviewable. An authenticated `theme.publish` decision changes only the exact pending shadow id under review-revision and idempotency checks. The later trusted reviewed-publication RPC accepts only store/job identity and expected pointer revision, then consumes the persisted candidate and accepted shadow atomically. Canonical source writes and publication share the same per-store advisory lock; an artifact insert also repeats the source-head revision check.

## Performance Notes

- Compilation and QA run in the trusted worker, not the Edge request runtime or browser.
- The Edge function is a narrow authenticated trigger and returns `503` when no worker is configured.
- The rollout Edge tick defaults to the production-only
  `https://storeblink.com/.storeblink/internal/adaptive-rollouts/evaluate`
  target and rejects a configured URL with another origin, path, credentials,
  query, or fragment before sending its Worker secret.
- Source loading is one bounded RPC; RUM loading has a 1–1440 minute window.
- The hard repository gate evaluates four StoreKits, eight routes, eight adversarial fixtures, and every integer width from 320 through 2560. It rejects `!important` in adaptive compiler/runtime source and compiled artifacts, while reporting legacy compatibility CSS occurrences as explicit retirement debt.

## Known Pitfalls / Anti-Patterns

- Never accept artifact JSON, artifact hash, compiler version, job id, or artifact time from a browser request.
- Never weaken the Worker secret check to accept a raw token without the Bearer scheme, and never trust `Content-Length` as the body-size limit.
- Never accept a schema-valid artifact without recomputing its hash and checking its full StoreKit integrity pin, compiler version/stages, canonical patch set, and certified route/global layout and accessibility contracts.
- Never publish a recompilation after shadow review; publish the persisted candidate by job id.
- Never downgrade a source revision mismatch to a retry against newer source. Start a new idempotency request.
- Never treat `uncomparable` or `different` structural evidence as accepted.
- Never grant authenticated users direct execution of the shadow-evidence writer.
- Never update/delete artifact, publication, job-event, or rollout-incident audit rows.
- The deprecated one-shot installation SQL is not a substitute for `stage_adaptive_store_kit_installation`. The release job consumes the staged lifecycle's stable installation UUID and reconstructable canonical source; it must not synthesize missing merchant preset, token overrides, bindings, patches, or assets.
- A local test pass does not prove migrations, worker secrets, Edge deployment, scheduling, or live RUM.

## Extensibility

A certified legacy projection adapter can be injected into `SupabaseAdaptiveReleaseGateway`. Screenshot evidence can be attached as a separate visual review without changing structural evidence. A queue/lease worker may resume persisted nonterminal candidates, but must retain the same job id, created time, source revision, and candidate bytes.
