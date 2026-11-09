# Theme Registry And Migrations

## Purpose
Centralizes versioned theme manifests, capabilities, templates, and deterministic schema migrations.

## Owns
- Registered in-process manifests and migration steps.

## Does NOT Own
- Theme installation persistence, editor Scene Graph data, or feature UI.

## Public API
```ts
ThemeRegistry.register(manifest)
ThemeRegistry.resolveFeature(themeId, featureId)
ThemeMigrationSystem.register(migration)
ThemeMigrationSystem.plan(themeId, fromVersion, toVersion)
ThemeMigrationSystem.migrate(document, targetVersion)
```

## Depends On
- No editor system.

## Folder
`src/themes/registry/`, `src/themes/migrations/`

## State Ownership
Registry instances own immutable defensive copies of manifests and migration definitions.

## Event Flow
Installed theme version -> migration plan -> cloned backup -> sequential migration -> validation -> draft preview. Migration never publishes automatically.

## Performance Notes
Migration plans are indexed by theme and source schema version. Large persisted migrations should run through publish jobs in batches.

## Known Pitfalls / Anti-Patterns
- Never branch randomly on a theme ID in storefront components.
- Never skip intermediate schema versions.
- Never mutate the input document or delete unsupported content.

## Extensibility
Theme packages register manifests and migration definitions without changing the editor or storefront router.
