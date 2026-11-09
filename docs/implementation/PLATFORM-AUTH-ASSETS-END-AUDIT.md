# StoreBlink Auth, Authorization and Asset Platform - End Audit

Date: 2026-08-09

## Implemented ✓

- Exactly one lazy browser Supabase client validates browser-safe keys and uses
  native PKCE, persistence, refresh, and URL-session detection.
- Merchant auth mounts only below the lazy dashboard/auth boundary. Public
  `/store/*` routes use anonymous REST/RPC reads and do not load AuthProvider,
  merchant sessions, bootstrap data, drafts, or the Supabase auth chunk.
- AuthService, SessionManager, PermissionService, AuthProvider, AuthGuard,
  typed errors, password recovery/update, Turnstile token plumbing, TOTP MFA,
  AAL tracking, refresh persistence, and membership-revocation refresh are wired.
- Session initialization is generation-safe across React Strict Mode replay;
  stale disposed requests are ignored and duplicate `INITIAL_SESSION` sources
  no longer trigger duplicate dashboard bootstrap work.
- Dashboard bootstrap returns only profile summary, selected store, membership,
  and effective capabilities. Feature queries keep explicit `store_id` filters.
- Roles are normalized to owner/admin/designer/catalog_manager/support/viewer;
  membership status and capability helpers are enforced in a private schema.
- AAL2 is enforced for membership administration, ownership transfer, store
  deletion/suspension-sensitive updates, and payment mutations. The payments UI
  also performs step-up routing.
- Tenant RLS replaces permissive owner policies across stores, memberships,
  themes/pages/menus, catalog, orders, customers, payments, and assets.
- The existing Asset System is extended instead of duplicated. One AssetManager
  now handles inspector replacement, empty-image insertion, logo/menu uploads,
  editor insertion, dashboard AI banners, and compatibility upload components.
- New Scene assets contain `assetId` plus immutable Storage metadata, not base64.
  Legacy inline data remains read-only compatibility for existing scenes.
- Small uploads go directly to Storage; files over 6 MiB and cancellable uploads
  use TUS with progress, abort, retry delays, exact-path resume, typed 409
  conflicts, and non-destructive retry semantics.
- Public/private bucket strategy, prepared-path write policy, metadata lifecycle,
  SVG sanitization, SHA-256 hashes, responsive presets, CDN URLs, signed-URL
  caching, replacement, retirement, and failure cleanup are implemented.
- Active Overview/editor publishing paths now use the selected store rather than
  assuming `user.id` is the store/owner. Generated drafts use an optimistic,
  capability-checked store RPC.
- Dependency audit was repaired: `npm audit --omit=dev` reports zero known
  vulnerabilities after updating PostCSS/Nanoid transitive versions.

## Missing ✗

- The migration has not been applied to or tested against a linked
  non-production Supabase project. `supabase migration list` reports that this
  checkout is not linked.
- Local pgTAP, storage-policy, and EXPLAIN execution is unavailable because no
  local Supabase Postgres is running and Docker is not installed.
- Hosted Auth settings for leaked-password protection, minimum password policy,
  email templates/redirect allow-list, production Turnstile keys, SMTP, and
  rate limits cannot be verified from repository code.
- Real-account browser flows for email delivery/verification, reset-link
  consumption, MFA, store switching, upload interruption, and replacement need
  non-production credentials/inbox/TOTP fixtures. The credential-gated
  Playwright test is checked in but skipped when credentials are absent.

## Partially Implemented △

- Generated Supabase TypeScript types predate the new stores/members/assets/RPC
  schema. Runtime boundaries use Zod and narrow casts; types must be regenerated
  after the migration is deployed.
- Legacy `StoreBuilderEditor` and onboarding compatibility code still writes the
  owner projection directly. The active `/dashboard/store` EngineEditor,
  Overview, publishing, products, orders, customers, payments, and assets are
  selected-store scoped.
- Existing scenes may still render legacy SVG/raster data URLs. All new managed
  uploads are durable references, but a background migration/garbage-collection
  job is still needed before removing legacy readers and orphaned objects.

## Technical Debt

- The owner-profile projection remains a backward-compatibility persistence
  bridge under `stores`; removing it requires a separately staged data migration.
- A scheduled reconciler should retire failed/pending assets beyond a retention
  window and remove unreferenced immutable objects.
- Store switching is supported by the auth API but lacks a dedicated accessible
  store-list/switcher workflow and real multi-store E2E fixture.
- The stricter `tsconfig.app.json` check still reports unrelated historical
  editor/theme typing errors; the required repository command
  `npx tsc --noEmit` passes and no strict errors remain in auth/asset/editor-data
  integration paths.

## Regression Risk

- High until deployment verification: pre-existing database objects/policies may
  differ from migration assumptions even though SQL contracts and pgTAP tests
  are checked in.
- Medium: removing legacy inline-asset readers before all persisted scenes are
  migrated would break old content.
- Medium: enabling mandatory MFA globally without enrollment/recovery operations
  can lock out merchants; rollout must be staged per sensitive operation first.
- Low: public route isolation is covered in unit, manifest, production build,
  and browser tests; future broad barrel imports could reintroduce auth bundles,
  so `verify:public-bundle` remains a required CI gate.

## Next Actions

1. Link a non-production Supabase project and apply
   `20260801000100_auth_asset_platform.sql` after backup/review.
2. Run `supabase test db` and `auth_asset_explain.sql` with representative data;
   inspect every plan and policy before production promotion.
3. Regenerate `src/integrations/supabase/types.ts` from that deployed schema.
4. Configure hosted password/leaked-password, SMTP, redirect, Turnstile, and
   rate-limit settings and execute credentialed Playwright auth/MFA/upload flows.
5. Migrate legacy inline assets and owner-profile projections, then enable the
   pending/orphan asset reconciliation job.

## Verification Evidence

- `npx tsc --noEmit`: pass.
- `npm run lint`: pass with zero errors and 25 existing Fast Refresh/hook
  warnings; tenant-critical `activeStoreId` dependency warnings were fixed.
- `npm run test -- --maxWorkers=1`: pass, 95 files and 353 tests. The final
  cold single-worker run completed in 308.81 seconds with a 4 GiB Node heap.
- `npm run build`: pass; Vite transformed 2,326 modules and emitted the auth
  runtime as a lazy dashboard chunk.
- `npm run verify:public-bundle`: pass across 29 statically reachable public chunks.
- `npm run test:e2e -- tests/e2e/auth-platform.spec.ts`: 2 passed, 1
  credential-gated test skipped.
- `npm audit --omit=dev`: zero vulnerabilities after remediation.
- `supabase migration list`: blocked, project not linked.
- `supabase db lint --local --level warning` and `supabase test db`: blocked,
  local Postgres unavailable; Docker command is not installed.

## Architecture Before and After

Before: one app-wide auth context, page-level profile/session reads, owner-ID
authorization assumptions, mixed owner RLS, direct Storage/FileReader upload
paths, embedded asset bytes, and public routes sharing merchant dependencies.

After: lazy dashboard auth boundary -> singleton SessionManager/AuthService ->
small selected-store bootstrap -> capability UX -> explicit tenant service/RPC
-> authoritative RLS/AAL2. Media flows through AssetManager -> prepare RPC ->
direct immutable Storage upload -> finalize metadata -> Scene asset reference.
Public routes use published anonymous resolvers and a separate static bundle graph.

## Migration and Policy Inventory

- Migration: `supabase/migrations/20260801000100_auth_asset_platform.sql`.
- Database tests: `supabase/tests/auth_asset_rls.test.sql` and
  `supabase/tests/auth_asset_explain.sql`.
- Adds/updates private capability/AAL helpers, owner/membership invariants,
  bootstrap/editor/generated-draft/publishing/asset RPCs, tenant columns/indexes,
  asset metadata, four buckets, and capability/path-scoped RLS/storage policies.

## Removed Bypasses

- Public storefront authenticated client/session/profile/draft fallback.
- Unsafe publishing fallback that directly mutated profiles.
- Active editor and Overview owner-ID store assumptions.
- Image inspector, editor insertion, logo/menu, AI banner, and upload-component
  FileReader/base64 or direct Storage writes.
- Public renderer imports of the authenticated asset runtime.
- Retry cleanup that could delete bytes belonging to an identical in-flight upload.

## Key Files Changed

- Auth/Supabase: `src/platform/auth/*`, `src/platform/supabase/*`, `src/App.tsx`,
  `src/pages/Auth.tsx`, `src/pages/AuthCallback.tsx`, `src/pages/Mfa.tsx`.
- Tenant services/UI: `src/platform/editor-data/*`, dashboard data pages,
  `src/pages/dashboard/EngineEditor.tsx`, `src/pages/dashboard/Overview.tsx`.
- Assets: `src/assets/system/*`, `src/elements/image/ImageRenderer.tsx`,
  editor/upload components, `src/lib/uploadImage.ts`, Theme Chrome asset reads.
- Public boundary: storefront resolver/gateway/pages,
  `scripts/verify-public-bundle.mjs`, `vite.config.ts`.
- Database/tests/docs: the auth/asset migration, pgTAP/EXPLAIN scripts,
  auth/asset/editor-data unit tests, `tests/e2e/auth-platform.spec.ts`, and these
  system/audit documents.
