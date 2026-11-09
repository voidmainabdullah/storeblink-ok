# Adaptive Commerce Design Runtime v3 — Phase 0 Quick-Win Foundation

**Status:** implemented quick-win slice; full Phase 0 sign-off remains open
**Target architecture:** StoreBlink Adaptive Commerce Design Runtime v3
**Scope:** production safety and merchant-facing editor clarity before StoreKit persistence or compiler work

## Purpose

This phase removes current behavior that can publish an invalid storefront or
silently overwrite merchant layout during catalog hydration. It also makes the
editor describe the behavior it actually performs today. The Scene Graph stays
as the current compatibility document while the semantic StoreKit/compiler
model is introduced in later phases.

## Verified starting boundary

- The active dashboard route is `MyStore -> EngineProvider -> EngineEditor`.
- Theme package discovery is registry-based, but `ThemePackage.createScene()`
  and `reconcileScene()` currently represent only the home Scene Graph.
- The theme catalog action replaces the active page only. It is not an atomic
  `StoreKitInstallation` and must not be presented as one.
- Product, collection, cart, search, and 404 do not yet resolve through assigned
  `TemplateBlueprint` builders.
- Publication policy diagnostics existed, but the guard allowed an invalid
  publish to reach persistence before this phase.
- Before Phase 0, Spark Fashion and Atelier reconciliation copied baseline
  transforms and layouts onto existing merchant product cards.

## Phase 0 invariants

1. Drafts remain saveable while incomplete; publication is blocked by every
   production-policy error.
2. A rejected publication never reaches the persistence gateway, does not
   poison the serialized write queue, and never enters the offline retry queue.
3. Catalog reconciliation may update commerce identity/bindings and add or
   remove managed catalog nodes. It may not replace transform, responsive
   layout, styles, names, or other merchant presentation on an existing node.
4. The active theme cannot be reapplied accidentally from a preview card.
5. Merchant-facing labels use `Store`, `Design`, `Pages`, `Themes`, and `Brand`;
   Scene Graph and internal mode terminology stay out of the default UI.
6. The current page-design action includes an explicit review step and states
   its scope. It is not called a StoreKit install.

## Explicit non-goals

- No claim of full Architecture v3 completion.
- No fake `StoreKitInstallation` record derived from a home-only package.
- No automatic three-way merge, runtime compiler, AI planner, or third-party
  execution path.
- No relabeling of generic secondary-route fallbacks as theme blueprints.
- No production deployment claim; this phase is verified locally.

## Exit criteria

- Invalid publish is rejected before gateway I/O; draft save remains advisory.
- Existing card geometry survives catalog additions/removals in Basic, Atelier,
  Spark Fashion, and Noir Chrono coverage.
- Theme catalog interactions require an intentional review/confirm action and
  cannot mutate the active theme through the preview/current-state control.
- Focused tests, theme readiness, TypeScript, and production build pass.

## Next architecture boundary

The remaining Phase 0 gates from Architecture v3 are intentionally not implied
by this implementation:

- Approve ADRs for Base + Patch storage, batch compiler execution,
  third-party sandboxing, and StoreKit-as-lockfile version ownership.
- Run the semantic-path spike against an approved sample of currently-live
  store documents, not only built-in fixtures.
- Pull real customer-storefront browser/device analytics for progressive CSS
  decisions.
- Resolve the Architecture v3 open questions and obtain written Phase 1
  sign-off.

Phase 1 starts only with executable v3 contracts for `DesignPack`, `StoreKit`,
`TemplateBlueprint`, `ComponentLibrary`, semantic paths, merchant patches, and
commerce bindings. A StoreKit may be installable only when Home, Product,
Collection, Page, Cart, Search, and 404 assignments all resolve to real builders
and one server-owned transaction can persist or roll back the complete set.
