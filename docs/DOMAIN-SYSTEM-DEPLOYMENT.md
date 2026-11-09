# Domain System Deployment Runbook

This runbook is the production boundary for the domain implementation. The browser must receive only the Supabase URL and publishable key. Cloudflare, Hostinger, service-role, cron, and future Google secrets remain server-side.

Current checkpoint (2026-08-10): both Edge functions and the one-minute Vault-backed worker are active. Production CORS and safe `false` registrar flags are installed. Provider credentials are intentionally absent until the exposed tokens are rotated; Cloudflare zone/fallback/CNAME readiness and the production arbitrary-host router remain blocking.

## 1. Verify Supabase Connectivity

As of 2026-08-10, the checkout, local Supabase link, and deployed database all target project `shflnrznleodviqphvfg`. Auth health is reachable and every local migration through `20260810000200` is applied remotely. Keep these browser values as one matching set whenever the project is changed:

```env
VITE_SUPABASE_PROJECT_ID=<project-ref>
VITE_SUPABASE_URL=https://<project-ref>.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=<publishable-key>
```

Verify before every migration or Edge deployment:

```powershell
npm run verify:supabase
```

Do not substitute credentials from an unrelated Supabase project. A successful Auth health check does not prove that Edge functions, provider secrets, DNS, or the worker schedule are configured.

## 2. Apply Database Migration

```powershell
npx supabase link --project-ref <project-ref>
npx supabase db push
```

The migration to inspect in the deployment diff is:

```text
supabase/migrations/20260809000100_domain_seo_platform.sql
```

Required post-migration checks:

- `store_domains.hostname` rejects duplicates across stores.
- Only one primary domain can exist per store.
- `anon` can execute only `resolve_public_storefront_by_domain` for this subsystem.
- `authenticated` can select only merchant-safe status tables.
- Provider payload, token ciphertext, OAuth state, queue, staff, credential, and audit tables remain inaccessible to merchant clients.
- Only `service_role` can execute claim, primary-domain, and worker mutation RPCs.

## 3. Configure Edge Secrets

Do not upload the repository root `.env` wholesale. It also contains browser values, may contain local-only origins, and must never be used to enable registrar transactions without acceptance testing. Create a dedicated, ignored server-secret file or set each value explicitly.

Set these as Supabase Edge Function secrets, never as `VITE_` variables:

```text
APP_ALLOWED_ORIGINS=https://storeblink.com,https://www.storeblink.com
CUSTOM_HOSTNAME_CNAME_TARGET=domains.storeblink.com
CLOUDFLARE_ZONE_ID=<cloudflare-saas-zone-id>
CLOUDFLARE_API_TOKEN=<scoped-cloudflare-token>
DOMAIN_CRON_SECRET=<long-random-secret>
HOSTINGER_API_TOKEN=<hostinger-token>
HOSTINGER_INCLUDED_DOMAIN_CLAIM_ENABLED=false
HOSTINGER_PAID_DOMAIN_PURCHASE_ENABLED=false
HOSTINGER_INCLUDED_TRANSFER_ENABLED=false
```

Use the real production dashboard origin without a trailing slash. If the dashboard remains on the apex during deployment, use `https://storeblink.com,https://www.storeblink.com`; do not configure `https://app.storeblink.com` until that hostname resolves.

Supabase supplies `SUPABASE_URL`, `SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY` to deployed functions. Keep all Hostinger feature flags false until the account entitlement and default payment method have been verified with a disposable transaction.

Paid registration uses Hostinger's current catalog and domain portfolio APIs. Search creates a server-side quote that expires after 15 minutes. Purchase requires AAL2 plus both `domains.manage` and `billing.manage`, consumes the quote atomically, rechecks availability and catalog price, and then queues the registrar call. Never enable `HOSTINGER_PAID_DOMAIN_PURCHASE_ENABLED` on an account whose default payment method is not approved for platform purchases.

The Cloudflare token must target the intended StoreBlink SaaS zone and include **Zone -> SSL and Certificates -> Edit** (`SSL and Certificates Write` in the API). Add Zone Read for deployment health checks. The runtime does not edit Cloudflare DNS, so DNS Edit is not required unless setup automation is added. Do not use a Cloudflare global API key or a token for an unrelated zone.

Hostinger domain search requires only `HOSTINGER_API_TOKEN`; it does not require any transaction flag. Keep the included-claim, paid-purchase, and included-transfer flags false until each workflow is verified against the actual account entitlement. Hostinger API tokens inherit the owning user's permissions, so store them only as Edge secrets and rotate any token copied into source or documentation.

Included transfers preserve the domain's current nameservers. StoreBlink must therefore wait for the merchant to add the displayed CNAME at the still-authoritative DNS provider; do not mark Hostinger DNS as configured or silently replace nameservers after transfer.

Google activation is a separate implementation phase, not an Edge-secret-only switch. It will require a Google Cloud OAuth web client (`GOOGLE_OAUTH_CLIENT_ID`, `GOOGLE_OAUTH_CLIENT_SECRET`, and an exact redirect URI), the Site Verification and Search Console APIs enabled, server-side refresh-token encryption/KMS, the required OAuth scopes, and a trusted per-host metadata injector or DNS verification path. Do not add these names to production until the corresponding server code and consent/security review exist.

## 4. Deploy Edge Functions

```powershell
npx supabase functions deploy domain-orchestrator --no-verify-jwt
npx supabase functions deploy storefront-seo --no-verify-jwt
```

`verify_jwt` is intentionally disabled at the gateway because:

- `domain-orchestrator` validates the bearer token, store capability, and AAL internally, and also has a constant-time cron-secret path.
- `storefront-seo` is a public GET/HEAD endpoint that resolves only active published storefronts through a narrow RPC.

## 5. Configure Cloudflare And Host Routing

Configure the Cloudflare for SaaS fallback origin and CNAME target represented by `CUSTOM_HOSTNAME_CNAME_TARGET`. The application proxy must:

- preserve the visitor `Host` header;
- serve the StoreBlink storefront SPA for arbitrary active custom hosts;
- route `/robots.txt` and `/sitemap.xml` to `storefront-seo` with the original host;
- return permanent redirects from non-primary domains to the primary domain;
- never route merchant dashboard or `/main-admin` traffic through a custom storefront host.

Before enabling the existing-domain capability, verify all of the following with read-only provider probes:

- the zone ID belongs to the intended StoreBlink SaaS zone;
- Custom Hostname list/create/delete calls are authorized;
- Cloudflare for SaaS is enabled and its fallback origin is active;
- the managed CNAME target resolves publicly;
- the origin accepts arbitrary customer hosts or the proxy rewrites origin host/SNI safely.

The existing-domain flow shows the merchant one CNAME. SSL must remain pending until Cloudflare itself returns an active certificate state.

## 6. Schedule Durable Jobs

This is required for reliable provisioning; request-triggered background batches are only a latency optimization. Migration `20260810000300_domain_worker_scheduler.sql` enables `pg_cron`/`pg_net`, schedules the one-minute worker, and reads its URL and authentication from Vault. Before relying on the schedule, create or rotate the Vault entries named `domain_orchestrator_worker_url` and `domain_cron_secret`; the cron secret must exactly match the Edge secret `DOMAIN_CRON_SECRET`.

Invoke the Edge worker at least once per minute:

```http
POST /functions/v1/domain-orchestrator
Content-Type: application/json
x-storeblink-cron-secret: <DOMAIN_CRON_SECRET>

{"action":"process-jobs","limit":25}
```

The worker claims rows with `FOR UPDATE SKIP LOCKED`, uses idempotency keys, applies exponential backoff, and moves exhausted work to `dead`. Alert on dead jobs and sustained SSL/transfer pending states.

## 7. Production Acceptance Checks

1. Run `npm run verify:supabase` and confirm success.
2. Sign up with a new email and complete the callback flow.
3. Enroll MFA, then open `/domain/connect`.
4. Connect a disposable existing domain and add exactly the displayed CNAME.
5. Confirm the dashboard remains pending until Cloudflare reports active hostname and SSL states.
6. Confirm the custom host loads the published storefront, product links stay on the custom host, and a secondary domain returns a 301 to the primary host.
7. Confirm `/robots.txt` references the primary-domain sitemap.
8. Confirm `/sitemap.xml` contains only published pages/products and changes after publish/unpublish events.
9. Confirm a merchant browser cannot read provider payload, OAuth token, queue, staff, credential, or audit tables.
10. With a disposable domain and an approved Hostinger account, enable paid purchase, confirm the displayed quote, and verify one registrar order, automatic DNS setup, Cloudflare SSL, and no duplicate charge after a worker retry.
11. Leave Google and `/main-admin` unavailable until their audit reports show live provider verification.

## 8. Rollback And Incident Handling

- Disable Hostinger feature flags before provider maintenance, billing uncertainty, or entitlement changes. Queued paid orders that have not reached Hostinger are cancelled; already-submitted orders continue reconciliation without a second purchase call.
- Disconnecting a domain queues Cloudflare hostname removal and preserves an audit trail in domain events/jobs.
- Do not mark a domain active manually while Cloudflare SSL is pending.
- Rotate a leaked provider secret in the provider console and Supabase secrets immediately; the current merchant UI never receives those values.
- Database rollback must preserve hostname ownership records long enough to prevent a different store from claiming a domain during an incident.
