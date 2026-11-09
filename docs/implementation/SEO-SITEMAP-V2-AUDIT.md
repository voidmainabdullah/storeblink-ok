# SEO and Sitemap Engine v2 Audit

Date: 2026-08-13

## Scope Decision

The requested Neon registry, Upstash/QStash dispatch, and standalone queue were not added because StoreBlink already owns tenant identity, RLS, content, and domains in one Supabase Postgres project. Duplicating those records would introduce distributed consistency and authorization failure modes. The implementation uses the existing Supabase Postgres database plus `sitemap_store_state`; the Cloudflare Cron sweep claims dirty stores directly, while existing `seo_sync_jobs` remains limited to domain and Search Console workflows. Cloudflare R2, Search Console, IndexNow, and Sentry boundaries are retained.

R2 route manifests replace a mandatory KV dependency. `SEO_HOSTS` remains an optional adapter; when absent, strongly consistent route-manifest objects live in the same R2 bucket as immutable generations.

## Implemented

- [x] Tenant-scoped `seo_resources` and unique `seo_metadata` records.
- [x] Generation, segment, active state, IndexNow configuration, and batch tables.
- [x] Automatic adapters for system pages, custom pages, products, collections, store publication, domain, redirect, and metadata mutations.
- [x] Meaningful public-content timestamps separate from admin-only updates.
- [x] Every eligibility branch: store/resource draft, archive, noindex, redirect, wrong domain, canonical mismatch, private, invalid route, and invalid lastmod.
- [x] Domain-at-call-time canonical resolution, including platform base paths and custom primary domains.
- [x] 25,000 URL segmentation, XML escaping, hreflang rendering, SHA-256 hashes, and complete pre-activation validation.
- [x] Immutable R2 generation writes, compensated active-manifest switch, snapshot-version binding, stale-generation rejection, failure persistence, and no dynamic crawler fallback.
- [x] Rollback artifact preflight and active pointer restoration without recompilation.
- [x] Five-minute debounced compiler sweep with leases and stale-lease recovery.
- [x] Shared metadata source for custom domains and `/store/:handle` HTML head injection.
- [x] Canonical collection storefront routes, published collection/catalog RPCs, collection-aware head metadata, and true edge 404 responses for missing resources.
- [x] Hydration preserves edge-injected registry metadata for the current canonical URL instead of overwriting it with theme fallbacks.
- [x] Existing per-merchant Google OAuth, encrypted refresh tokens, site verification, property provisioning, root sitemap submission, and status sync retained.
- [x] Versioned AES-256-GCM Google secret envelopes, current/previous key support, lazy refresh-token and verification-token re-encryption, and measurable key retirement.
- [x] IndexNow root key file, 10,000 URL batching, host validation, and result audit rows.
- [x] Merchant Pages, Products, Collections, Sitemap, and Redirects dashboard with exclusion reasons, health findings, manual recovery, and rollback.
- [x] Custom meta allow-list at UI, database, Edge Function, and Worker boundaries.
- [x] Public SEO route rate limiting and service-to-service shared-secret checks.
- [x] Cloudflare native structured logs plus optional official Sentry Cloudflare SDK.
- [x] Dirty-for-more-than-24-hours incident persistence, Worker error log, Sentry event, and merchant warning.
- [x] Unit, volume, lifecycle, rollback, chaos, migration-contract, Worker-routing, and metadata-injection tests.
- [x] CI verification and production deployment workflow with fail-closed prerequisites and public sitemap smoke test.
- [x] Production workflow synchronizes the internal cron credential across Supabase Edge secrets, Supabase Vault/pg_cron, and the Cloudflare Worker before deployment.
- [x] Repository environment example contains placeholders only; no server credential is intentionally shipped to the browser bundle.

## Missing

- [ ] A dedicated staging Cloudflare zone/store has not been supplied, so the deployment workflow can run a production-environment smoke test but cannot prove a separate staging hostname before promotion.
- [ ] Production Sentry ingestion cannot be verified until `SENTRY_DSN` is configured in the GitHub `production` environment or Worker secrets.
- [ ] Provider credentials previously present in `.env.example` must be rotated in their provider consoles before release. Sanitizing the repository copy does not revoke a credential.
- [ ] The live Worker has no secret bindings. `DOMAIN_CRON_SECRET` is mandatory; `SENTRY_DSN` is required for production error acceptance.

## Partially Implemented

- [~] Production deployment: local code, typecheck, tests, build, Worker dry-run, migration dry-run, and disposable PostgreSQL migration execution are verifiable. Cloudflare authentication and the `storeblink-seo` R2 bucket are verified, but migration `20260813000100`, current Edge Function revisions, Worker secrets, and the current Worker revision are not live.
- [~] Live provider acceptance: Google Search Console automation exists from the domain system, but this new generation's root sitemap and IndexNow key require the production deployment before end-to-end verification.
- [~] External alert delivery: Sentry is wired and Cloudflare logs are always enabled, but alert receipt needs a production DSN and one controlled stale-state test.

## Phase Status

| Phase | Code status | Production status | Evidence |
|---|---|---|---|
| 0 Data model | Implemented and executed in disposable PostgreSQL | Pending migration | `20260813000100_seo_sitemap_engine_v2.sql` plus `SeoMigrationPostgres.test.ts` |
| 1 Registry/adapters | Implemented | Pending migration | triggers plus resource upserts |
| 2 Eligibility/canonical | Implemented | Not deployment-dependent | focused branch tests |
| 3 Compiler/atomic generation | Implemented | Pending R2/Worker | lifecycle, volume, chaos tests |
| 4 Edge serving | Implemented | R2 exists; current Worker and secrets pending | Worker dry-run, route tests, `wrangler r2 bucket list`, and `wrangler secret list` |
| 5 Invalidation | Implemented | Pending migration/cron deploy | dirty trigger and lease contracts |
| 6 Search engines | Implemented | Google existing; new IndexNow path pending deploy | orchestrator and runtime contracts |
| 7 Dashboard | Implemented | Pending migration/function deploy | typed service and responsive route |
| 8 Hardening | Implemented locally | Sentry/live smoke pending | sanitizer, rate limit, incidents, CI |

## Technical Debt

- Retain only the last 3-5 immutable generations with an R2 lifecycle/reconciliation job; the current schema records history but does not yet prune artifacts automatically.
- The compiler claim limit of two stores per five-minute sweep is intentionally conservative. It needs queue-depth metrics before increasing.
- `social_image_id` currently stores an HTTPS image URL despite the historical column name. A future asset registry should resolve immutable asset IDs at the metadata boundary.
- Platform and custom-domain SEO head injection fails open to the base app shell when the metadata Edge Function is unavailable; monitoring must treat repeated `X-StoreBlink-SEO` absence as degradation.
- The compiler volume test takes seconds, not milliseconds, at 50,001 products. Small MVP catalogs can use the current scheduled Worker, but large catalogs require Workers Paid CPU or a chunked/background compiler before that volume is admitted.
- Google token key retirement is lazy. Operators must retain the previous key until both durable key-version queries report zero old rows and pre-rotation PKCE states have expired.

## Regression Risk

- High: deploying the new `storefront-seo` function before the Worker/R2 path is ready removes the old dynamic sitemap response. Use the checked deployment order.
- High: rotating `GOOGLE_TOKEN_ENCRYPTION_KEY` before deploying the version-aware readers makes existing merchant refresh and verification tokens unreadable. Deploy compatibility first, then rotate with the old key configured as previous.
- High: credentials previously stored in a repository example may be compromised even after the file is sanitized. Provider-side revocation is required.
- High: deploying the Worker without `DOMAIN_CRON_SECRET` prevents authenticated compiler and rollback calls.
- Medium: existing stores receive registry backfill and dirty state during migration, so the first compiler sweep can create a burst of claims.
- Medium: primary-domain changes intentionally invalidate every segment and change canonical origins.
- Low: HTML metadata injection is fail-open; storefront content remains available if SEO metadata lookup fails.

## Deployment Order

1. Rotate the exposed Cloudflare, Hostinger, and Google OAuth credentials in their provider consoles and configure the replacement values only in managed secret stores.
2. Apply migration `20260813000100`.
3. Synchronize a newly rotated `DOMAIN_CRON_SECRET` to Supabase Edge secrets, Supabase Vault, and the Worker.
4. Deploy `domain-orchestrator` while the existing Google encryption key remains active as version `1`.
5. Build, dry-run, and deploy the Worker, then deploy `storefront-seo`.
6. Smoke-test the real sitemap, metadata, collection 404, robots, and IndexNow key routes.
7. Rotate Google token encryption using current version `2` plus previous version `1`, verify durable key-version counts reach zero for version `1`, wait for PKCE expiry, and remove the previous key.
8. Verify one product change enters a new generation, the HTML canonical/head matches the registry, IndexNow has an audit row, Search Console still points to the root sitemap, and a controlled failure reaches Sentry.

## Verification Evidence

Verified from this checkout on 2026-08-13:

- Focused Google encryption and PostgreSQL migration suite: 4 files, 12 tests passed.
- Full post-hardening suite: 133 files, 494 tests passed.
- After the final Edge typing normalization, the affected integration suite: 6 files, 19 tests passed.
- `npx tsc --noEmit`: passed after encryption hardening.
- `npx deno check supabase/functions/domain-orchestrator/index.ts supabase/functions/storefront-seo/index.ts`: passed with real Deno module/type resolution.
- `npm run build`: passed; both Worker SSR and browser production bundles were regenerated.
- `npm run verify:public-bundle`: passed across 31 reachable browser chunks.
- `npx wrangler deploy --dry-run`: passed with R2, rate-limit, assets, and SEO endpoint bindings.
- `npx supabase db push --linked --dry-run`: passed and reports only `20260813000100` pending.
- `npm run verify:security-headers`: passed with 6 headers and 9 CSP directives.
- `npm run verify:production-audit`: passed with no production dependency vulnerabilities.
- `NODE_ENV=production npm run verify:supabase`: passed against the linked production Auth endpoint with an ephemeral process-only publishable key.
- Lint was intentionally not run per the project instruction for this phase.
- Cloudflare account authentication: passed; R2 bucket `storeblink-seo` exists.
- Live Worker deployment: last revision is dated 2026-08-12 and predates this implementation.
- Live Worker secrets: empty.
- Supabase migration list: exactly `20260813000100` is pending.
- Supabase functions: `domain-orchestrator` v13 and `storefront-seo` v7 are active but predate this implementation.
- Supabase server secrets include the existing Google and cron configuration, but do not yet include versioned Google rotation settings.
- Read-only production key inventory: 2 encrypted Google integrations and 2 encrypted site-verification tokens use v1; there are 0 active OAuth states. No token, account, or ciphertext value was read.
- Repository scan after sanitization: no known Google client-secret, Supabase secret-key/JWT, or Sentry credential signature found outside ignored dependency/build paths; `.env` is empty and `.env.example` contains placeholders.
- Production workflow YAML parses successfully with 16 steps and now fails closed unless provider credential rotation is explicitly attested and Sentry is configured.
- Fresh local Worker/Vite smoke: `/` and `/domain/connect/seo` return HTML 200 on the current checkout at port 8083. The pre-existing port 8082 process returns 404 and was not modified.

## Next Actions

1. Rotate every provider credential that appeared in the former `.env.example`; do not reuse those values in GitHub or Supabase.
2. Configure GitHub `production` secrets/variables, including `DOMAIN_CRON_SECRET`, `SENTRY_DSN`, `SEO_SMOKE_SITEMAP_URL`, and set `SEO_CREDENTIAL_ROTATION_CONFIRMED=true` only after provider-side revocation is complete.
3. Run the production workflow and record the deployed migration, function, Worker, and secret-binding revisions.
4. Complete the Google encryption-key rotation in `docs/GOOGLE-SEARCH-DEPLOYMENT.md` and prove version `1` durable rows are zero before removing the previous key.
5. Perform an authenticated merchant browser check of `/domain/connect/seo`, a real publish-to-sitemap sweep, and controlled Sentry acceptance event.
6. Add a dedicated staging store/hostname before calling the promotion pipeline fully production mature.

## Completion Decision

The phase remains partially complete. Local implementation, disposable PostgreSQL migration execution, R2 existence, and automated TypeScript tests are verified. Completion is not claimed until provider credentials are rotated, migration and current Edge Function/Worker revisions are deployed, required Worker secrets exist, Google ciphertext rotation is proven, and live sitemap plus Sentry acceptance checks pass.
