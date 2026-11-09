# Domain System Architecture Audit

Date: 2026-08-10  
Scope: signup transport diagnosis plus StoreBlink domain, DNS, SSL, registrar, host-routing, and SEO foundations.  
Status: Core merchant domain platform, Edge functions, and durable scheduler deployed. Live Cloudflare/registrar acceptance and the Google phase remain incomplete.

## Start Of Phase

### Implemented ✓

- Supabase Auth already had a centralized service boundary and merchant capability model.
- Storefront publishing, pages, redirects, product handles, and path-based public routes already existed.
- Sensitive merchant routes could require `domains.manage` and AAL2.

### Missing ✗

- Signup transport failures leaked `TypeError: Failed to fetch` and had no deployment preflight.
- No custom-domain ownership model, globally unique hostname claim, provider workflow, SSL state, merchant domain UI, host resolver, sitemap endpoint, or robots endpoint existed.
- No active Supabase deployment was reachable from the configured project URL.

### Partially Implemented △

- Storefront data was store-scoped, but only path-slug routing existed.
- Redirect and publishing foundations existed without primary-domain canonicalization.

### Technical Debt

- Deployment configuration was checked for syntax but not DNS or Auth health.
- Long-running provider work had no durable retry/dead-letter contract.

### Regression Risk

- Domain routing had to preserve every existing `/store/:slug` URL.
- Auth error normalization had to preserve local validation and existing Supabase error mappings.

### Verification Evidence

- The configured Supabase hostname did not resolve.
- Repository inspection found no `store_domains` model or custom-hostname orchestrator.

### Next Actions

- Add transport-safe Auth handling and a deterministic Supabase health preflight.
- Implement an additive tenant-safe domain schema and merchant connection flow.
- Add server-only Cloudflare/Hostinger clients, durable jobs, host routing, canonical metadata, sitemap, and robots output.

## End Of Phase

### Implemented ✓

- `AuthService` normalizes thrown network failures for signup, sign-in, password, sign-out, and MFA operations.
- The Auth page preserves form-validation messages and displays an accessible persistent error rather than a raw fetch exception.
- `npm run verify:supabase` validates project-ref consistency, DNS, and Auth health before deployment.
- The migration defines normalized globally unique domains, one primary domain per store, sanitized merchant reads, service-only provider/token/job tables, AAL2 authorization, public host resolution, event capture, and a locked retry/dead-letter queue.
- The Edge orchestrator supports tenant status, existing-domain claims, primary-domain changes, retry/disconnect, Hostinger availability, included registration, paid registration, included transfers, automatic DNS, Cloudflare Custom Hostnames, SSL polling, and durable jobs.
- Paid registration uses short-lived server-side quotes, atomic quote consumption, AAL2 plus `domains.manage` and `billing.manage`, server-side availability/price rechecks, and ambiguity-safe reconciliation that never blindly repeats a charge.
- The merchant UI provides responsive overview, existing-domain, search/purchase, transfer, Google status, and live provisioning routes under `/domain/connect/*`.
- Active custom hosts resolve through a narrow anonymous RPC. Non-primary hosts redirect to the primary host while legacy `/store/:slug` routes remain available.
- Custom storefront hosts expose only storefront routes. Platform Auth, dashboard, and domain administration are excluded as defense in depth.
- Storefront links, canonical metadata, dynamic `robots.txt`, and dynamic `sitemap.xml` are domain-aware.
- Authenticated grants are revoked from quote internals, provider payload, token ciphertext, OAuth state, events, queues, staff credentials, and audit tables.

### Missing ✗

- Rotated Hostinger and correctly scoped StoreBlink Cloudflare credentials are not installed. The exposed local provider tokens must not be promoted to production.
- Google OAuth, encrypted token use, Site Verification, Search Console property creation, sitemap submission, metrics sync, and URL inspection are not implemented.
- Production arbitrary-host proxy routing and trusted per-host metadata injection are not configured in this checkout.

### Partially Implemented △

- Cloudflare and Hostinger workflows are production-shaped and server-only, but have not passed disposable-domain acceptance.
- Paid Hostinger purchase matches the current official API contract and defaults off; payment, tax, WHOIS, and account entitlement still require a disposable live acceptance transaction.
- The SEO endpoint is deployed, but arbitrary-host `/robots.txt` and `/sitemap.xml` routing still requires production proxy configuration.
- Platform credential and audit tables exist as foundations; no KMS-backed vault service or staff surface uses them yet.
- Storefront metadata is client-managed. Trusted Google META verification still requires production edge/head injection.

### Technical Debt

- `domain-orchestrator/index.ts` should be split into action and job modules when Google is added; it remains centralized to avoid an unrelated migration rewrite.
- Provider clients need recorded contract fixtures and live sandbox/disposable-domain tests.
- Polling is implemented; signed provider webhooks are not.
- Included-domain claims still need a durable reconciliation path before that entitlement can be enabled broadly.

### Regression Risk

- Custom-host routing depends on the production proxy preserving the original `Host` header.
- Applying the migration out of order fails because it depends on existing store, membership, item, page, collection, and redirect migrations.
- Enabling any Hostinger feature flag without verified account entitlement can create provider failures or charges. All flags default to false.
- A paid purchase that times out after request submission deliberately stops for reconciliation rather than risking a duplicate registrar charge.

### Verification Evidence

- `npm run test -- --maxWorkers=1 --reporter=dot`: 99 files, 375 tests passed.
- `npx tsc --noEmit`: passed.
- `npm run build`: passed; 2,348 modules transformed.
- `npm run lint`: passed with zero errors and 25 pre-existing warnings; focused ESLint across Auth, domain, host-routing, SEO, App routes, and the browser regression had zero findings.
- `npx deno check` for `domain-orchestrator` and `storefront-seo`: passed.
- `npx playwright test tests/e2e/auth-platform.spec.ts`: 5 passed, 1 skipped because staging credentials are not configured.
- Browser coverage confirms signup network failure is sanitized, platform routes are protected, and custom hosts cannot render platform Auth.
- `npm run verify:supabase`: passes against `shflnrznleodviqphvfg.supabase.co`.
- All migrations through `20260810000300_domain_worker_scheduler.sql` are applied remotely.
- `domain-orchestrator` version 3 and `storefront-seo` version 1 are active.
- Production CORS preflight returns HTTP 204 with `Access-Control-Allow-Origin: https://storeblink.com`; an untrusted origin receives no allow-origin header.
- The Vault-backed one-minute worker is active, and manual plus scheduled `pg_net` invocations returned HTTP 200.
- `npm run verify:domain-providers` passes Hostinger search/catalog checks but correctly fails the wrong Cloudflare zone, missing Custom Hostnames permission/fallback access, and NXDOMAIN managed CNAME target.

### Next Actions

1. Rotate the exposed Hostinger token and create a StoreBlink-zone Cloudflare token with SSL and Certificates Edit.
2. Configure Cloudflare for SaaS, activate the fallback origin, publish the managed CNAME target, then rerun `npm run verify:domain-providers`.
3. Install only the rotated provider secrets; keep all registrar transaction flags false while exercising existing-domain, paid-registration, and transfer flows with disposable domains.
4. Deploy the arbitrary-host proxy/metadata injector.
5. Implement Google OAuth/Search Console as a separate security-sensitive phase. Do not expose its capability before live acceptance passes.
