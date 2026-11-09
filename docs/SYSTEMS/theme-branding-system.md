# Theme Branding System

## Purpose
Persists store-wide typography branding and resolves coherent heading, body, accent, and UI font roles in both editor and storefront rendering.

## Owns
- Root `extensions.themeBranding` settings.
- Curated font catalog and font-pair presets.
- Brand-role font resolution and lazy web-font loading.

## Does NOT Own
- Per-node text content, size, weight, or local font overrides.
- Theme color mutation or layout.

## Public API
```ts
interface ThemeBrandingSystemAPI {
  getSettings(scene: SceneTree): ThemeBrandingSettings;
  getAppliedSettings(scene: SceneTree): ThemeBrandingSettings | null;
  applyPairing(settings: ThemeBrandingSettings, pairingId: string): ThemeBrandingSettings;
  applySettings(scene: SceneTree, settings: ThemeBrandingSettings): SceneTree;
  resolveNode(node: SceneNode, settings: ThemeBrandingSettings | null): SceneNode;
  resolveTokens(tokens: ThemeDesignTokens, settings: ThemeBrandingSettings | null): ThemeDesignTokens;
}
```

## Depends On
- Scene Graph serialization contract.
- Theme runtime design-token contract.

## Folder
`src/theme-engine/branding/`

## State Ownership
The Scene Graph root owns persisted branding. UI changes dispatch a scene-replace command; renderers only read resolved settings.

## Event Flow
Branding control -> Command System -> Scene Graph root -> Renderer invalidation -> Theme Runtime -> node font-role resolution.

## Performance Notes
Font files load only for the active pairing. Font roles are resolved at the existing node render boundary without mutating child nodes.

## Known Pitfalls / Anti-Patterns
- Do not rewrite every text node when a pairing changes.
- Do not bypass local `fontBinding: "local"` overrides.
- Do not accept arbitrary remote stylesheet URLs.

## Extensibility
Additional curated fonts and pairings can be registered in the catalog without changing Scene Graph node schemas.
