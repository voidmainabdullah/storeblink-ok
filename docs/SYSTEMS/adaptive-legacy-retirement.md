# Adaptive Legacy Retirement Gate

## Purpose

Prevent removal of the legacy storefront path until deployment, complete migration, full rollout, observability, zero legacy activity, and rollback-retention evidence are all present.

## Owns

- Objective cutover evidence requirements.
- The ready/not-ready retirement decision and reason codes.

## Does NOT Own

- Migration, deployment, rollout execution, source deletion, or production telemetry.
- The emergency kill switch.

## Public API

```ts
evaluateLegacyRetirement(
  evidence: LegacyRetirementEvidence,
  requiredObservationDays?: number,
): LegacyRetirementReport;
```

## Depends On

- Deployment records.
- Store migration/shadow/publication counts.
- Runtime read/write and incident telemetry.

## Folder

`src/adaptive-commerce/cutover/`

## State Ownership

The gate is pure. External systems own the evidence and a human release owner authorizes deletion after a passing report.

## Event Flow

Shadow acceptance -> canary 1/10/50/100 -> zero-legacy observation -> retention check -> gate passes -> legacy source removal in a separate reviewed change.

## Performance Notes

The evaluator operates on aggregates and is safe to run in every release pipeline.

## Known Pitfalls / Anti-Patterns

- Never infer production readiness from local tests.
- Never start the observation clock before 100 percent rollout.
- Never delete rollback artifacts together with the runtime fallback.

## Extensibility

Additional deployment regions, browser/device cohorts, or incident policies can add explicit evidence fields without weakening existing requirements.
