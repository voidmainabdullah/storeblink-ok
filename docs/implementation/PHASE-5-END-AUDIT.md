# Phase 5 End Architecture Audit

Date: 2026-08-01

Status: The Phase 5 Components, Instances, and Shared Chrome acceptance gate is implemented and verified in the local editor/runtime. This status does not make the complete StoreBlink roadmap production-ready. The target Supabase verification from Phase 3 and the broader Phase 9 browser/device certification remain release blockers.

## Implemented ✓

- `SceneTree.components` persists one versioned component library containing definitions, variants, and shared-chrome references.
- The Engine Kernel creates one private `ComponentSystem` per editor and injects the same instance into `PageDocumentSystem`; UI code resolves it through `EngineContext`.
- A container or section can become a definition without replacing its editable Scene Graph master.
- Instances are ordinary physical Scene Graph subtrees. Every node keeps a stable source-node ID and instance-root ID, so renderer, selection, hit testing, transform, responsive layout, layers, and inspector paths require no virtual-renderer fork.
- Instance roots persist `componentDefinitionId`, `variantId`, controlled overrides, and `detached: false`.
- Controlled override scopes are text, image, link, product binding, and visibility. Unsupported structural style/transform patches are rejected instead of silently breaking inheritance.
- Variants are persisted, path-aligned to compatible source nodes, selectable in the inspector, and retain compatible overrides during a swap.
- Master propagation preserves physical IDs, root placement, responsive root layout, and controlled content overrides while replacing master-owned structure and style.
- Propagation batches all instance rewrites into one clone and one validation boundary per public operation rather than cloning once per instance.
- Header and footer are shared definitions (`store-shared-header`, `store-shared-footer`). Custom pages hold linked physical instances with unique IDs rather than unrelated copied sections.
- Page-specific shared-chrome overrides survive page switches and persistence and can be reset to the global master.
- Override capture occurs against each page's previous definition before a newer central library is attached. This prevents inherited stale values from being misclassified as merchant overrides.
- Home-page instance edits use the same override-capture boundary as custom pages, preventing save/page-switch propagation from erasing text or image changes.
- `PageDocumentSystem` version 2 owns the central component library and migrates version-1 page documents during load.
- Component master mutations prepare every affected page and commit the page document plus active Scene Graph through one Transaction/History entry. Undo and redo restore active and inactive page instances together.
- Impact analysis reports instance and page counts using the live active scene instead of a stale page snapshot.
- Detach removes managed metadata/source links and leaves a valid independent editable subtree.
- The inspector exposes Create component, Update master, impact count, Add variant, variant swap, Reset overrides, Create instance, and Detach.
- Insert tools exposes a global component library in structured and freeform scenes. Insert chooses an unlocked compatible parent through `NodeSchemaRegistry.validateRelationship` and commits through the component page transaction.
- Scene validation rejects dangling instance definitions, missing variants, inconsistent component metadata, invalid definition trees, and dangling shared-header/footer references.
- Component definitions survive store theme serialization, page switching, recovery, publishing, and public Scene Graph rendering paths.
- Component and page-document ownership contracts are documented in `docs/SYSTEMS/component-system.md` and `docs/SYSTEMS/page-document-system.md`.

## Verification

| Gate | Result |
|---|---|
| `npx tsc --noEmit` | Pass |
| focused component/page/transaction tests | Pass: 3 files, 17 tests |
| component inspector and library UI tests | Pass: 2 files, 4 tests |
| broader migration/recovery/publishing/storefront suite | Pass: 11 files, 61 tests |
| `npm run test -- --maxWorkers=1` | Pass: 88 files, 330 tests |
| `npm run lint` | Pass: 0 errors; 20 pre-existing Fast Refresh warnings |
| `npm run build` | Pass: Vite 6.4.3, 2,284 modules transformed |
| `npm run verify:public-bundle` | Pass: public runtime isolated across 24 reachable chunks |
| `npm run verify:security-headers` | Pass: 6 headers and 7 mandatory CSP directives |
| `npm run verify:production-audit` | Pass under the reviewed SPA-only React Router advisory exception, expiring 2026-09-01 |
| `npm run test:e2e` | Pass: 3 Chromium tests, including the real-browser component contract |
| live route probes | Pass: `/` and `/dashboard/store` return HTTP 200 on port 8082 |

## Missing ✗

- Target Supabase publication-history migrations, RPCs, and RLS remain unverified against the remote project from Phase 3. This is outside the local Phase 5 component implementation but still blocks a production-release claim.
- Full Chrome, Edge, Firefox, Safari, Android Chrome, and iOS Safari certification remains assigned to Phase 9.
- A browser E2E using a real authenticated merchant profile to click every inspector/library action is not present. The actual Component System runs in Chromium, and the UI actions are covered in React tests, but the complete authenticated workflow still belongs in the Phase 9 critical-path suite.

## Partially Implemented △

- Definition lifecycle covers create, instantiate, update, variants, reset, detach, and impact. Dedicated rename/delete definition actions and explicit named slots are not implemented; deleting a definition safely requires dependency-aware UX rather than direct record removal.
- Variant compatibility currently aligns equivalent typed tree paths. Explicit slot IDs would make heavily restructured variants easier to evolve without override orphaning.
- Component transactions normalize all page scenes to guarantee consistency. Maximum certified page/instance counts and an interaction-independent latency budget have not yet been established by Phase 9 performance tests.
- Nested managed component instances are deliberately rejected during definition creation. Supporting nested composition requires cycle detection and dependency ordering beyond this phase's acceptance gate.

## Technical Debt

- Component libraries are structurally shared through ordinary Scene Graph clones and copied on component mutation. Future contributors must preserve this copy-on-write rule.
- `PageDocumentSystem` stores physical instance caches in each page scene plus one central definition library. The physical nodes are necessary for current editor systems, but serialization size should be measured against large-store fixtures.
- Component override capture is boundary-driven; the physical node remains the immediate editing target, while managed override metadata is reconciled during component/page transactions and persistence.
- Twenty Fast Refresh export-boundary warnings remain outside the Phase 5 runtime behavior.
- Raw `npm audit --omit=dev` reports two high-severity package entries (`react-router` and its `react-router-dom` dependent) for one RSC-only advisory, `GHSA-qwww-vcr4-c8h2`. StoreBlink ships a client-only BrowserRouter SPA and imports no affected server/RSC API. The automated exception is version-pinned, source-scanned, and expires on 2026-09-01; it must not become permanent.

## Regression Risk

- High: capturing inactive instances after attaching a newer definition would convert inherited stale values into overrides and stop future master propagation. The ordering regression test must remain mandatory.
- High: committing a master update as Scene Graph only would leave inactive page scenes and undo history divergent. Component mutations must remain page/document transactions.
- High: dropping `SceneTree.components` from a scene literal, store replacement, template reconciliation, or recovery snapshot would make attached instances invalid.
- Medium: changing source-node identity or variant alignment can orphan controlled overrides.
- Medium: broad page normalization can become expensive for very large documents; optimize with measured indexes/caches without weakening atomic consistency.
- Medium: allowing arbitrary style or transform overrides would create hidden master drift and make reset behavior unreliable.
- Low: component editor modules remain absent from the verified public storefront chunk graph.

## Next Actions

1. Start Phase 6 with its required start audit, mapping the existing mobile menu and theme chrome implementations against one shared header state machine, fit manager, and overlay coordinator.
2. Preserve shared header/footer component ownership while Phase 6 adds runtime header states; do not reintroduce theme-specific copied chrome.
3. Add definition rename/delete only with Dependency Graph impact checks and one reversible document transaction.
4. Add large-document component propagation budgets and authenticated component-editor browser flows to the Phase 9 certification suite.
5. Complete the unresolved remote Phase 3 Supabase/RLS verification before any public-commerce release claim.
