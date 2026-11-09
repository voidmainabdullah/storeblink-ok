# Adaptive Commerce AI Planner

## Purpose

Translate merchant intent into certified StoreKit, preset, component-variant, and content-mapping IDs, then submit the candidate to deterministic compiler validation.

## Owns

- Strict planner output schema.
- Certified-ID allow-list validation.
- A maximum of three validate/re-plan attempts.
- Machine-readable rejection feedback and a privacy-bounded audit trail.

## Does NOT Own

- Raw CSS, colors, spacing, layout geometry, or arbitrary component code.
- Storefront compilation or publication.
- Provider credentials, billing, or model selection.
- Automatic activation; a merchant review remains required.

## Public API

```ts
class AdaptiveCommercePlanner {
  plan(intent: string, catalog: PlannerCatalog): Promise<AdaptivePlannerResult>;
}
```

The provider can return only an unknown candidate. The planner parses it, enforces the current certified catalog, and invokes a deterministic validation callback before accepting it.

## Depends On

- Adaptive Commerce contracts and package references.
- Canonical JSON and runtime-neutral SHA-256 utilities.
- An injected planning provider and compiler validator.

## Folder

`src/adaptive-commerce/ai/`

## State Ownership

The planner owns no persistent state. Its output and attempts are immutable values; server persistence owns audit records.

## Event Flow

Merchant intent -> provider candidate -> strict schema -> certified ID allow-list -> compiler validation -> accept or rejection feedback -> bounded re-plan -> merchant review.

## Performance Notes

Catalog inputs should contain identifiers and small policy metadata only. Full component implementations or store data must not be placed in the model prompt.

## Known Pitfalls / Anti-Patterns

- Never accept raw style values from a provider.
- Never skip compiler validation because a schema parsed.
- Never retry without a hard attempt bound.
- Never persist raw merchant prompts in the audit record.

## Extensibility

Providers implement one narrow `generate` interface. Evaluation harnesses can inject deterministic fake providers and compiler rejection fixtures without network access.

The deployable server boundary is `supabase/functions/plan-adaptive-storefront`.
It authenticates the user, requires merchant `theme.edit` capability and AAL2, loads only released
catalog IDs, bounds the provider to three attempts, and calls the separately
deployed compiler preflight on every structurally valid candidate. Successful
output is a review-required proposal; it never installs or publishes directly.
The active dashboard presents this proposal without saving or applying it. The
former `generate-store-theme` raw-style endpoint is intentionally retained only
as a `410 LEGACY_THEME_GENERATOR_RETIRED` compatibility response so older clients
cannot bypass the certified-ID and merchant-review contract.
Required server-only configuration is `ADAPTIVE_AI_GATEWAY_URL`,
`ADAPTIVE_AI_API_KEY`, `ADAPTIVE_AI_MODEL`,
`ADAPTIVE_COMPILER_PREFLIGHT_URL`, and
`ADAPTIVE_COMPILER_SERVICE_TOKEN`. Missing configuration fails closed.
