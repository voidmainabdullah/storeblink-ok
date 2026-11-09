# Adaptive StoreKit Legacy Upgrade Entry

## Outcome

The active legacy storefront editor now has an additive `Adaptive upgrade` action. It is a review-first staging surface, not a release shortcut.

## Merchant flow

1. `MyStore` confirms that no staged or active Adaptive authoring source exists and keeps `EngineEditor` mounted.
2. The merchant opens the header action and reviews the current store profile, exact released StoreKit version/preset, and Home, Product, Collection, Page, Blog, Cart, Search, and 404 coverage.
3. A merchant with `theme.edit` explicitly selects **Stage ... for review**.
4. The browser reads the latest RLS-visible installation revision and reuses one locally persisted idempotency key across uncertain retries.
5. `StoreKitInstallationService` resolves the exact released catalog, validates all eight lockfile routes, seeds certified section controls, and invokes only `stage_adaptive_store_kit_installation`.
6. `MyStore` reloads authoring source and requires the returned store and installation UUID to match the staging result before opening `AdaptiveStoreEditor`.

## Safety contract

- Live publication is unchanged.
- No browser API for compile, shadow acceptance, activation, pointer mutation, or publish is present in the upgrade controller.
- The server repeats `theme.edit`, released catalog, exact lockfile, eight-route, optimistic revision, and idempotency checks.
- Store locale and currency remain authoritative server profile fields; current store/business names seed the staged semantic base.
- A failed post-stage editor reload keeps the idempotency key so retry replays the same request instead of creating a second installation.
- Legacy page templates remain legacy page templates. The upgrade UI lists StoreKits only by their released registry names.

## Verification

Focused verification on 2026-08-26:

```text
npx vitest run src/adaptive-commerce/installation/LegacyAdaptiveStoreKitUpgrade.test.ts src/adaptive-commerce/installation/SupabaseStoreKitInstallationGateway.test.ts src/pages/dashboard/LegacyAdaptiveStoreKitUpgradeEntry.test.tsx src/pages/dashboard/MyStore.test.tsx --maxWorkers=1

4 files passed
13 tests passed
```

The focused ESLint run completed with no new errors. Two existing `EngineEditor` exhaustive-dependency warnings remain outside this narrow header-extension change. The full application typecheck still has unrelated baseline errors; none reference the upgrade, installation gateway, MyStore, or EngineEditor files changed here.

## Deployment boundary

This code does not prove the production database migrations or released built-in catalog rows are deployed. Until `20260821000300_adaptive_store_kit_staged_activation.sql` and `20260821000400_adaptive_storefront_authoring.sql` are applied and accepted in the target Supabase project, production staging and post-stage editor loading remain unverified.
