# Editor Data Service

## Purpose

Provides the active editor with one platform boundary for authenticated profile loading, store item loading, slug repair, and migrated-theme persistence.

## Owns

- Editor-specific orchestration of profile and catalog data reads.
- Store slug repair coordination.
- Persisting successfully migrated Engine Scene themes.

## Does NOT Own

- React editor state.
- Scene Graph mutation.
- Publishing, recovery points, or public storefront reads.

## Public API

```ts
interface EditorStoreDataServiceAPI {
  load(user: User): Promise<EditorStoreLoadResult>;
  persistMigratedTheme(userId: string, theme: unknown): Promise<void>;
}
```

## Depends On

- Authenticated Supabase client.
- Profile creation and store-slug helpers.

## Folder

`src/platform/editor-data/`

## State Ownership

The service owns no long-lived domain store. It returns immutable load results to the editor and performs explicit persistence operations.

## Event Flow

Editor startup resolves the service from `EngineContext`, loads or provisions the merchant profile, repairs its slug when required, loads products, then hands data to Scene Graph migration/reconciliation. Migration persistence returns through this same boundary.

## Performance Notes

Startup queries are centralized so later caching, batching, and cancellation can be added without changing editor components.

## Known Pitfalls / Anti-Patterns

- Do not import Supabase directly into editor UI.
- Do not treat failed migration persistence as a successful durable migration.
- Do not route public storefront reads through this authenticated editor service.

## Extensibility

The implementation can be replaced by an API or RPC adapter while preserving the editor-facing contract.
