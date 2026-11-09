# Tagged Cache

## Purpose
Deduplicates concurrent storefront reads and caches bounded results with targeted invalidation.

## Owns
- In-memory cache entries, expiry, LRU order, in-flight requests, and tag indexes.

## Does NOT Own
- Database persistence, React state, or cache invalidation policy.

## Public API
```ts
get<T>(key: string): T | undefined
set<T>(key: string, value: T, options?: CacheEntryOptions): T
getOrLoad<T>(key: string, loader: () => Promise<T>, options?: CacheEntryOptions): Promise<T>
invalidateTag(tag: string): number
```

## Depends On
- No application system.

## Folder
`src/platform/caching/`

## State Ownership
The cache instance exclusively owns its entries and in-flight request map.

## Event Flow
Storefront resolver read -> cache hit or shared loader -> gateway -> tagged result. Realtime product changes invalidate only that store's catalog tag.

## Performance Notes
Entries are bounded and least-recently-used entries are evicted. Search responses use shorter TTLs than stable storefront metadata.

## Known Pitfalls / Anti-Patterns
- Do not cache mutable editor drafts.
- Do not clear the entire cache for one product or menu change.

## Extensibility
A distributed cache can implement the same tagged invalidation policy without changing callers.
