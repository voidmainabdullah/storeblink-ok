# Theme Architecture Production Hardening

**Date:** 2026-07-29  
**Comparison contract:** `StoreBlink Universal Theme Engine vs Shopify Theme Architecture.pdf`

## Start-State Architecture Audit

### Implemented ✓

- Versioned manifests and schema validation.
- Automatic manifest discovery and lazy package loading.
- Scene Graph as the persisted editable document.
- Shared editor/storefront renderer.
- Dynamic product references instead of authoritative payload duplication.
- Responsive node overrides and scene-owned canonical widths.
- Shared theme chrome, commerce, navigation, account, cart, and search boundaries.
- Command/history-backed editor mutations.
- Sequential theme migration planning with defensive backups.
- Revision-aware serialized draft/publish writes.
- Database migration definitions for versions, installations, pages, and immutable publications.

### Missing ✗

- Enforced platform quotas for scene size and complexity.
- A mandatory reusable publishing preflight boundary.
- Package provenance enforcement in production.
- Store-scoped immutable recovery points exposed by the application service.
- Visual-regression CI across every breakpoint.
- Merchant upgrade/rollback UI.
- Verified remote deployment of dedicated installation/publication tables.
- Cryptographic third-party package signing and marketplace policy enforcement.

### Partially Implemented △

- Accessibility and broken product checks exist locally inside `EngineEditor`; they can be bypassed by another publishing caller.
- Migration backups exist for schema upgrades but not as a reusable publication rollback API.
- Extension error boundaries exist, but extension provenance and count limits are absent.
- Theme installation contracts and SQL exist, but the editor still supports a serialized profile fallback.
- Safe menu resolution exists, but there is no consolidated preflight report across all persisted pages.

### Technical Debt

- Publish validation is embedded in a React page.
- Compatibility branches remain for Basic, Atelier, and `threadtemplate`.
- Large theme scene factories increase review and migration cost.
- Runtime rendering remains client-heavy compared with Shopify's HTML-first model.

### Regression Risk

- Enforcing limits can reject existing pathological documents; defaults must preserve all shipped themes.
- Publishing checks must inspect every custom page, not just the active canvas.
- Product-reference validation must preserve intentionally empty product slots.
- Trust enforcement must allow built-in packages while rejecting unverified production packages.
- Recovery data must be cloned so later mutations cannot alter backups.

## Implementation Plan

1. Create a platform-owned Theme Production Policy and diagnostic report.
2. Enforce structural, resource, accessibility, reference, and URL policies.
3. Wire policy checks into package creation/reconciliation and the final publishing service.
4. Add trusted package provenance to the package loader registry.
5. Add immutable store-scoped publication recovery points and rollback operations.
6. Add focused regression tests.
7. Run the complete test, typecheck, build, and route verification gates.
8. Append the end-state audit and bounded Shopify comparison to this document.

## End-State Architecture Audit

### Implemented ✓

- `ThemeProductionPolicy` audits every persisted page with stable diagnostic codes.
- Hard limits cover document bytes, pages, total nodes, nodes/page, depth, child fanout, sections, bindings, effects, and extension nodes.
- Unsafe `javascript:`, `data:`, and `vbscript:` navigation is rejected.
- Missing product references and accessibility defects remain repairable draft warnings and become publish errors.
- Theme identity, required sections, theme section maximums, duplicate page slugs, and Scene Graph structure are validated.
- All shipped Basic, Atelier, and Noir Chrono scenes pass the production policy.
- New themes are checked during `createScene()` and `reconcileScene()`.
- The final `StorefrontPublishingService` invokes a non-bypassable publication guard.
- Publish inputs carry current product IDs for stale-reference validation.
- Production theme-package and storefront-extension registries reject development provenance.
- Signed package/extension contracts require publisher, key ID, signature, and a successful verifier.
- Built-in source-packaged themes are explicitly platform trusted.
- Package and extension counts are bounded.
- Publication recovery snapshots are defensively cloned, tenant scoped, and retention bounded.
- Failed publish operations do not create false recovery points.
- Rollback republishes through the standard policy and revision queue as a new immutable revision.
- The Templates panel exposes confirmed restore actions and reloads the restored Scene Graph into the editor.
- Supabase migration `20260729000100_theme_production_hardening.sql` adds server-side document enforcement.
- The migration exposes authenticated publication-history metadata and single-snapshot retrieval RPCs.
- Durable publication gateway APIs support history listing and rollback publication loading.
- New system documentation records governance and publication-recovery boundaries.

### Missing ✗

- Automated screenshot/visual-diff CI at desktop, tablet, and mobile.
- HTML-first server rendering and section-level selective hydration.
- A deployed third-party marketplace signing authority and key-rotation service.
- A complete merchant theme-version upgrade console with migration preview.
- Confirmed remote application of the two storefront-domain/theme-hardening migrations.
- Multi-region publication replication and automated regional failover.

### Partially Implemented △

- Durable publication history and snapshot RPCs are implemented in SQL and gateway code, but remote database connectivity prevented deployment verification.
- The editor exposes session publication recovery; a full durable history browser can now use the gateway but is not yet presented as a paginated timeline.
- Signature verification hooks and production rejection are implemented; no external signing service is configured.
- Runtime bundles remain lazy and split, but storefront output is still client-rendered.
- Accessibility preflight covers labels, alt text, and heading count; full automated WCAG/browser auditing remains future work.

### Technical Debt

1. Large theme scene factories should be split into deterministic section factories.
2. Synchronous Basic/Atelier compatibility builders remain beside lazy package loading.
3. `threadtemplate` remains a compatibility alias.
4. The existing profile gateway fallback remains necessary until database migrations are deployed.
5. Canvas tests still emit non-failing React `act(...)` warnings.
6. Browserlist metadata is stale.

### Regression Risk

| Risk | Mitigation |
|---|---|
| Existing oversized stores rejected | Limits are above every shipped theme and drafts report repairable content as warnings |
| Validation bypass through another caller | Guard is installed in `StorefrontPublishingService`, not only the editor |
| Rollback mutates history | Recovery republishes a cloned snapshot as a new revision |
| Cross-store recovery leakage | Recovery points are store scoped; database RPCs use `can_access_store` |
| Untrusted runtime code | Production registries reject development provenance |
| Stale client bypasses limits | Database triggers revalidate draft and publication documents |
| Package loader races | Existing pending-promise deduplication remains intact |

## Implemented Production Flow

```text
Theme source/package
  -> provenance policy
  -> lazy package loader
  -> manifest validation
  -> createScene/reconcileScene
  -> ThemeProductionPolicy
  -> editor SceneReplaceCommand
  -> editable Scene Graph

Save/publish
  -> page-document serialization
  -> StorefrontPublishingService queue
  -> ThemePublicationGuard
  -> revision-aware gateway
  -> database document-policy trigger
  -> immutable storefront_publications snapshot
  -> current published projection

Rollback
  -> select immutable recovery point
  -> clone snapshot
  -> production preflight
  -> publish as next revision
  -> reload restored Scene Graph in editor
```

## StoreBlink vs Shopify: Verified Comparison

| Dimension | Current Result | Evidence-based verdict |
|---|---|---|
| Editable model | StoreBlink persists independent Scene Graph nodes with command history | StoreBlink stronger for freeform visual editing |
| Store/theme data separation | Both keep commerce data outside theme presentation | Comparable architectural invariant |
| Responsive editing | StoreBlink has explicit independent breakpoint overrides and canonical widths | StoreBlink stronger for editor-controlled responsive composition |
| Theme discovery | StoreBlink auto-discovers manifests and lazy packages | StoreBlink more dynamic inside its compiled platform |
| Schema constraints | Shopify has mature schema/editor constraints; StoreBlink now enforces document quotas and manifest rules | StoreBlink materially improved, Shopify still more battle-tested |
| Draft/publish lifecycle | Both have explicit boundaries; StoreBlink uses revision-aware immutable snapshots | Comparable design, Shopify operationally proven at larger scale |
| Rollback | StoreBlink has immutable recovery and republish primitives plus session UI | Strong architecture; durable UI/deployment remains partial |
| Package/app trust | StoreBlink rejects untrusted production provenance and supports verifier hooks | Safe default implemented; Shopify ecosystem pipeline remains more complete |
| Runtime performance | Shopify is server-rendered and HTML-first; StoreBlink is client Scene Graph runtime | Shopify stronger today |
| Visual regression tooling | StoreBlink has 221 automated tests but no screenshot CI | Shopify tooling/process stronger today |
| Ecosystem and operations | Shopify has mature Theme Check, marketplace, preview, and support workflows | Shopify stronger today |
| Extensibility | StoreBlink has canonical render fallback, package registry, dynamic bindings, and direct manipulation | StoreBlink architecturally more expressive |

## Final Verdict

StoreBlink cannot yet be honestly verified as globally “better than Shopify.”

It is now stronger in several architectural dimensions:

- Freeform Scene Graph editing.
- Shared editor/storefront document model.
- Explicit responsive overrides.
- Command/history integration.
- Dynamic package discovery.
- Platform-owned preflight with client and server enforcement.
- Immutable revision-based recovery.

Shopify remains stronger in:

- HTML-first storefront performance.
- Proven multi-tenant operational scale.
- Visual-regression and developer tooling.
- Merchant upgrade workflows.
- Marketplace trust infrastructure.
- Deployment and rollback maturity.

The verified conclusion is:

> StoreBlink now has a more expressive and in several areas more modern theme architecture, with Shopify-style production guardrails added. It is not yet operationally superior to Shopify as a complete platform.

## Verification

- `npm run test -- --maxWorkers=1` ✓
- 58 test files passed ✓
- 221 tests passed ✓
- `npx tsc --noEmit` ✓
- `npm run build` ✓
- 2,201 production modules transformed ✓
- Theme packages remain separate lazy chunks ✓
- `/`, `/dashboard/store`, `/store/nonexistent`, and `/store/nonexistent/products` return HTTP 200 from Vite ✓
- `supabase db lint --local --level warning` ✗ blocked by unavailable Postgres/network access
- Remote migration application and rollback RPC execution remain unverified ✗

## Next Actions

1. Apply `20260727000200_storefront_domain_architecture.sql` and `20260729000100_theme_production_hardening.sql` to a staging Supabase project.
2. Execute tenant-isolation, quota rejection, publication history, and rollback RPC probes.
3. Add Playwright screenshot baselines for all themes at 1440, 768, and 390 widths.
4. Add storefront performance budgets for JavaScript, LCP, CLS, image weight, and node hydration.
5. Introduce section-level lazy hydration or an SSR/static storefront delivery path.
6. Build the durable publication timeline and theme-version migration preview UI.
7. Connect a real signing authority and key-revocation policy before allowing third-party packages.
