# Adaptive Commerce Architecture v3 — Implementation Status

Date: 2026-08-27

## Status language

This document separates repository completion from production acceptance:

- **Implemented locally** means the contract, runtime path, persistence migration, safety boundary, documentation, and automated tests exist in this repository.
- **Production accepted** requires deployed migrations/functions/Workers, real authenticated stores, observed traffic, and human/operational evidence. Local tests cannot manufacture that evidence.
- Legacy storefront reads remain available behind the runtime assignment and kill switch until the Phase 5 observation gate authorizes removal.

## Phase 0 — Decisions and safety baseline

**Local status: implemented. Production sign-off: pending.**

- ADRs define semantic base plus merchant patch ownership, batch compilation, third-party isolation, and exact StoreKit locks.
- Theme publication policy fails closed, theme previews are non-mutating, and reconciliation preserves merchant-owned geometry.
- Active legacy theme application remains accurately described as a compatibility flow, not a whole-store StoreKit installation.

Production acceptance still requires an approved redacted live-store semantic-path sample, written architectural sign-off, and current storefront browser/device analytics.

## Phase 1 — Canonical contracts, installation, shadow, and assignment

**Local status: implemented. Live canary exit: pending.**

- Pure JSON/Zod contracts cover DesignPack, ComponentLibrary, TemplateBlueprint, StoreKit, StoreDefinition, MerchantPatch, CommerceBinding, installation, and RuntimeArtifact.
- The registry resolves exact multi-version pins and all eight storefront resource assignments.
- Merchant patches and three-way merge use semantic paths, explicit rename handling, deterministic ordering, and surfaced conflicts.
- StoreKit installation is staged with a stable identity and complete canonical source. Trusted activation is atomic; the deprecated one-shot commit fails without mutation.
- Shadow compilation persists exact candidates. Comparable differences require explicit review; opaque legacy output remains uncomparable until trusted visual evidence exists.
- Runtime assignment is sticky, percentage-bound, fail-legacy, and independently kill-switchable.

Production acceptance still requires deployed RLS/RPCs, approved shadow and visual evidence for real stores, an agreed canary count, and a zero-unexplained-diff observation period.

## Phase 2 — Certified components, compiler, artifacts, and runtime

**Local status: implemented. Real cohort exit: pending.**

- Certified components require named slots, variants, customization policy, responsive policy, commerce bindings, and accessibility contracts.
- Four built-in StoreKits resolve dedicated Home, Product, Collection, Page, Blog, Cart, Search, and 404 blueprints without route fallbacks.
- The deterministic eleven-stage compiler resolves tokens, patches, slots, bindings, layout, responsive policy, accessibility, assets, and performance into an immutable SHA-256 artifact.
- A trusted Worker loads exact released pins, compiles once, applies the production artifact gate, persists the exact candidate, and never accepts browser artifact bytes or hashes.
- Publication consumes the reviewed persisted candidate and advances one immutable active pointer transactionally. Rollback changes the pointer, not publication history.
- Public adaptive routes resolve the assigned artifact, recheck its digest, and hydrate current commerce data through compiled prop-only binding plans.

Production acceptance still requires deploying the compiler Worker and Edge triggers, applying migrations, exercising authenticated publish/rollback against the target project, and serving a real canary cohort exclusively from artifacts.

## Phase 3 — Tokens, responsive primitives, and merchant surfaces

**Local status: implemented. Merchant production exit: pending.**

- Primitive, semantic, and component token tiers resolve typed references, reject cycles/missing references, emit stable `--sb-*` variables, and preserve merchant precedence.
- Responsive Stack, Container, Cluster, Grid, Overlay, MediaFrame, Freeform compatibility, and Anchor fallback compile through logical direction-aware contracts.
- Store and Design authoring exposes certified merchant controls only. Every mutation is command-backed with undo/redo; invalid final-section hiding is rejected before history mutation.
- Theme Studio is a separate AAL2 and `theme.studio` protected surface for catalog/compiler diagnostics and runtime status.
- Legacy merchants receive a review-first StoreKit staging flow. Staging never changes the live storefront.
- Adaptive release review separately validates, reviews, and publishes through capability-scoped, exact-candidate boundaries.

Production acceptance still requires authenticated merchant edit/save/validate/review/publish evidence against deployed services and real storefront route verification.

## Phase 4 — Planner, merge, SDK, sandbox, and marketplace

**Local status: implemented. Provider and authority exit: pending.**

- The planner returns allow-listed StoreKit, blueprint, variant, and token-preset identifiers; compiler rejection can trigger bounded replanning and always ends in merchant review.
- Legacy raw theme generation is retired and cannot mutate a Scene Graph or call a model provider.
- Automatic three-way merge preserves merchant patches and reports semantic conflicts rather than guessing.
- The Theme SDK supports create, check, dev, build, test, and deterministic pack across all eight routes. Local preview is loopback-only, credential-free, and explicitly structural.
- Third-party app blocks run in an opaque sandbox with CSP, tokened messaging, explicit grants, quotas, and revocation. Compiled React remains platform-only.
- Marketplace scanning recomputes hashes, checks SDK/sandbox/publisher evidence, enforces independent human review, binds signatures to exact immutable snapshots, and fails closed on revocation.

Production acceptance still requires a real AI provider entitlement and evaluation corpus, signing authority and key rotation, durable marketplace review storage, publisher identity policy, and human security operations.

## Phase 5 — Rollout, RUM, adversarial QA, and cutover

**Local status: release mechanisms and gates implemented. Full cutover: intentionally blocked.**

- Cohorts support only 0/1/10/50/100 percent, use stable tenant bucketing, and always yield to the independent kill switch.
- Storefront RUM validates and redacts LCP, CLS, INP, and render-error samples with artifact/publication/cohort tags.
- The scheduled evaluator applies minimum samples, p75 thresholds, hysteresis, cooldown, pause, widen, and pointer-only rollback with immutable incidents.
- The hard release gate covers every built-in StoreKit and route, every integer width from 320 through 2560, adversarial content fixtures, and a real Chromium boundary matrix.
- The legacy retirement gate requires external evidence before compatibility reads/writes or the old editor can be deleted.

Production acceptance still requires deployed RUM ingestion, privacy/retention approval, live thresholds and on-call authority, observed 1/10/50/100 rollout, cross-browser/device evidence, and a defined zero-legacy-read/write period. Until then, deleting legacy persistence or assigning 100% adaptive runtime would be unsafe.

## Verification recorded on 2026-08-27

| Boundary | Result |
|---|---|
| App TypeScript | `npx tsc -p tsconfig.app.json --noEmit --pretty false` passed with zero diagnostics. |
| Production build | `npm run build` passed: 506 SSR modules and 2,619 client modules; the seven-chunk browser-runtime check also passed. |
| Full unit/integration suite | Four single-worker Vitest shards passed: 210 files and 851 tests total. |
| Certified legacy themes | `npm run verify:themes` passed Basic, Atelier, Spark Fashion, and Noir Chrono at 1440, 768, and 390 px with zero blocking diagnostics. |
| Adaptive release gate | `npm run verify:v3-release` passed 573,696 deterministic probes across four StoreKits, eight routes, every integer width from 320 through 2560, and eight adversarial fixtures. |
| Browser release matrix | The adaptive Playwright boundary and pairwise adversarial tests passed, 2 of 2. |
| Adaptive CSS policy | Compiled adaptive sources contain zero forbidden `!important` declarations and use no route fallbacks. |

The compatibility layer still contains 36 legacy `!important` declarations. The gate therefore reports `legacyRetirementReady: false`; this debt does not enter adaptive artifacts, but it must be removed and externally observed before legacy retirement.

These results prove the local repository release boundary. They do not replace deployment evidence. Every unresolved production gate still needs a named environment or operations owner before live cutover.
