# Storefront Architecture Migration

## Diagnosis

The live editor already uses Scene Graph documents, shared element renderers, responsive overrides, draft/publish fields, and dynamic product bindings. The remaining persistence boundary still couples one merchant profile to store identity, presentation, pages, and public access.

Main production risks addressed by this migration:

- Public profile table access could expose draft JSON even when route code selected only published columns.
- Draft writes had no cross-tab optimistic concurrency.
- Publishing replaced one JSON column without an append-only publication record.
- Navigation destinations were stored as paths in legacy Scene nodes.
- Public catalog routes loaded all products and paginated in browser memory.
- Realtime product changes refetched the complete catalog.
- Theme metadata and feature support had no versioned registry or sequential migration contract.
- Eager route imports placed the editor and public storefront in the initial application bundle.

## Migration Strategy

1. Keep `profiles`, `items`, `theme_draft`, and `theme_published` as compatibility projections.
2. Backfill one `stores` row per existing profile, preserving the profile UUID as the initial store UUID.
3. Backfill portable pages, entity-referenced menus, a Basic theme installation, and the current home document.
4. Route public reads through narrow security-definer RPCs and revoke anonymous profile-table reads.
5. Serialize editor writes through revision-aware RPCs. Keep a serialized legacy fallback until the migration is deployed.
6. Append each publication to `storefront_publications`; never mutate a publication.
7. Resolve catalogs through server pagination, bounded cache entries, and store-specific invalidation.
8. Move future theme changes through the registry and migration system. Existing Scene Graph documents remain valid schema version 1 payloads.

## Performance And Scale

- All new tenant queries have a `store_id`-leading index.
- Catalog page size is capped at 60 and search/sort run in PostgreSQL.
- Concurrent identical route requests are deduplicated.
- Product realtime events invalidate only the affected store's catalog tag.
- Large publication work has a durable `storefront_publish_jobs` model for background workers.
- Product references remain IDs/dynamic bindings; product records are not copied into Scene Graph documents.
- Vite routes are lazy-loaded so the editor does not ship in the marketing or storefront entry chunk.

## Deployment

1. Back up the Supabase database.
2. Apply `20260727000100_storefront_draft_publish.sql` if it is not already applied.
3. Apply `20260727000200_storefront_domain_architecture.sql`.
4. Regenerate Supabase types from the deployed schema.
5. Verify a draft save, publish, public home, catalog pagination, and old `/product/:id` links.
6. Monitor revision conflicts and public RPC latency before removing compatibility fallbacks.

The migration is additive. Existing Scene Graph IDs, editor commands, profile IDs, old product URLs, and published storefront data remain compatible.
