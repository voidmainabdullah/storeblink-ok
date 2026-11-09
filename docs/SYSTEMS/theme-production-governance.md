# Theme Production Governance

## Purpose

Applies platform-owned stability, security, accessibility, reference, and resource policies to every theme Scene Graph and persisted storefront document.

## Owns

- Default platform limits.
- Deterministic theme policy diagnostics.
- Draft versus publish severity rules.
- Publishing guard integration.

## Does NOT Own

- Scene Graph mutation.
- Product or navigation truth.
- Theme-specific visual design.
- Persistence or publication history.

## Public API

```ts
themeProductionPolicy.auditScene(scene, context, options)
themeProductionPolicy.auditDocument(document, context)
themeProductionPolicy.assertScene(scene, context, manifest)
themeProductionPolicy.assertDocument(document, context)
themePublicationGuard.validate(mode, input)
```

## Depends On

- Engine Scene Graph validation.
- Theme manifest registry.
- Theme contracts.

## Folder

`src/themes/governance/`

## State Ownership

The system is stateless. Limits are immutable per policy instance and reports are returned as values.

## Event Flow

Theme package creation/reconciliation or storefront persistence -> policy audit -> diagnostics -> draft continues for repair or invalid publish is rejected before gateway I/O -> Command/Publishing System.

Drafts retain repairability: missing product references and accessibility issues are warnings. Structural, quota, and unsafe-protocol violations remain errors. Publishing promotes content/reference issues to errors.

The shared publication guard records the latest report for UI diagnostics. It
allows draft persistence regardless of report validity and throws
`ThemePolicyViolationError` for an invalid publish. Because the guard runs
inside the serialized publishing queue, a rejected publish does not advance the
remote revision and later valid writes can continue.
Policy violations are deterministic document failures, not transport failures;
the editor reports them as requiring review and never queues them for an online
retry. Older queued writes that now fail policy are discarded from recovery.

## Performance Notes

- One linear traversal per page.
- Document and page budgets cap worst-case work.
- Metrics and diagnostics are computed in the same pass.
- Server-side SQL enforces core limits when clients are stale or bypassed.

## Known Pitfalls / Anti-Patterns

- Do not let themes raise platform maximums.
- Do not block draft persistence for repairable content issues.
- Do not rely only on React/editor validation.
- Do not persist authoritative product payloads to avoid reference diagnostics.

## Extensibility

New policies add stable issue codes. New publishing clients use the shared `StorefrontPublicationGuard`; they must not reimplement policy logic.
