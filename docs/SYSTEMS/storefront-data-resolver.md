# Storefront Data Resolver

## Purpose
Provides the public storefront with narrow, paginated, cacheable store and catalog reads.

## Owns
- Query normalization, page-size limits, cache keys, and invalidation tags.

## Does NOT Own
- Product mutation, theme editing, Scene Graph state, or public UI rendering.

## Public API
```ts
getStore(slug: string): Promise<StorefrontProfile | null>
getCatalog(request: CatalogRequest): Promise<CatalogPage>
getProduct(storeId: string, idOrHandle: string): Promise<StorefrontProduct | null>
invalidateStore(slug: string): void
invalidateCatalog(storeId: string): void
```

## Depends On
- Tagged Cache
- Storefront Data Gateway

## Folder
`src/storefront/data-resolvers/`

## State Ownership
The resolver owns no durable state. Its cache owns temporary public read results.

## Event Flow
Route -> resolver -> narrow public RPC -> immutable published theme and paginated products -> shared renderer. Realtime events invalidate store-specific catalog entries.

## Performance Notes
Catalog page size is capped at 60. Concurrent identical reads share one promise. Public RPCs use store-leading indexes and return only published data.

## Known Pitfalls / Anti-Patterns
- Do not fetch a store's complete catalog into browser memory.
- Do not query `profiles.theme_draft` from public routes.
- Do not refetch all tenants after one store changes.

## Extensibility
The gateway can move from Supabase RPCs to an edge cache or server renderer without changing route components.
