# Runtime Link Resolver

## Purpose
Resolves entity-referenced menu destinations into safe storefront URLs at runtime.

## Owns
- Destination validation, current-handle resolution, broken-link state, and external-link safety metadata.

## Does NOT Own
- Page or product records, menu editing UI, redirects, or router state.

## Public API
```ts
resolveMenuTarget(target: MenuTarget, context: StorefrontLinkContext): ResolvedMenuLink
legacyNavigationTarget(value: unknown): MenuTarget | null
```

## Depends On
- Portable menu and linkable-entity types.

## Folder
`src/content/menus/`

## State Ownership
None.

## Event Flow
Menu item entity ID -> current entity handle -> store-scoped route. Missing or hidden entities become broken and hidden rather than dead public links.

## Performance Notes
Resolvers accept pre-batched maps so a menu never performs one query per item.

## Known Pitfalls / Anti-Patterns
- Internal menu items must not persist permanent URLs.
- Never render `javascript:` or unsupported external protocols.

## Extensibility
Locale and domain-aware route builders can be added through `StorefrontLinkContext`.
