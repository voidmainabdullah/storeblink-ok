# Google Search System

## Purpose

Automates storefront ownership verification, Search Console provisioning,
sitemap submission, search analytics, and URL index-status monitoring after one
merchant Google OAuth consent.

## Owns

- Google OAuth state and encrypted refresh-token lifecycle.
- Per-domain Google verification, property, sitemap, metrics, and inspection state.
- Google provider jobs and their retry-safe state transitions.
- Trusted storefront verification metadata and crawler-facing SEO head projection.

## Does NOT Own

- Domain DNS or SSL provisioning.
- Storefront document content or theme rendering.
- Store page/product publication decisions.
- Google ranking decisions or general-purpose indexing requests.

## Public API

```ts
type GoogleSearchActions =
  | "google-connect"
  | "google-oauth-callback"
  | "google-retry"
  | "google-disconnect";

type GoogleSearchJobs =
  | "google-site-verify"
  | "google-property-create"
  | "sitemap-submit"
  | "search-console-sync"
  | "url-inspection-sync";
```

Browser actions are exposed only through `DomainService` and the existing
`domain-orchestrator` Edge boundary. Provider credentials are never browser APIs.

## Depends On

- Domain authorization and active-primary-domain state.
- Domain durable job queue and Supabase cron worker.
- Google OAuth 2.0, Site Verification API, and Search Console API.
- `storefront-seo` for safe host resolution and head metadata.
- Cloudflare Worker static-assets binding for response transformation.

## Folder

- `supabase/functions/_shared/domain/google.ts`
- `supabase/functions/domain-orchestrator/google-workflow.ts`
- `supabase/functions/storefront-seo/index.ts`
- `worker/index.ts`
- `src/pages/domain/GoogleSearchPage.tsx`

## State Ownership

Provider workflow state is server-owned in `google_integrations`,
`google_oauth_states`, `google_site_verifications`,
`search_console_properties`, `sitemap_submissions`, `search_console_metrics`,
and `url_inspection_results`. Merchant UI receives only sanitized projections
from the orchestrator dashboard.

## Event Flow

```text
Merchant Connect
  -> AAL2 authorization
  -> PKCE + single-use OAuth state
  -> Google consent and callback
  -> encrypted refresh token
  -> google-site-verify job
  -> trusted Worker META injection
  -> Google ownership verification
  -> Search Console property
  -> sitemap submission
  -> analytics and URL inspection monitoring
```

Store page/product publication already emits `sitemap-refresh`; when a connected
property exists, that job queues a new idempotent sitemap submission.

## Performance Notes

- Provider work never blocks storefront rendering or requires an open browser.
- Search Analytics runs daily and URL Inspection is capped per domain/job.
- Worker head data is fetched only for custom-host HTML navigations.
- Static assets and non-HTML requests pass directly through the assets binding.

## Known Pitfalls / Anti-Patterns

- Do not expose client secrets, refresh tokens, encryption keys, or OAuth state as
  `VITE_*` variables.
- Do not remove the verification META token after initial verification; Google can
  periodically check ownership again.
- Do not use Google's Indexing API for normal store/product pages. It is restricted
  to supported job-posting and livestream content.
- Do not mark a URL indexed from sitemap submission. URL Inspection is read-only and
  Google owns crawl/index timing.
- Do not activate the capability before Worker metadata injection is deployed.

## Extensibility

Additional Search Console dimensions or bounded inspection policies can be added as
new durable jobs. They must reuse encrypted account authorization and write only
sanitized, store-scoped projections.
