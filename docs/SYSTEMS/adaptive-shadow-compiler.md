# Adaptive Shadow Compiler

## Purpose

Compare the current legacy storefront's comparable runtime structure with an Adaptive Commerce artifact before any cohort is activated.

## Owns

- Render-relevant artifact projection.
- Deterministic structural hashing and path-level differences.
- Explicit `uncomparable` results for opaque legacy route implementations.

## Does NOT Own

- Compilation, screenshots, perceptual image comparison, or review approval.
- Runtime activation or rollout percentages.
- Mutation of legacy publications.

## Public API

```ts
projectRuntimeArtifact(artifact: RuntimeArtifact): ShadowComparableProjection;
compareShadowArtifacts(
  legacy: LegacyShadowProjection,
  adaptive: RuntimeArtifact,
): StructuralArtifactDiff;
```

## Depends On

- RuntimeArtifact contracts.
- Canonical JSON and SHA-256 utilities.
- Compatibility extraction for the legacy projection.

## Folder

`src/adaptive-commerce/shadow/`

## State Ownership

This is a pure comparison system. The persistence system owns review status and evidence records.

## Event Flow

Legacy publication -> compatibility projection -> adaptive compile -> render-relevant projection -> deterministic structural diff -> visual review -> accepted/rejected shadow record.

## Performance Notes

Comparison operates on compiler data, never mounted React trees. Values in the report are represented by hashes so evidence remains compact.

## Known Pitfalls / Anti-Patterns

- Never call a structural comparison a visual diff.
- Never treat an opaque route as equal or omit it from the result.
- Never ignore layout, behavior, accessibility, or collection order.

## Extensibility

A screenshot harness can attach a separate visual-diff object to the persisted shadow record without changing structural comparison ownership.
