# Phase 0 End Architecture Audit

Date: 2026-08-01

## Implemented (PASS)

- Baseline commands and failures are recorded in `PHASE-0-START-AUDIT.md`.
- Source inventory captured: 489 files under `src/` across the engine, rendering, interaction, layout, document, asset, persistence, platform, theme, storefront, and UI domains.
- Recovery archive: `F:\Storeblink-recovery\phase-0-baseline-2026-08-01.zip`.
- Recovery SHA-256: `BE7C2B6D260425F39996D68D88C62223C546513EDCD2A12A784FB1738DF44C59`.
- Seven reusable regression fixtures now cover empty, normal, large, mobile-heavy, SVG, legacy, and product-heavy scenes.
- Fixture structure and legacy SVG ingestion are covered by automated tests.

## Architecture Ownership Map

| Domain | Current owner/path | Finding |
|---|---|---|
| Editor route | `App -> MyStore -> EngineProvider -> EngineEditor` | Active Engine path confirmed |
| Canvas runtime | `CanvasShell -> SceneRenderProvider/RendererSystem` | Engine runtime confirmed |
| Storefront route | `Store` and `ProductDetail` under `/store/:slug` | Separate public runtime confirmed |
| Scene Graph | `scene.store` through `sceneGraphAdapter` | Store-backed; kernel isolation missing |
| Commands | `engine/command` dispatcher and factories | Present; dispatch context is passed explicitly |
| History | `engine/history` | Module-global arrays; not instance-owned |
| Responsive | `layout/responsive` plus responsive store | Present; global singleton registered in kernel |
| Assets | `assets/system` | Present; global singleton registered in kernel |
| Publishing | `platform/publishing` | Serialized service with draft/publish/recovery seams |
| Commerce | Catalog resolver plus direct dashboard Supabase access | Public reads separated; server authority incomplete |

## Risky API Inventory

| Pattern | Matches | Disposition |
|---|---:|---|
| `dangerouslySetInnerHTML` | 3 | Chart CSS plus SVG renderer trust boundary; SVG path requires Phase 1 hardening |
| `FileReader` | 5 | Upload/inspector paths; central asset ingestion remains Phase 2 debt |
| `localStorage` | 18 | Preferences, auth, cart/wishlist, and draft backup; durable recovery remains Phase 3 debt |
| `JSON.stringify(scene)` | 5 | Tests and draft serialization; schema/version migration remains Phase 3 debt |
| `console.error` | 21 | Scripts, edge functions, and runtime boundaries; telemetry remains Phase 9 debt |
| `window.devicePixelRatio` | 0 | No direct usage found |
| `transform: scale` | 11 | Animation/media hover plus legacy storefront CSS; root storefront scaling needs Phase 4 certification |
| CSS/property `zoom` | 19 | Primarily typed viewport state; no public root CSS `zoom` declaration found |

## Direct Ownership Bypasses

- Active editor/UI direct singleton imports exist in `EngineEditor`, `CanvasShell`, `EngineInspectorPanel`, `StructuredInspectorFields`, and `StructuredLayerTree`.
- Direct Supabase reads or mutations exist in dashboard pages/components including `Items`, `Orders`, `Customers`, `Payments`, `Overview`, `EngineEditor`, `NotificationsPopover`, `ProfilePopover`, `Onboarding`, and `OnboardingGate`.
- These are findings for ordered Phase 2/7 migration, not silently removed during baseline creation.

## Missing (FAIL)

- Remote migration verification and real-profile scene verification remain unavailable without production project access.
- Browser interaction baselines remain missing because no E2E harness exists.

## Partially Implemented (PARTIAL)

- Recovery is available as a filesystem archive, but not yet as automated browser crash recovery.
- Runtime separation exists, but public immutable-revision enforcement still requires environment-backed proof.

## Technical Debt

- Module-global engine systems make parallel editor instances unsafe.
- Legacy editor and active editor coexist.
- No CI artifact stores command results, browser screenshots, or migration reports.

## Regression Risk

- Baseline code behavior was preserved before Phase 1 changes.
- New fixture generation is deterministic and does not enter production bundles unless imported by tests.
- Large/product-heavy fixtures can increase test memory only when explicitly instantiated.

## Next Actions

1. Execute Phase 1 stored SVG, truthful commerce/contact, dependency, lint, and header gates.
2. Do not start kernel ownership changes until Phase 1 verification passes.

