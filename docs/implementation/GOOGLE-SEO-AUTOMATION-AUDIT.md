# Google Search and SEO Automation Audit

Date: 2026-08-12

## Phase Start Architecture Audit

### Implemented ✓

- Active custom domains resolve to published StoreBlink storefronts.
- `storefront-seo` generates domain-aware `robots.txt` and `sitemap.xml` payloads.
- Store, page, product, domain, Google integration, verification, Search Console,
  sitemap, metrics, event, and durable-job schemas already exist.
- Domain jobs are claimed with `FOR UPDATE SKIP LOCKED`, retried with backoff,
  and run independently through the Supabase cron worker.
- Merchant domain operations are authenticated, store-scoped, capability-checked,
  and AAL2-gated for sensitive mutations.

### Missing ✗

- Google OAuth authorization, callback exchange, refresh-token rotation, revocation,
  and encrypted token persistence.
- PKCE-bound, single-use OAuth state.
- Google Site Verification token creation and ownership verification.
- Server-rendered Google verification metadata on each active storefront hostname.
- Search Console property creation, sitemap submission/status refresh, Search
  Analytics synchronization, and URL Inspection synchronization.
- Production Worker routing for dynamic SEO resources and storefront head injection.
- Merchant connect, retry, disconnect, and OAuth callback controls.
- Focused contracts for token secrecy, OAuth state, job wiring, and Worker behavior.

### Partially Implemented △

- Google database tables and job names exist, but no provider code consumes them.
- The Google dashboard projects persisted status, but the capability is hard-disabled
  and the page provides no executable action.
- Sitemap refresh jobs only set `seo_status = 'sitemap_ready'`; they do not notify
  Search Console.
- Canonical and description tags are updated by React after hydration, while trusted
  verification and crawler-first metadata require an edge response transformation.
- The Cloudflare deployment serves the SPA, but has no Worker entry point for SEO
  proxying or HTML metadata injection.

### Technical Debt

- `domain-orchestrator/index.ts` is already large; Google provider behavior must live
  behind a dedicated shared module and expose only narrow actions/job handlers.
- Generated browser database types predate the domain/SEO migrations. Runtime Edge
  code currently uses an unparameterized service client, so schema drift is detected
  through migrations and contract tests rather than generated Edge types.
- The generic job queue has no scheduled-at argument in its local helper even though
  the table supports `run_after`.

### Regression Risk

- High: OAuth token storage and callback state handling.
- High: Worker-first routing can break static assets or SPA navigation if passthrough
  behavior is incorrect.
- Medium: Google retries can duplicate external operations unless all job handlers are
  idempotent.
- Medium: Hostname/canonical mistakes can verify or submit the wrong property.
- Low: Google dashboard UI changes are isolated to `/domain/connect/google`.

### Next Actions

1. Add the encrypted OAuth/PKCE and URL-inspection persistence contract.
2. Implement a dedicated Google provider client and orchestrator actions.
3. Wire all declared Google durable jobs with idempotent database transitions.
4. Add Worker SEO proxying and trusted HTML head injection.
5. Replace the status-only Google page with connect/retry/disconnect workflow UI.
6. Verify migration, Edge, Worker, browser, typecheck, tests, and production build.

## Phase End Architecture Audit

### Implemented ✓

- Added production OAuth authorization-code flow with PKCE, single-use hashed state,
  authenticated store binding, offline access, refresh-token rotation, revocation,
  and AES-256-GCM encrypted server-side token persistence.
- Added Google Site Verification, Search Console URL-prefix property creation,
  sitemap submission/status refresh, Search Analytics synchronization, and bounded
  URL Inspection synchronization behind a dedicated provider/workflow boundary.
- Added idempotent durable handlers for `google-site-verify`,
  `google-property-create`, `sitemap-submit`, `search-console-sync`, and
  `url-inspection-sync`, including retry/backoff and reconnect behavior.
- Added the tenant-protected `url_inspection_results` projection and a daily
  monitoring enqueue function scheduled through `pg_cron`.
- Fixed content-triggered sitemap refresh so it resolves the active primary domain
  even when the originating job has no `domain_id`.
- Added trusted `head`, `robots`, and `sitemap` projections to `storefront-seo`,
  including canonical metadata, Open Graph/Twitter metadata, Organization/Product
  JSON-LD, Google verification metadata, and published-store/domain enforcement.
- Added a Cloudflare Worker entry that proxies dynamic SEO resources and injects
  trusted storefront metadata while preserving static assets and SPA routing.
- Added merchant Connect Google, retry, disconnect, callback, provisioning status,
  Search Analytics, and URL Inspection UI through the existing domain service.
- Added deployment and system documentation plus focused OAuth, UI, migration,
  Worker, provider-wiring, and security contract tests.
- Applied migration `20260812000100` to the linked production database and deployed
  active `domain-orchestrator` version 9 and `storefront-seo` version 5.

### Missing ✗

- No authenticated merchant has completed the production Google consent flow yet,
  so external Site Verification/Search Console acceptance is not verified.

### Partially Implemented △

- The production Google credentials, Worker, and metadata-injection capability are
  live. Provider acceptance remains pending until a merchant completes the one-time
  authenticated Google consent flow.
- StoreBlink automates ownership, property creation, sitemap submission, metrics,
  and inspection after one merchant OAuth consent. Google does not provide a valid
  supported path for StoreBlink to bypass that account consent.

### Technical Debt

- Storefront body markup remains client-rendered. The Worker supplies crawler-first
  head metadata, but full HTML body SSR/prerendering is a separate architecture
  project and was not introduced in this phase.
- Browser database types predate the latest domain/SEO migration; Edge runtime
  contracts are currently guarded by migration and source-level contract tests.
- URL Inspection is intentionally capped per synchronization run to control Google
  quota. It reports index state and cannot request indexing for ordinary ecommerce
  pages.
- The repository retains 25 non-blocking ESLint warnings in unrelated Fast Refresh
  exports and three pre-existing hook dependency warnings.

### Regression Risk

- High until activation: an incorrectly configured Google OAuth application or an
  unpublished Worker prevents automatic ownership verification.
- Medium: Google quota, consent-screen review, or provider outages can delay jobs;
  durable retries expose failures without fabricating successful state.
- Medium: Worker routing is production-sensitive, but unit contracts, dry-run
  packaging, static passthrough, and fail-closed SEO resource behavior are present.
- Low: Existing editor, auth, domain, storefront, and theme behavior passed the full
  automated regression suite.

### Verification

- `npm run test`: passed, 114 files and 414 tests.
- `npx tsc --noEmit`: passed.
- `npm run build`: passed; 2,356 client modules transformed and Worker bundle built.
- `npm run lint`: passed with 0 errors and 25 existing warnings.
- `npm run verify:domain-providers`: passed; registrar transaction flags remain off.
- `npm run verify:production-audit`: passed with no production dependency
  vulnerabilities.
- `npm run verify:supabase`: passed against the linked project.
- Production CORS preflight: `204`, exact origin `https://storeblink.com`.
- Unauthenticated Google connect request: rejected with `401 AUTH_REQUIRED`.
- Direct production `storefront-seo` checks for `buy.skieshare.com`: `head`, `robots`,
  and `sitemap` each returned `200` with the expected resource type.
- Worker package dry run: passed with `ASSETS` and `STOREFRONT_SEO_ENDPOINT` bindings.
- Worker live acceptance: passed for HTML head injection, canonical metadata,
  structured data, StoreBlink robots rules, and XML sitemap delivery.
- Google metadata-injection capability: enabled in production and the orchestrator
  redeployed with the current Edge environment.

### Next Actions

1. Complete one authenticated merchant Connect Google flow and verify ownership,
   property creation, sitemap submission, metrics, and inspection records end to end.

## OAuth Consent Failure Fix - Phase Start Audit

### Implemented ✓

- The production callback securely exchanges an authorization code and validates the
  scopes returned by Google before persisting any refresh token.
- Failed OAuth state is single-use, so replaying the callback cannot reuse its code.

### Missing ✗

- Equivalent Google identity scope forms such as `email` and
  `https://www.googleapis.com/auth/userinfo.email` are not normalized.
- The callback error does not identify which required permission was omitted.
- A partially authorized token is not explicitly revoked before rejecting the flow.

### Partially Implemented △

- Granular permissions are checked, but the authorization request and StoreBlink UI
  do not explicitly prepare merchants for Google's separate permission checklist.

### Technical Debt

- Scope validation is embedded directly in the workflow instead of exposed as a
  deterministic, independently tested provider rule.

### Regression Risk

- High: accepting an insufficient Search Console or Site Verification grant would
  fail later during provisioning.
- Medium: rejecting a valid alias form creates a false permission failure.

### Next Actions

1. Normalize equivalent identity scopes while retaining strict checks for both Google
   Search permissions.
2. Revoke partial grants and return actionable missing-permission labels.
3. Add explicit granular-consent signaling, UI guidance, and focused tests.
4. Deploy and repeat the authenticated production consent flow.

## OAuth Consent Failure Fix - Phase End Audit

### Implemented ✓

- Confirmed the callback reached the successful code-exchange path and failed only
  during granted-scope validation.
- Added deterministic normalization for Google's `email` and
  `https://www.googleapis.com/auth/userinfo.email` equivalent scope forms.
- Kept Site Verification and Search Console permissions strictly mandatory.
- Added `enable_granular_consent=true` to the authorization request.
- Missing grants now identify the exact permission and instruct the merchant to
  reconnect and select every requested permission.
- Added pre-consent merchant guidance and focused alias, denial, and UI tests.
- Deployed the corrected provider and workflow to the production
  `domain-orchestrator` Edge Function.

### Missing ✗

- The merchant must repeat the production consent once because the failed callback's
  authorization code and PKCE state were correctly consumed and cannot be replayed.

### Partially Implemented △

- The UI guidance is included in the verified production build artifact; publishing
  that client artifact depends on the separate Cloudflare deployment credential.
  The server-side correction is already live and does not depend on that UI text.

### Technical Debt

- Google does not expose selective revocation for one omitted scope. Revoking a
  partial combined grant would revoke all project scopes and could disconnect another
  store, so rejected credentials are not persisted and are left to expire instead.

### Regression Risk

- Low: scope matching is isolated and covered by exact, alias, and missing-grant tests.
- Low: no token, state, persistence, or Search provisioning contract was weakened.

### Verification

- Focused OAuth/UI suite: 4 files and 11 tests passed before the final UI assertion.
- Google Search page suite: 2 tests passed, including disconnected consent guidance.
- `npx tsc --noEmit`: passed.
- `npm run lint`: passed with zero errors and 25 pre-existing warnings.
- `npm run build`: passed with 2,356 client modules transformed.
- Production `domain-orchestrator`: corrected source deployed successfully.

### Next Actions

1. Return to Google Search and start a new connection.
2. On Google's granular permission screen, keep both Site Verification and Search
   Console selected, then approve the request.
3. Verify the resulting ownership, property, sitemap, and monitoring states.

## Google Verifier Crawler Fix - Architecture Audit

### Implemented ✓

- OAuth is connected with all five required scopes and the encrypted refresh token is
  active.
- The Site Verification token is generated, encrypted at rest, and exposed through
  the trusted Worker only for the active storefront hostname.
- Updated Worker document detection so extensionless storefront routes receive SEO
  metadata even when a crawler sends neither `Accept: text/html` nor
  `Sec-Fetch-Dest: document`.
- File-like static assets continue to bypass SEO provider calls.
- Added focused crawler-without-browser-headers and static-asset regression tests.

### Missing ✗

- None within the implemented Google connection and provisioning scope.

### Partially Implemented △

- Google has discovered the initial storefront URLs but has not indexed them yet.
  Crawl and indexing timing remains owned by Google and is monitored without
  fabricating success.

### Technical Debt

- The local repository token is intentionally scoped for Custom Hostnames and cannot
  deploy Workers. Worker publication currently requires a separate operator token.
- The local `DOMAIN_CRON_SECRET` does not match the active production scheduler
  credential; production cron remains healthy and must not be overwritten casually.

### Regression Risk

- Low: the fix is limited to extensionless GET storefront paths.
- Low: file extensions up to 12 characters still bypass metadata lookup, preserving
  asset latency and response bodies.

### Verification

- Production after fix: browser-style and header-less crawler requests both return
  `X-StoreBlink-SEO: edge`, the same 43-character verification token, and the correct
  canonical URL.
- Database: integration `connected`, ownership `verified`, Search Console property
  `active` with `siteOwner`, and sitemap `submitted`.
- Google jobs: site verification, property creation, sitemap submission, Search
  Analytics sync, and URL Inspection sync all completed.
- URL Inspection: three storefront URLs discovered; current provider coverage is
  `Discovered - currently not indexed`, with no false indexed claim.
- Worker test suite: 4 tests passed.
- Production build: passed with 2,356 client modules transformed.

### Next Actions

1. Allow Google to crawl the submitted sitemap and monitor URL Inspection/Search
   Analytics through the scheduled synchronization jobs.
