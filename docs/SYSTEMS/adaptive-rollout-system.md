# Adaptive Rollout System

## Purpose

Provides the deterministic, fail-closed policy core for gradually selecting the
Adaptive Commerce v3 runtime, accepting privacy-safe storefront health samples,
and recommending whether an operator should pause, widen, or roll back a cohort.

## Owns

- Stable tenant assignment to the supported `0`, `1`, `10`, `50`, and `100`
  percent cohorts.
- The pure legacy-versus-v3 artifact decision.
- Validation and redaction of LCP, CLS, INP, and render-error observations.
- Per-window health classification, hysteresis, rollout cooldown, and audit
  record construction.

## Does NOT Own

- Feature-flag persistence or Worker routing.
- Network transport, Sentry, analytics storage, or retention.
- Publication creation, pointer changes, or rollback execution.
- Automatic application of a recommendation.
- Canary enrollment approval or production alert thresholds.

## Public API

```ts
assignTenantCohort(storeId, percentage, cohortKey?)

decideAdaptiveArtifact({
  storeId,
  config,
  killSwitch,
})

validateAndRedactRumSample(input)
parseRumSample(input)

new AdaptiveRolloutThresholdEvaluator(config).evaluate({
  rolloutId,
  publicationId,
  currentPercentage,
  samples,
  state,
  evaluatedAt,
})
```

All exports are available from `src/adaptive-commerce/rollout/index.ts` and
`src/adaptive-commerce/index.ts`.

## Depends On

- Zod for the untrusted rollout-config and RUM input boundaries.
- No browser, network, database, React, Sentry, or Supabase runtime.

## Folder

`src/adaptive-commerce/rollout/`

## State Ownership

The system owns no mutable global state. Cohort decisions and evaluations are
pure values. The caller supplies the previous hysteresis state and sets
`lastRolloutChangeAt` only after an operator or orchestrator actually changes
the rollout percentage.

## Event Flow

```text
Store id + rollout config + independent kill switch
  -> deterministic 10,000-bucket assignment
  -> legacy/v3 artifact decision

Storefront observation
  -> strict tag and metric validation
  -> context redaction
  -> safe RUM sample

Safe samples for one v3 publication
  -> minimum sample gate
  -> LCP/CLS/INP p75 + render-error rate
  -> pause/rollback thresholds
  -> consecutive-window hysteresis
  -> cooldown check for widening
  -> hold/pause/widen/rollback recommendation + immutable audit record
```

The deployed scheduler transport has one concrete trusted target:
`https://storeblink.com/.storeblink/internal/adaptive-rollouts/evaluate`.
One `pg_cron` job reads the Edge URL and cron secret from Supabase Vault and
invokes the Supabase schedule tick every five minutes. The tick accepts only
its cron secret, sends no tenant IDs or decision data, and forwards a fresh
evaluation ID plus timestamp. The protected
Worker handler validates its independent bearer secret and bounded input, then
runs `ScheduledRolloutBatchController` through
`SupabaseScheduledRolloutGateway`. A malformed endpoint configuration fails
closed instead of forwarding the Worker secret to another origin or path. The
Cloudflare scheduled event does not run the rollout batch, preventing duplicate
evaluation windows; it remains the independent SEO schedule owner.

## Safety Semantics

- Missing or invalid rollout configuration always selects `legacy`.
- The independent kill switch is evaluated first and always selects `legacy`,
  even if a valid configuration assigns 100 percent to v3.
- Cohorts are nested because every percentage uses the same stable bucket and
  cohort key. Changing the key intentionally creates a new population.
- RUM tags must agree: `v3-canary` pairs only with `v3`, and
  `legacy-control` pairs only with `legacy`.
- Store, publication, rollout, and cohort identifiers are opaque; arbitrary
  email-like or free-form tenant data is rejected.
- Context is scalar-only and bounded. Sensitive keys, messages, stacks,
  credentials, email addresses, query strings, fragments, and nested payloads
  are redacted or omitted.
- Each metric must independently meet the configured minimum sample count.
- LCP, CLS, and INP are evaluated at p75. Render error uses the mean of binary
  observations (`0` successful render, `1` failed render).
- Warning and critical thresholds are distinct. Consecutive-window hysteresis
  prevents a single noisy window from widening or rolling back.
- Cooldown blocks widening after a real rollout change. It never suppresses a
  safety pause or a critical rollback recommendation.
- Evaluation recommends an action; it never changes a publication or rollout
  configuration itself.

## Performance Notes

- Cohort assignment is constant-time and uses a stable 32-bit hash over
  ASCII-only opaque identifiers.
- Evaluation is linear in matching sample count. Only samples for the requested
  v3 publication participate.
- Metric arrays are sorted once to calculate p75. Production ingestion should
  provide bounded evaluation windows rather than unbounded history.

## Known Pitfalls / Anti-Patterns

- Do not use the cohort hash for authentication, secrecy, or cryptographic
  signing.
- Do not let the browser choose or persist its own rollout percentage.
- Do not treat an emitted recommendation as proof that a rollback occurred.
- Do not set `lastRolloutChangeAt` when a recommendation is merely evaluated.
- Do not send raw error messages, stacks, customer records, URLs with query
  strings, cookies, or credentials as RUM context.
- Do not compare metrics from different publication IDs in one evaluation.
- Do not widen from local test evidence; production RUM and an approved canary
  policy are still required.
- Do not treat a configured cron or a local Worker-handler test as evidence that
  the Supabase function, Cloudflare secrets, or production schedule is live.

## Extensibility

The server-only `ScheduledRolloutController` now supplies the orchestration
boundary: it loads bounded, publication-tagged adaptive RUM, invokes this pure
evaluator, gives the kill switch explicit precedence, and commits through the
single `commit_adaptive_rollout_evaluation` RPC. That RPC owns the row lock,
revision check, rollout mutation, legacy reassignment for rollback, and
immutable incident evidence; it never rewrites a publication. New metrics
still require a versioned RUM schema and an explicit aggregation/threshold
contract; they must not be added as arbitrary context fields.
