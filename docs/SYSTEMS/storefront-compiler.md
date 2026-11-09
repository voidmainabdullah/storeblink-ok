# Storefront Compiler

## Purpose

Compile a validated Store Definition and pinned StoreKit into one deterministic,
immutable Runtime Artifact. Compilation is a publish-time batch operation. It is
never executed while serving an individual storefront request.

## Owns

- The ordered compiler pipeline and diagnostics produced by each stage.
- Resolution of StoreKit route assignments, component slots, merchant patches,
  commerce binding plans, tokens, global regions, assets, layout, and responsive
  intent into Runtime IR.
- Canonical artifact serialization and its SHA-256 content hash.
- Fail-closed publication readiness for every required storefront resource.

## Does NOT Own

- StoreKit installation or source-document persistence.
- Merchant patch creation and merge policy.
- Live catalog records, prices, inventory, cart state, or search results.
- The public publication pointer, database transaction, CDN, or rollback policy.
- React rendering or editor state.

## Public API

```ts
interface StorefrontCompilerAPI {
  compile(input: StorefrontCompilerInput): StorefrontCompilerResult;
}

interface CommerceBindingEngineAPI {
  compile(binding: CommerceBinding, availableTargets?: ReadonlySet<string>): CommerceBinding;
  resolve(binding: CommerceBinding, data: CommerceRuntimeData): CommerceContentProjection;
}

sectionControlSemanticPath(sectionPath, "variant" | "visible");
routeSectionOrderSemanticPath(resourceType);
```

The exact StoreKit, DesignPack, TemplateBlueprint, ComponentLibrary,
StoreDefinition, MerchantPatch, CommerceBinding, and RuntimeArtifact contracts
come from the Adaptive Commerce public contract barrel. The compiler does not
define competing document types.

## Depends On

- Adaptive Commerce contracts, registries, patches, and installation model.
- Certified component and blueprint catalogs.
- Existing engine migration and validation systems through adapters.
- Existing layout, responsive, asset, and production-policy systems through
  deterministic compiler stages.

## Folder

`src/adaptive-commerce/compiler/`

Related pure-data catalogs live in:

- `src/adaptive-commerce/components/`
- `src/adaptive-commerce/blueprints/`
- `src/adaptive-commerce/commerce/`
- `src/adaptive-commerce/fixtures/`

The fixture catalog includes released, exact-pin StoreKits for `basic`,
`atelier`, `spark-fashion`, and `noir-chrono`. Each uses a distinct certified
token preset while resolving the same complete eight-resource contract; none
uses a generic missing-route fallback.

## State Ownership

The compiler owns no mutable application store. A compile clones its input,
runs pure stages, and returns a deeply frozen result. Registry state is bounded
to explicitly registered, versioned definitions and returns defensive clones.

## Event Flow

```text
Store Definition + StoreKit pin + DesignPack + Blueprints + Patches + Bindings
  -> schema validation
  -> migration
  -> token resolution
  -> template resolution
  -> slot resolution
  -> commerce binding compilation
  -> layout resolution
  -> responsive compilation
  -> accessibility validation
  -> asset optimization
  -> performance validation
  -> canonical JSON + SHA-256
  -> immutable Runtime Artifact
```

Every required route is compiled as a unit: Home, Product, Collection, Page,
Blog, Cart, Search, and 404. Missing assignments, definitions, variants, slots,
bindings, global regions, or accessibility requirements are blocking errors.

The only canonical section controls currently reserved in the semantic source
document are `<section>.settings.variant` and
`<section>.settings.visible`. Route order uses the existing
`<resource-prefix>.sections` `SemanticCollection.order` and must name every
blueprint section exactly once. Variants must exist in the pinned certified
component; visibility must be boolean; unknown section paths/control names and
incomplete order are blocking compiler errors. Hidden sections and their
bindings are omitted together. These data contracts do not imply that an
authoring UI exists yet.

## Performance Notes

- Canonical serialization sorts object keys but preserves declared array order.
- The source hash excludes publication metadata. The artifact hash covers the
  complete artifact payload other than its self-referential hash field,
  including the injected publication ID and timestamp.
- The compiler never reads clocks or random generators; publication metadata is
  explicit input, so equal input produces byte-equivalent canonical content.
- Commerce binding plans describe safe runtime data projection. Live commerce
  data can change without rebuilding component structure or layout.
- Batch compilation makes expensive validation acceptable and keeps storefront
  request handling to artifact selection plus constrained data hydration.

## Known Pitfalls / Anti-Patterns

- Never call the compiler from a public storefront request.
- Never let a commerce binding target transform, layout, style, responsive, or
  merchant-patch state. Its output is content/props only.
- Never treat an allowed-section manifest entry as a real blueprint builder.
- Never substitute a generic Product, Collection, Cart, Search, or 404 page when
  an assigned blueprint is missing.
- Never include editor-only state, functions, dates, non-finite numbers, or
  environment-dependent values in hashed artifact content.
- Never invent ad hoc section-control paths; unsupported `.settings.*` values
  fail closed rather than being ignored.
- Client-side compilation may support preview, but it cannot authorize or
  activate a production publication.

## Extensibility

StoreKits extend shared blueprints through declarative data patches and pin one
tested ComponentLibrary version. Third-party definitions must pass the same
schema, accessibility, slot, binding, and compatibility checks. No arbitrary
component code executes in this v1 compiler slice.
