# Adaptive Commerce Release QA

## Purpose

Provide a deterministic hard gate across every certified artifact, storefront resource, integer width from 320 through 2560, and a compact adversarial content matrix.

## Owns

- Width enumeration and adversarial fixture definitions.
- Route/artifact/fixture/width evidence coordinates.
- Blocking versus warning release outcome.
- The boundary-browser probe covering all eight routes at 320, 390, 768, 1024, 1440, and 2560 pixels.
- The real-runtime pairwise browser matrix covering every route with 1/500 products, tiny/huge copy and prices, missing/portrait/landscape/ultrawide media, 3/18 navigation items, German, and Arabic RTL.

## Does NOT Own

- Layout or browser rendering implementations.
- Compiler diagnostics, screenshots, accessibility engines, or performance budgets.
- Production deployment approval.

## Public API

```ts
adaptiveQaWidths(step?: number): number[];
runContinuousAdaptiveQa(input: {
  artifacts: RuntimeArtifact[];
  probe: AdaptiveQaProbe;
}): Promise<AdaptiveQaReport>;
```

## Depends On

- Certified RuntimeArtifact contracts.
- Injected compiler/layout/browser probes.

## Folder

`src/adaptive-commerce/qa/`

## State Ownership

The gate is pure and owns no persisted state. CI owns the resulting report artifact.

## Event Flow

Certified artifacts -> all eight resources -> adversarial fixtures -> 320-2560 width sweep -> injected diagnostics -> real adaptive React browser matrix -> stable evidence report -> hard release decision.

## Performance Notes

The every-pixel sweep is intended for fast data-level compiler/layout probes. The Playwright boundary and pairwise matrices render the real React runtime and assert one H1, no fail-closed surface, no document overflow, logical direction, non-empty sections, 44px interaction targets, required commerce controls, and no detected product-card collisions, clipped media, or main-content text overflow. Screenshots and traces are retained on browser failure.

`npm run verify:v3-release` is the single hard local entrypoint. It first runs
the deterministic four-StoreKit, eight-route, every-integer-width structural
gate and then runs `tests/e2e/adaptive-commerce-storefront.spec.ts` in a real
browser. A failure in either process exits non-zero; the structural report
alone is never reported as a complete v3 release pass. The release-specific
Playwright configuration starts a fresh strict-port Vite process and disables
server reuse so a stale developer server cannot satisfy the gate.

## Known Pitfalls / Anti-Patterns

- Never substitute a few named breakpoints for the continuous data-level sweep.
- Never test only ideal catalog content.
- Never mark a warning-only report passed when a commerce control or route blocker exists.
- Never call the structural every-pixel sweep a browser collision or overflow proof; both gates are required.

## Extensibility

Accessibility, collision, commerce-control, visual, and performance probes plug into the same evidence coordinates without changing gate ownership.
