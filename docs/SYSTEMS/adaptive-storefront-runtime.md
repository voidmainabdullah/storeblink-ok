# Adaptive Storefront Runtime

## Purpose

Render a validated immutable Adaptive Commerce artifact for its exact storefront resource route, then hydrate only compiler-approved commerce properties with current catalog, cart, search, and page data.

## Owns

- The certified React renderers for Header, Footer, Hero, product and collection grids, Product, Cart, Search, Page, Blog, and Not Found.
- Fail-closed parsing of route documents and global-region references.
- Prop-only execution of compiled commerce binding plans.
- Scoped storefront CSS, cascade-layer order, intrinsic responsive layout, logical direction, and accessible interaction targets.
- The runtime render error boundary and its stable error signal.

## Does NOT Own

- StoreDefinition, merchant patches, StoreKit installation, compilation, or publication.
- Commerce records, cart state, checkout orchestration, routing, or RUM transport.
- Arbitrary third-party React renderers, CSS, network access, or runtime reconciliation.
- Editor state, Scene Graph mutation, responsive authoring policy, or history.

## Public API

```ts
type AdaptiveStorefrontRuntimeProps = {
  artifact: RuntimeArtifact;
  resourceType: StorefrontResourceType;
  products: readonly AdaptiveStorefrontProduct[];
  currentProduct?: AdaptiveStorefrontProduct | null;
  page?: AdaptiveStorefrontPageContent | null;
  cart: AdaptiveStorefrontCart;
  navigation: readonly AdaptiveStorefrontNavigationItem[];
  // host-owned route URLs and error signal omitted here
};

function AdaptiveStorefrontRuntime(props: AdaptiveStorefrontRuntimeProps): JSX.Element;
function resolveRuntimeComponentProps(
  artifact: RuntimeArtifact,
  reference: RuntimeComponentReference,
  data: CommerceRuntimeData,
): Readonly<Record<string, JsonValue>>;
```

## Depends On

- Immutable `RuntimeArtifact` contracts and compiler-generated binding plans.
- The Commerce Binding Engine's read-only resolver.
- React Router for host-provided storefront links.
- Host-owned product, page, navigation, cart, and checkout adapters.

## Folder

`src/adaptive-commerce/runtime/rendering/`

## State Ownership

The runtime owns no persistent or document state. It derives render props from an immutable artifact plus host inputs. Cart actions call host-owned functions; they never mutate the artifact or layout. The error boundary owns only its local failed-render flag.

## Event Flow

1. The server-owned runtime assignment chooses legacy or a specific adaptive artifact.
2. `RuntimeArtifactResolver` validates the public RPC response and artifact schema.
3. The route host supplies current commerce data and the exact resource type.
4. The runtime parses the compiled route and required global regions.
5. Compiled binding plans copy allow-listed data fields into component props only.
6. Certified renderers produce the storefront; cart and checkout actions return to host-owned adapters.
7. A render failure stops the adaptive tree, shows a stable recovery surface, and emits a code for RUM.

## Performance Notes

Route parsing and commerce-data normalization are memoized by immutable input identity. Compilation and reconciliation never run in the public render flow. Responsive layout is CSS-driven and container-aware. The scoped CSS is loaded as a static raw asset string so Tailwind cannot reinterpret the v3 native cascade-layer names.

## Known Pitfalls / Anti-Patterns

- Never fall back to a generic renderer for an unknown compiled component.
- Never use a binding to write layout, transforms, CSS, tokens, or responsive policy.
- Do not call legacy scene reconciliation for an adaptive assignment.
- Do not render a checkout control without a host checkout action.
- A pure width sweep is not a browser layout proof; keep the Playwright route/width/RTL/adversarial-content probe as a hard release check.

## Extensibility

Platform-owned certified components can be added only with a ComponentLibrary definition, accessibility contract, blueprint coverage, compiler validation, renderer, and route/adversarial tests. Third-party app blocks remain isolated in the opaque iframe host and cannot register React renderers here.
