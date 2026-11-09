# Domain System

## Purpose

Own merchant domain claims, provider provisioning state, primary-domain policy, and domain-driven SEO workflow orchestration without exposing infrastructure credentials to merchant clients.

## Owns

- Normalized hostnames and cross-store uniqueness.
- Domain lifecycle, verification, SSL, primary-domain, and SEO provisioning state.
- Idempotent provider jobs and domain workflow events.
- Sanitized merchant-facing domain status.

## Does NOT Own

- Storefront document or theme content.
- Merchant identity, membership, or capability assignment.
- Provider credentials in browser state.
- DNS or certificate truth; provider responses remain authoritative.
- Search indexing guarantees.

## Public API

```ts
interface DomainSystemAPI {
  getDashboard(storeId: string): Promise<DomainDashboard>;
  connectExisting(storeId: string, hostname: string): Promise<DomainDashboard>;
  retryProvisioning(storeId: string, domainId: string): Promise<void>;
  setPrimary(storeId: string, domainId: string): Promise<void>;
  removeDomain(storeId: string, domainId: string): Promise<void>;
  searchDomains(storeId: string, query: DomainSearchQuery): Promise<DomainSearchResult[]>;
  purchaseDomain(storeId: string, quoteId: string): Promise<DomainDashboard>;
}
```

## Depends On

- Auth and Permission Systems for authenticated user, `domains.manage`, and AAL2 checks.
- Storefront Data Resolver and Publishing System for public store identity and indexable URLs.
- Supabase Postgres for tenant state, RLS, events, and durable jobs.
- Supabase Edge Functions for provider credential isolation and orchestration.
- Cloudflare Custom Hostnames for hostname and SSL state.
- Hostinger and Google APIs only when explicitly configured.

## Folder

`src/domains/`, `supabase/functions/domain-orchestrator/`, and the domain platform migration in `supabase/migrations/`.

## State Ownership

Postgres domain tables own persisted state. UI components read sanitized snapshots through `DomainService`; they never write domain tables or provider state directly.

## Event Flow

Merchant action -> authenticated Edge Function -> capability/AAL2 authorization -> normalized domain mutation -> domain event + idempotent job -> provider worker -> provider status persistence -> merchant polling and storefront host resolution.

## Performance Notes

- Provider calls never sit in storefront render paths.
- Dashboard polling is bounded and disabled when no work is pending.
- Job claims use `FOR UPDATE SKIP LOCKED`; retries use exponential backoff.
- Public host resolution returns a narrow payload and is independently cacheable.

## Known Pitfalls / Anti-Patterns

- Never trust browser-provided `storeId` without server authorization.
- Never mark DNS, SSL, transfer, sitemap, or indexing complete optimistically.
- Never persist an EPP code in plaintext or send provider credentials to a browser.
- Never accept a browser-provided registrar item ID or price; consume a short-lived server quote and recheck it before purchase.
- Never retry an ambiguous paid registrar request as a new purchase; reconcile by domain/order state first.
- Never let a theme own canonical, robots, sitemap, verification, or redirect infrastructure.
- Never remove path-based storefront routing until host routing is deployed and verified.

## Extensibility

Provider adapters are selected server-side. New registrars or certificate providers implement the same job/event contracts and do not change merchant UI or domain persistence semantics.
