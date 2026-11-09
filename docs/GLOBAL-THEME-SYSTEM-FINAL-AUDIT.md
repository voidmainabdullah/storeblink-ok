# Global Theme System - Final Architecture Audit

**Audit date:** 2026-07-29  
**Scope:** Theme discovery, packages, design tokens, Scene Graph creation, editor application, responsive behavior, dynamic commerce data, shared chrome, rendering, persistence, migrations, and storefront delivery.

## 1. Executive Summary

The Global Theme System is implemented and active in the live StoreBlink editor and storefront runtime.

It is not a collection of theme-specific page components. A theme is a validated, versioned package that supplies:

- Metadata and capabilities through a manifest.
- Design tokens and supported page templates.
- A function that creates an editable Scene Graph.
- An optional reconciliation function for live store and product data.
- Optional section and feature renderers.
- Scoped CSS and version migrations.

The persisted Scene Graph remains the source of truth. Themes do not own cart, checkout, customer, search, product, navigation, history, selection, or editor state. Those behaviors remain in shared platform and editor systems.

Current automatically discovered themes:

| Theme | Status | Notes |
|---|---:|---|
| Basic | Implemented ✓ | Structured commerce starter theme |
| Atelier | Implemented ✓ | Editorial furniture theme |
| Noir Chrono | Implemented ✓ | Responsive watch storefront with more than 90 independent nodes |

## 2. Audit Status

### Implemented ✓

- Automatic manifest discovery from `src/themes/*/manifest.ts`.
- Automatic lazy package discovery from `src/themes/*/package.ts`.
- Validated manifests, capabilities, tokens, templates, and schema versions.
- Lazy package loading with request deduplication and process-local caching.
- Theme catalog generated from the registry instead of a hardcoded sidebar list.
- Theme application through one Scene Graph replacement command.
- Scene validation before editor insertion and after reconciliation.
- Shared editor and public storefront Scene Graph rendering.
- Shared dynamic product bindings instead of persisted product payload duplication.
- Shared Theme Chrome for logo, navigation, search, account, cart, and mobile menu.
- Desktop, tablet, and mobile Scene Graph overrides.
- Scene-owned canonical responsive widths with backward-compatible defaults.
- Global design-token color editing through command-backed Scene Graph updates.
- Theme capabilities and token access through `ThemeRuntimeProvider`.
- Theme, family, universal, and safe-fallback section renderer resolution.
- Draft/publish revision serialization through `StorefrontPublishingService`.
- Deterministic theme migration planning and non-destructive theme switching.
- Theme scaffolding command and automatic discovery contract.
- Scoped theme styles and lazy theme assets.
- Error boundary around storefront Scene Graph rendering.
- Extension slots before and after the main storefront runtime.
- Platform-owned scene, document, binding, extension, effect, and protocol limits.
- Mandatory publishing preflight outside React/editor code.
- Platform/signed/development provenance enforcement for theme packages and extensions.
- Immutable session recovery points and authenticated durable publication-history contracts.
- A merchant-visible publication recovery panel that republishes restored snapshots as new revisions.

### Partially Implemented △

- `ThemeInstallation` and `ThemeTemplateDocument` contracts exist, while the current live editor still persists its active Scene Graph through the existing profile publishing gateway rather than a complete installation-management UI.
- Theme migration planning is implemented and tested, but migration registration is currently theme-by-theme and no administrative migration dashboard exists.
- Canonical section renderer fallback is implemented. Basic and Noir primarily use generic Scene Graph element renderers rather than custom canonical section renderers.
- Theme capabilities are available to runtime consumers, but not every declared capability has a dedicated editor control.
- Theme switching preserves portable settings and identifies unsupported sections, but a complete recovery-content UI is not present.

### Missing ✗

- Remote database migration verification for dedicated theme-installation tables is not proven by the local test suite.
- A visual regression screenshot suite covering every theme at all three breakpoints is not currently part of CI.
- A complete merchant-facing theme-version upgrade UI is not implemented; publication rollback is implemented.
- A marketplace download and cryptographic signing service is not implemented; production registries reject untrusted code and expose signature-verifier hooks.

### Technical Debt

1. `buildEngineTemplateScene()` still contains synchronous Basic/Atelier compatibility branches. New runtime code uses `loadEngineTemplateScene()` and automatic package loading.
2. The old `threadtemplate` ID is converted to Basic during reconciliation for backward compatibility.
3. Some theme scene factories are large data-construction modules and should eventually be split into section factories without changing their output.
4. Existing canvas interaction tests emit non-failing React `act(...)` warnings.
5. Browserlist metadata is outdated; this does not block the current build.

### Regression Risk

| Area | Risk | Protection |
|---|---:|---|
| Theme discovery | Low | Registry and editor-template tests |
| Package loading | Low | Promise deduplication and package identity tests |
| Theme application | Medium | Scene validation and command-backed replacement |
| Product reconciliation | Medium | Theme-specific identity-preservation tests |
| Responsive layouts | Medium | Scene-width and breakpoint override tests |
| Theme switching | Medium | Mapping and migration tests |
| Published persistence | Medium | Revision and serialization tests |
| Pixel-level visuals | Medium | Build checks exist; screenshot CI is still missing |

## 3. Source-of-Truth Boundaries

| Data | Owner | Persisted location |
|---|---|---|
| Editable nodes, hierarchy, styles, transforms, theme settings | Scene Graph | Published/draft scene document |
| Active theme identity | Scene root | `extensions.themeId` |
| Theme tokens customized by user | Scene root | `extensions.designTokens` |
| Chrome configuration | Scene root | `extensions.themeChrome` |
| Responsive canonical widths | Scene root | `extensions.responsiveWidths` |
| Product references | Scene nodes | `extensions.productId` and `dynamicBinding` |
| Product payloads | Commerce/Core data | Not duplicated as authoritative theme data |
| Selection and hover | Selection System | Ephemeral |
| Transform preview | Transform System | Ephemeral until command commit |
| Undo/redo | Command and History Systems | Command history |
| Cart, search, customer, navigation | StoreBlink Core | Platform-owned |
| Package definitions | Theme registries | Process-local immutable registry/cache |

The key invariant is:

> A theme creates or reconciles a Scene Graph, but the Scene Graph is the persisted editable document.

## 4. High-Level Architecture

```text
src/themes/<theme-id>/
  manifest.ts ────────> ThemeRegistry (eager catalog discovery)
  package.ts ─────────> ThemePackageRegistry (lazy runtime discovery)
  tokens.ts
  templates/
  sections/
  features/
  migrations/
  styles/
  assets/

Editor template sidebar
  -> loadEngineTemplateScene(themeId)
  -> ThemePackageRegistry.load(themeId)
  -> package.createScene(profile, products)
  -> validation
  -> ThemeChromeSystem.ensureScene()
  -> responsive overrides + structured reflow
  -> SceneReplaceCommand
  -> Command System -> Scene Graph -> History
  -> CanvasShell -> Renderer -> Overlay

Draft/publish
  -> serialize Scene Graph
  -> StorefrontPublishingService
  -> revision-aware publishing gateway

Public storefront
  -> load published Scene Graph and Core commerce data
  -> reconcileEngineTemplateScene()
  -> StorefrontRuntime
  -> ThemeRuntimeProvider
  -> DynamicSourceProvider
  -> SceneRenderProvider -> RenderNode
```

## 5. Theme Package Contract

The central `ThemePackage` contract contains:

```ts
type ThemePackage = {
  manifest: ThemeManifest;
  sectionRenderers: Partial<Record<CanonicalSectionType, ThemeSectionRenderer>>;
  featureRenderers?: Record<string, ComponentType<Record<string, unknown>>>;
  createScene?: (profile, products) => SceneTree;
  reconcileScene?: (scene, profile, products) => SceneTree;
};
```

### Manifest Logic

`ThemeManifest` declares:

- Stable `id`, semantic `version`, and integer `schemaVersion`.
- Minimum platform version.
- Description, category, design style, and preview image.
- Supported capabilities.
- Default design tokens.
- Supported page templates and allowed/required section types.
- Optional global settings schema.
- Editor catalog ordering and badge.

`validateThemeManifest()` uses Zod to reject malformed IDs, versions, capabilities, templates, and schema values before a package can be used.

## 6. Automatic Discovery Flow

### Manifest Discovery

`ThemeRegistry.ts` uses:

```ts
import.meta.glob("../*/manifest.ts", { eager: true })
```

Reason:

- The editor catalog needs lightweight metadata immediately.
- Adding a valid theme folder does not require editing a central theme list.
- Invalid or duplicate manifests fail through registry validation.

### Package Discovery

`ensureBuiltInThemePackages()` uses:

```ts
import.meta.glob("./*/package.ts")
```

Reason:

- Theme code, CSS, renderers, and assets remain outside the initial bundle.
- A loader is registered under the folder-derived theme ID.
- The package is imported only when the editor or storefront needs it.

### Lazy-Loading Logic

`ThemePackageRegistry.load(themeId)`:

1. Returns an already loaded package when available.
2. Returns the existing pending promise for concurrent requests.
3. Looks up the registered loader.
4. Lazily imports the package.
5. Validates its manifest.
6. Verifies that the returned manifest ID matches the requested ID.
7. Caches the package.
8. Removes the pending promise when complete.

This prevents duplicate network work and inconsistent package instances.

## 7. Editor Theme Application Flow

`EngineTemplatePanel` receives its catalog from `getEngineSceneTemplates()`. Only manifests with a matching package loader are shown.

When the user presses **Apply**:

1. `EngineEditor.applyTemplate(themeId)` captures the current Scene Graph.
2. `loadEngineTemplateScene()` lazily loads the package.
3. `package.createScene(profile, products)` builds the new document.
4. `validateSceneTree()` normalizes the result.
5. `ThemeChromeSystem.ensureScene()` materializes shared chrome settings.
6. `assertValidSceneTreeStructure()` checks node references and hierarchy.
7. `ResponsiveSystem.ensureSceneOverrides()` ensures independent breakpoints.
8. Structured themes run through `StructuredLayoutSystem.reflowScene()`.
9. One `SceneReplaceCommand` replaces the previous document.
10. History receives one undoable entry.
11. Canvas dimensions and background update from the new root.
12. The viewport fits to the new scene and selection is cleared.

No direct theme mutation bypasses Command/History during application.

## 8. Scene Creation and Reconciliation

### `createScene(profile, products)`

Used only when applying a new theme.

Responsibilities:

- Create every editable visual object as an independent Scene Graph node.
- Establish parent/child ordering.
- Declare desktop, tablet, and mobile transforms.
- Store semantic metadata such as section type, chrome slot, action, and dynamic binding.
- Place theme ID, tokens, responsive widths, canvas background, and chrome settings on the root.
- Use current store profile and product references for initial content.

### `reconcileScene(scene, profile, products)`

Used when reopening the editor and before public rendering.

Responsibilities:

- Clone the persisted scene instead of mutating it.
- Refresh dynamic store/product references.
- Preserve merchant-edited transforms, styles, names, and content.
- Preserve explicit product relinks.
- Remove stale product IDs only when they no longer resolve.
- Ensure shared chrome metadata remains materialized.
- Return a valid Scene Graph.

Reconciliation must not regenerate the whole theme and erase user edits.

## 9. Product and Commerce Logic

Themes persist product identity, not authoritative product payloads.

A product-backed node uses:

```text
extensions.productId
extensions.dynamicBinding = {
  source: "product",
  field: "image_url" | "name" | "price",
  target: "src" | "text",
  productId
}
```

Runtime flow:

1. Storefront data resolver loads the store catalog.
2. `reconcileScene()` checks references against the current catalog.
3. `DynamicSourceProvider` exposes batched product/store data.
4. `DynamicSourceSystem` resolves each binding at render time.
5. Shared action/navigation controllers handle product routes and cart actions.

Therefore changing a product in `/products` updates linked storefront nodes without making the theme own commerce logic.

## 10. Global Design Tokens

Default tokens come from `manifest.designTokens`. Supported groups include:

- Colors.
- Typography.
- Spacing.
- Radius.
- Shadows/effects.
- Container widths.
- Motion duration and easing.

Runtime resolution:

```text
Scene root customized token
  -> active package manifest token
  -> universal fallback token
```

Editor color changes:

1. Clone the current Scene Graph.
2. Replace matching token-derived fills and responsive style overrides.
3. Update `root.extensions.designTokens.colors[token]`.
4. Commit one scene-replacement command.
5. Update the store profile color when the primary brand token changes.

This allows global customization while every node remains independently editable afterward.

## 11. Responsive System

Each node can own independent `desktop`, `tablet`, and `mobile` overrides.

The scene root can declare:

```ts
responsiveWidths: {
  desktop: 1440,
  tablet: 768,
  mobile: 390
}
```

`ResponsiveSystem.getSceneWidths()` resolves:

1. Explicit scene `responsiveWidths`.
2. Legacy `responsiveBaseWidth` for desktop.
3. Root transform width.
4. Platform defaults of 1200/768/390.

`resolveNodeForWidth()`:

- Resolves the breakpoint override chain.
- Scales horizontal geometry for intermediate viewport widths.
- Preserves vertical geometry unless layout rules change it.
- Applies restrained fluid scaling to large typography.

`StructuredLayoutSystem.reflowScene()` uses the scene-owned width, flows visible sections vertically, and preserves manually transformed overrides.

The same responsive resolution is used by editor canvas sizing and public storefront rendering.

## 12. Theme Chrome System

Theme Chrome is the shared contract for:

- Store logo and text fallback.
- Home, Products, About, Contact, and custom links.
- Search, account, and cart actions.
- Mobile menu trigger and drawer.
- Icon family, icon name, color, size, and stroke.
- Mobile-menu animation.

`ThemeChromeSystem.getSettings(scene)` reads normalized settings.

`ensureScene(scene)`:

- Clones the scene.
- Discovers semantic chrome nodes.
- Adds missing slot metadata.
- Materializes root settings into matching nodes.

`applySettings(scene, settings)`:

- Validates/normalizes settings.
- Updates root `extensions.themeChrome`.
- Materializes changes into cloned nodes.
- Returns a new scene for command-backed commit.

Open/closed mobile-menu state is runtime-only and is never persisted.

## 13. Rendering Flow

`StorefrontRuntime` is the public entry point.

1. `themeIdForScene()` reads `root.extensions.themeId`.
2. `ThemeRuntimeProvider` lazily loads the active package.
3. It exposes active tokens, capabilities, mode, loading state, and renderer resolution.
4. `DynamicSourceProvider` supplies store/product data.
5. `SceneRenderProvider` supplies scene, breakpoint, viewport width, and visibility.
6. `RenderNode` renders the same node model used by the editor.
7. `SceneRenderErrorBoundary` isolates runtime failures.
8. Extension slots render approved platform/plugin additions around main content.

### Renderer Resolution

For a canonical section, `resolveSectionRenderer()` checks:

1. Active theme renderer.
2. Theme-family renderer.
3. Universal renderer.
4. Safe unknown-section fallback.

This prevents blank storefront sections when a specialized renderer is absent.

## 14. Persistence and Publishing

The editor serializes the Scene Graph document. Theme packages are code and are not embedded in every save.

`StorefrontPublishingService`:

- Maintains the current document revision.
- Serializes draft and publish requests through a promise queue.
- Sends `expectedRevision` to the gateway.
- Updates its revision only after a successful write.
- Continues processing later writes even when a previous write fails.

Public storefront reads use the published Scene Graph. Draft preview explicitly requests draft state.

## 15. Migration and Theme Switching

### Schema Migration

`ThemeMigrationSystem`:

- Registers one deterministic step per `themeId:fromSchemaVersion`.
- Builds a complete sequential migration plan.
- Rejects missing intermediate versions.
- Clones input before migration.
- Validates the final document.
- Does not auto-publish.

### Theme Switching

`ThemeSwitchingSystem.prepare()`:

- Archives the previous installation in the plan.
- Creates a new draft installation for the target theme.
- Preserves portable global settings.
- Maps known semantic section types.
- Lists unsupported section types for recovery.
- Does not silently delete unsupported content.

## 16. Extension and New-Theme Workflow

Create a scaffold:

```powershell
npm run theme:create -- --name="New Theme" --id="new-theme"
```

The generator creates:

```text
src/themes/new-theme/
  manifest.ts
  package.ts
  tokens.ts
  presets.ts
  controllers.ts
  templates/home.ts
  sections/index.ts
  blocks/index.ts
  features/index.ts
  migrations/index.ts
  styles/theme.css
  tests/manifest.test.ts
```

Implementation checklist:

1. Complete and validate the manifest.
2. Define design tokens and capabilities.
3. Implement `createScene()` for a directly editable document.
4. Implement `reconcileScene()` when live store data is used.
5. Add canonical renderers only when generic node rendering is insufficient.
6. Scope CSS under the theme runtime selector.
7. Add schema migrations before increasing `schemaVersion`.
8. Test discovery, creation, reconciliation, breakpoints, chrome, and product relinking.
9. Restart Vite so the glob catalog includes the new package.

No central editor, router, or storefront switch statement should be changed for a new theme.

## 17. Function Responsibility Matrix

| Function/System | Core logic |
|---|---|
| `ThemeRegistry.register()` | Validate and defensively register unique manifest metadata |
| `ThemeRegistry.list()` | Return catalog-safe manifest copies |
| `ThemeRegistry.resolveFeature()` | Resolve whether a declared theme feature is enabled |
| `ensureBuiltInThemePackages()` | Discover package files and register lazy loaders once |
| `ThemePackageRegistry.load()` | Deduplicate, validate, cache, and return a lazy package |
| `resolveSectionRenderer()` | Resolve theme → family → universal → safe fallback |
| `getEngineSceneTemplates()` | Build sorted editor catalog from manifest and package registries |
| `loadEngineTemplateScene()` | Create, normalize, chrome-enable, and validate a new scene |
| `reconcileEngineTemplateScene()` | Hydrate an existing scene without discarding edits |
| `EngineEditor.applyTemplate()` | Commit theme replacement as one undoable command |
| `ThemeRuntimeProvider` | Expose loaded package, tokens, capabilities, and renderer resolver |
| `StorefrontRuntime` | Compose theme, dynamic data, renderer, errors, and extension slots |
| `DynamicSourceSystem` | Resolve live product/store values into bound node properties |
| `ResponsiveSystem` | Resolve independent breakpoint geometry and scene widths |
| `StructuredLayoutSystem` | Reflow structured sections without overwriting manual overrides |
| `ThemeChromeSystem` | Normalize and materialize global navigation/icon/logo settings |
| `StorefrontPublishingService` | Serialize revision-aware draft and publish writes |
| `ThemeMigrationSystem` | Plan and execute deterministic schema upgrades |
| `ThemeSwitchingSystem` | Prepare non-destructive installation and section mappings |
| `create-theme.mjs` | Generate a convention-compliant auto-discovered package |

## 18. Verification Evidence

Verified on 2026-07-29:

- `npm run test -- --maxWorkers=1` ✓
- 56 test files passed ✓
- 209 tests passed ✓
- `npx tsc --noEmit` ✓
- `npm run build` ✓
- Production bundle includes lazy theme packages and theme assets ✓
- `/dashboard/store` responds with HTTP 200 on port 8082 ✓
- Basic, Atelier, and Noir Chrono automatic discovery tests pass ✓
- Theme Chrome tests pass ✓
- Dynamic product reconciliation tests pass ✓
- Responsive Scene Graph tests pass ✓
- Publishing revision tests pass ✓
- Migration and theme-switching tests pass ✓

## 19. Final Verdict

**Overall status: Implemented with documented production gaps △**

The core Global Theme System is operational and architecturally aligned with the Engine:

- Themes are automatically discoverable packages.
- Scene Graph is the editable and persisted source of truth.
- Theme visual composition remains isolated from commerce and editor behavior.
- Editor and public storefront use the same node model and rendering path.
- Responsive, chrome, product binding, tokens, commands, history, and publishing are integrated.

The remaining work is primarily operational maturity: dedicated installation administration, remote schema verification, visual-regression CI, third-party package security, and cleanup of legacy compatibility entry points.
