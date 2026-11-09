# SEO and Sitemap System

## Purpose

Maintain one tenant-scoped SEO resource registry, compile immutable sitemap generations, and serve validated sitemap artifacts and HTML head metadata from the same metadata records.

## Owns

- SEO resource and metadata records.
- Sitemap dirty state, compile leases, generations, segments, and active pointer.
- Sitemap XML validation and immutable R2 artifact keys.
- IndexNow keys and submission batches.
- Merchant SEO dashboard projections and sitemap rollback coordination.

## Does NOT Own

- Store content, product inventory, page bodies, or published theme documents.
- Domain provisioning and SSL state.
- Google OAuth identity or Search Console property ownership.
- Public storefront rendering beyond SEO head injection and SEO file routes.

## Public API

```ts
interface SeoSitemapSystem {
  evaluate(resource: SeoCompileResource, context: EligibilityContext): SitemapEligibilityResult;
  compile(snapshot: SeoCompileSnapshot, storagePrefix: string): CompiledSitemapGeneration;
  compileValidateAndActivate(input: GenerationInput): Promise<CompiledSitemapGeneration>;
  requestRegeneration(storeId: string): Promise<void>;
  rollback(storeId: string, generationId: string): Promise<void>;
  getDashboard(storeId: string): Promise<SeoDashboard>;
}
```

The browser reaches this API through `SeoDashboardService`, which invokes authenticated `domain-orchestrator` actions. The compiler reaches service-role actions through the signed `DOMAIN_CRON_SECRET` channel.

## Depends On

- Existing Supabase Postgres store, page, product, collection, redirect, domain, and capability tables.
- Existing `domain-orchestrator` per-merchant Google Search Console integration.
- Versioned server-only AES-GCM key material for Google refresh, PKCE, and site-verification secrets.
- Cloudflare Worker Cron Trigger, R2 binding, rate-limit binding, and native logs.
- Optional Sentry Cloudflare SDK when `SENTRY_DSN` is configured.

## Folder

`src/seo/`, `worker/seo-runtime.ts`, `worker/index.ts`, `supabase/functions/storefront-seo/`, and `supabase/functions/domain-orchestrator/`.

## State Ownership

- Postgres owns registry, metadata, dirty state, generation status, rollback history, and submission audit state.
- R2 owns immutable compiled XML and route-manifest objects.
- The R2 route manifest and Postgres active pointer switch as one compensated operation. A failed database commit restores the previous route manifest.
- React owns only dashboard interaction state; it does not write SEO tables directly.

## Event Flow

```text
Published content or SEO mutation
  -> Postgres adapter trigger
  -> sitemap_store_state dirty flag and version increment
  -> five-minute Worker cron sweep
  -> service-authenticated compile claim
  -> immutable snapshot bound to its dirty-state version
  -> eligibility + canonical resolution
  -> segment at 25,000 URLs
  -> validate XML, domains, duplicates, limits, and child references
  -> write generation to R2
  -> switch R2 route manifest
  -> atomically activate Postgres generation
  -> submit changed eligible URLs to IndexNow
```

Public requests read only active artifacts. A missing manifest returns retryable `503`; there is no dynamic XML fallback and no partial generation can become public.

HTML requests on custom domains and `/store/:handle` call `storefront-seo` for a safe projection from the same `seo_resources` and `seo_metadata` rows used by compilation. The Worker injects title, description, robots, canonical, social tags, hreflang, verification, and JSON-LD before returning HTML.

Published collection registry routes resolve through `/collections/:handle` on both platform and custom-domain storefronts. The public collection catalog RPC enforces published store, collection, and product state; missing routes retain the app shell for rendering but return HTTP 404 with `noindex` metadata at the edge.

Google ciphertext carries a key version in its envelope. During rotation, readers accept
only the configured current and previous versions. Refresh-token use and storefront
verification metadata reads re-encrypt old envelopes with the current key. Operators
remove the previous key only after durable key-version counts reach zero and temporary
OAuth state has expired.

## Performance Notes

- Content mutations only mark dirty; they do not compile synchronously.
- Cron claims at most two stores per sweep to constrain Worker CPU and subrequests.
- Sitemap segments use a 25,000 URL internal limit, below Google's 50,000 URL and 50 MB hard limits.
- Immutable generation objects use long cache headers. Only small route manifests change during activation.
- Dashboard reads one JSON projection RPC rather than issuing per-resource browser queries.
- The volume test compiles 50,001 products into three segments.
- The 50,001-product volume case takes seconds on development hardware and is not compatible with the Workers Free 10 ms CPU ceiling. Keep the free runtime to small MVP catalogs; move compilation to Workers Paid or a resumable background compiler before admitting large catalogs.

## Known Pitfalls / Anti-Patterns

- Never write sitemap files in place or dynamically generate them on a crawler request.
- Never duplicate SEO title, description, canonical, or indexability into a second source.
- Never use the Google Indexing API for ordinary product or content URLs.
- Never submit child sitemap segments individually to Search Console; submit the root index.
- Never accept raw merchant HTML for custom meta tags.
- Never mutate the active R2 route manifest without compensation around the database commit.
- Never activate a generation older than the currently active generation, and never clear dirty state for edits newer than the generation snapshot.
- Never enqueue sitemap compilation from the dirty-marking function. The cron claim over versioned dirty state is the single compilation trigger; re-enqueueing from that path creates an unbounded loop.
- Never replace the Google encryption key in place. Deploy dual-key readers first, retain the old key as the explicitly versioned previous key, prove re-encryption, then retire it.
- Never treat sanitized example files as credential revocation; exposed provider values must be rotated at the provider.
- A Worker deployment generated by Vite must be rebuilt before Wrangler deployment; otherwise stale generated configuration can omit bindings.

## Extensibility

- New resource types register through `SeoResourceRegistry` and a content adapter without changing compiler orchestration.
- Blogs are already represented by schema, segment, and validation contracts and can be activated when the content source exists.
- An optional KV namespace can replace R2 route-manifest objects without changing the compiler or public route contract.
- Future AI discovery files can reuse immutable generation and edge serving, but agent checkout protocols remain outside this system.

## Operations and Limits

Limits verified 2026-08-13:

| Service | Current allowance used by this design | Upgrade trigger |
|---|---|---|
| Cloudflare R2 Standard | 10 GB-month, 1M Class A and 10M Class B operations monthly, free egress | Artifact storage or reads exceed the included monthly amounts |
| Cloudflare Workers Free | 100,000 requests/day, 10 ms CPU per HTTP or sub-hour cron invocation, 50 external subrequests | Aggregate storefront Worker traffic or compiler CPU reaches the account limit; move to Workers Paid |
| Supabase Free | 500 MB database, 500,000 Edge Function invocations/month, 5 GB uncached plus 5 GB cached egress | Production database or function usage approaches 80 percent; move the existing project to Pro rather than adding a second datastore |
| Search Console API | Other resources: 20 QPS and 200 QPM per user | Back off and spread status synchronization when a merchant reaches quota |
| IndexNow | 10,000 URLs per POST | Existing batching already splits larger generations |
| Sentry Developer | 5,000 errors/month, one user | Filter repetitive failures or move to Team/self-hosted GlitchTip |

Primary references: [Cloudflare R2 pricing](https://developers.cloudflare.com/r2/pricing/), [Cloudflare Workers limits](https://developers.cloudflare.com/workers/platform/limits/), [Supabase pricing](https://supabase.com/pricing), [Search Console API limits](https://developers.google.com/webmaster-tools/limits), [IndexNow documentation](https://www.indexnow.org/documentation), [Sentry pricing](https://sentry.io/pricing/), and [Google sitemap limits](https://developers.google.com/search/docs/crawling-indexing/sitemaps/build-sitemap).
