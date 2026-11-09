# Universal Theme Engine

## Purpose
Loads a store's active theme package and resolves canonical Scene Graph sections through theme, family, universal, and safe fallback renderers without moving commerce behavior into themes.

## Owns
- Canonical theme, section, block, setting, responsive, installation, and template-document contracts.
- Validated theme manifests and lazily loaded theme packages.
- Theme renderer resolution, capabilities, tokens, runtime context, and extension slots.
- Theme migration and non-destructive theme-switch mapping.

## Does NOT Own
- Store, product, menu, customer, cart, checkout, or order data.
- Scene Graph node state or editor interaction state.
- Publication state and active installation persistence.
- Theme-specific visual composition.

## Public API
```ts
themePackageRegistry.registerLoader(themeId, loader)
themePackageRegistry.load(themeId)
themePackageRegistry.resolveSectionRenderer(themePackage, sectionType, fallback)

<ThemeRuntimeProvider themeId={themeId} mode="editor" | "storefront">
  {children}
</ThemeRuntimeProvider>

<StorefrontRuntime
  scene={scene}
  breakpoint={breakpoint}
  dynamicData={dynamicData}
/>

useThemeRuntime()
useThemeCapability(capability)
resolveResponsiveValue(value, breakpoint, themeDefault, universalDefault)
storefrontExtensionRegistry.register(extension)
```

## Depends On
- Scene Graph and renderer public APIs.
- Section Registry validation.
- Dynamic Source System.
- StoreBlink Core navigation, cart, account, commerce, and search controllers.
- Theme Registry and Theme Migration System.

## Folder
`src/theme-engine/`, `src/core/`, `src/themes/`

## State Ownership
The registries own only process-local immutable definitions and package-load caches. The Scene Graph remains the document source of truth. Store data remains in StoreBlink Core and the persistence layer.

## Event Flow
Published Scene Graph -> resolve active theme ID -> lazy-load validated package -> resolve canonical section renderer -> resolve dynamic store data -> render through the same `RenderNode` path used by the editor. Theme switching creates a new draft installation, preserves portable settings, and moves unsupported content into recovery data.

## Performance Notes
- `import.meta.glob` keeps theme packages out of the initial bundle.
- Concurrent package requests share one promise and one cached package identity.
- Product sections persist IDs and dynamic bindings, then reconcile against batched Core data.
- Only the active theme stylesheet is imported.
- Section validation is scoped to the rendered section and memoized by node identity.

## Known Pitfalls / Anti-Patterns
- Do not query products or menus from a theme renderer.
- Do not add theme-ID condition chains to shared storefront components.
- Do not store product payloads in section settings.
- Do not render separate editor and public section markup.
- Do not auto-publish migrations or delete unsupported content.
- Do not let theme CSS escape its `data-theme-id` scope.

## Extensibility
Add `src/themes/<id>/manifest.ts` and `package.ts`; both are discovered automatically. A package may supply canonical renderers, features, Scene Graph creation, and data reconciliation. Missing renderers fall through to family, universal, then safe fallback handling. `npm run theme:create -- --name="New Theme" --id="new-theme"` scaffolds the required package.
