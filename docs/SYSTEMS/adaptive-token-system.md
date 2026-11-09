# Adaptive Token System

## Purpose

Resolve a DesignPack's typed primitive, semantic, and component-alias tokens into a deterministic value graph, then emit StoreBlink CSS with an explicit merchant override boundary. The system also provides a compatibility bridge from the existing `ThemeDesignTokens` contract.

## Owns

- Reference resolution and validation across the three canonical token tiers.
- Runtime type validation for token literal values.
- The fixed `reset`, `platform`, `theme`, `components`, `merchant`, `utilities` cascade order.
- Deterministic `--sb-*` custom-property generation.
- Translation from legacy `ThemeDesignTokens` into a canonical `DesignTokenSet`.

## Does NOT Own

- DesignPack identity, versioning, integrity, or preset schemas; Phase 1 contracts own those.
- Merchant settings UI or direct mutation of installed themes.
- CSS injection, storefront rendering, persistence, publication, or rollout selection.
- Component styling rules beyond exposing their aliases.

## Public API

```ts
resolveDesignTokens(
  tokens: DesignTokenSet,
  merchant?: MerchantDesignTokenOverrides,
): ResolvedDesignTokenSet;

emitAdaptiveTokenCss(
  tokens: DesignTokenSet,
  merchant?: MerchantDesignTokenOverrides,
): string;

adaptThemeDesignTokens(tokens: ThemeDesignTokens): DesignTokenSet;
tokenCssVariable(addressOrPath: string): string;
tokenValueToCss(type: DesignTokenType, value: JsonValue): string;
```

## Depends On

- `adaptive-commerce/contracts/designPack` for the canonical tier and override contracts.
- `adaptive-commerce/compiler/immutable` for immutable outputs.
- `theme-engine/contracts` only in the compatibility adapter.

## Folder

`src/adaptive-commerce/tokens/`

## State Ownership

The system owns no mutable store. Every operation is pure for a given token set and merchant override input. Returned resolution graphs are cloned and deeply frozen.

## Event Flow

1. A DesignPack supplies the canonical three-tier token set.
2. The resolver validates the schema, literal types, reference existence, cycles, and downward-only tier direction.
3. Merchant overrides replace only existing semantic or component definitions and must retain the resolved token type.
4. Resolution follows those replacements through dependent aliases.
5. CSS emission preserves alias references as `var(--sb-...)` so the later merchant layer updates all dependent components through the cascade.

## Performance Notes

Resolution is linear in token definitions and reference edges, followed by stable key sorting. It uses a memoized depth-first walk and does not repeatedly traverse resolved branches. CSS generation is deterministic regardless of object insertion order.

## Known Pitfalls / Anti-Patterns

- Never allow merchant overrides of primitive tokens.
- Never resolve a lower tier by referencing a higher tier.
- Do not flatten CSS aliases to literal values; doing so would prevent merchant semantic overrides from reaching component aliases.
- Do not add `!important` or reorder the declared layers to win specificity battles.
- Different token paths must not collapse to the same `--sb-*` name; emission rejects collisions.
- The compatibility adapter is a strangler bridge, not a second canonical token contract.

## Extensibility

New DesignPacks use the Phase 1 `DesignTokenSet` contract directly. Existing themes can migrate incrementally through `adaptThemeDesignTokens`. New typed values should first be added to the canonical contract and validator, then given a deterministic CSS serializer.

