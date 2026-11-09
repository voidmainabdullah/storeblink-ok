# Theme Chrome System

## Purpose
Provides one declarative, cross-theme contract for storefront icons, responsive
mobile-menu presentation, and directly manipulable store logos with
theme-defined defaults.

## Owns
- Validation and normalization of `extensions.themeChrome`.
- Discovery and annotation of semantic chrome slots in a Scene Graph.
- Materialization of icon, menu-presentation, and logo-placement settings into
  renderable node data.
- Lazy icon-library resolution and the mobile-menu animation registry.
- Automatic light/dark logo variant selection from the resolved header color.
- One-time/default logo placement and preservation of user-owned responsive
  transforms.

## Does NOT Own
- Scene Graph persistence or mutation history.
- Theme-specific header geometry and visual design.
- Navigation data, route resolution, search, account, or cart business behavior.
- General element transforms.
- Imported asset source data or SVG sanitization.

## Public API
```ts
interface ThemeChromeAPI {
  getSettings(scene: SceneTree): ThemeChromeSettings;
  ensureScene(scene: SceneTree): SceneTree;
  applySettings(scene: SceneTree, settings: ThemeChromeSettings): SceneTree;
  resetLogoPlacement(
    scene: SceneTree,
    breakpoint: ThemeChromeBreakpoint,
  ): SceneTree;
}
```

The public exports also include `ThemeIcon`, `ThemeMobileMenuStyles`,
`useThemeMobileMenu`, logo-presentation helpers, slot discovery helpers, and the
named animation registry.

## Depends On
- Scene Graph cloning and node contracts.
- Asset System for logo and custom menu-icon records.
- Navigation System for the shared desktop/mobile/footer link document.
- Runtime Link Resolver for the logo destination.
- Responsive System for breakpoint placement.
- Existing Command and History systems for editor-side commits.
- Theme package reconciliation for editor and public-store hydration.
- Existing palette/color-picker infrastructure.

## Folder
`src/theme-engine/chrome/`

## State Ownership
Persisted settings live only on the Scene Graph root at
`extensions.themeChrome`. The Theme Chrome System produces a cloned next scene;
the Command System remains the only editor path allowed to commit that scene.
Open mobile-menu state is ephemeral runtime UI state and is never persisted.

## Event Flow
Inspector edits create a next settings object, `ThemeChromeSystem.applySettings`
materializes it into a cloned Scene Graph, and one scene-replace command commits
the change. Theme package reconciliation calls `ensureScene` before both editor
and public rendering, so the same node data drives both surfaces. Invalid
settings are rejected before scene materialization and the originating
inspector displays the validation message in place.

Direct logo manipulation follows the standard Transform System lifecycle:
Moveable -> RAF preview -> one Transform Command on release. The active
breakpoint override is marked `manualTransform`; Theme Chrome reconciliation
preserves it instead of regenerating placement geometry. Placement controls may
intentionally recalculate that breakpoint, and Reset restores the theme's
original logo frame.

## Performance Notes
Each icon family is loaded only when first viewed or rendered. Resolved
components and module promises are cached. The adapters expose a curated,
storefront-safe catalog instead of loading complete multi-thousand-icon barrels.
Logo intrinsic metadata is decoded once by Asset System; renderers only resolve
an asset ID and responsive placement.

## Known Pitfalls / Anti-Patterns
- Do not add theme-specific icon pickers or mobile-menu state.
- Do not regenerate a logo breakpoint carrying `manualTransform`; the Scene
  transform is user-owned until an explicit placement change or reset.
- Do not distort the uploaded logo. Direct resize keeps the intrinsic ratio and
  rendering uses `contain`.
- Do not add animation names outside the registry.
- Do not mutate `extensions.themeChrome` directly from React components.
- Do not add a second mobile navigation dataset.

## Extensibility
New templates participate by using semantic actions or explicit `chromeSlot`
metadata for account, cart, search, navigation, menu, and logo nodes. Each
breakpoint may override logo placement and mobile icon presentation without
changing the other breakpoints. New icon families add one lazy adapter. New
menu animations add one registry entry without changing theme renderers.
