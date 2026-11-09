import {
  STOREFRONT_RESOURCE_SEMANTIC_PREFIXES,
  semanticPath,
  tokenAddress,
  tokenLiteral,
  type AdaptiveComponentLibrary,
  type CommerceBinding,
  type DesignPack,
  type MerchantPatch,
  type SemanticStorefrontDocument,
  type StoreKit,
  type StoreKitInstallationRequest,
  type StorefrontResourceType,
  type TemplateBlueprint,
} from "@/adaptive-commerce/contracts";
import { AdaptiveCommerceRegistry } from "@/adaptive-commerce/registry";

export const HASH_A = `sha256:${"a".repeat(64)}`;
export const HASH_B = `sha256:${"b".repeat(64)}`;
export const HASH_C = `sha256:${"c".repeat(64)}`;
export const HASH_D = `sha256:${"d".repeat(64)}`;

export const createDesignPack = (): DesignPack => ({
  kind: "design-pack",
  id: "professional-core",
  version: "1.0.0",
  integrity: HASH_A,
  schemaVersion: 1,
  tokenSchemaVersion: "2025.10",
  name: "Professional Core",
  description: "Stable test design pack.",
  tokens: {
    primitive: {
      "color.ink": tokenLiteral("color", "#111111"),
      "color.paper": tokenLiteral("color", "#ffffff"),
    },
    semantic: {
      "content.foreground": { $ref: tokenAddress("primitive", "color.ink") },
      "surface.canvas": { $ref: tokenAddress("primitive", "color.paper") },
    },
    component: {
      "heading.foreground": { $ref: tokenAddress("semantic", "content.foreground") },
    },
  },
  presets: [{
    id: "warm",
    name: "Warm",
    overrides: [{
      address: tokenAddress("semantic", "surface.canvas"),
      value: tokenLiteral("color", "#fff8f0"),
    }],
  }],
});

export const createComponentLibrary = (): AdaptiveComponentLibrary => ({
  kind: "component-library",
  id: "professional-components",
  version: "1.0.0",
  integrity: HASH_B,
  schemaVersion: 1,
  name: "Professional Components",
  components: {
    "content-section": {
      id: "content-section",
      version: "1.0.0",
      name: "Content section",
      role: "section",
      properties: [{
        id: "heading",
        label: "Heading",
        valueType: "string",
        required: true,
        defaultValue: "Welcome",
      }],
      slots: [{
        id: "body",
        accepts: ["text"],
        required: true,
        minimumItems: 1,
        maximumItems: 1,
        static: false,
      }],
      variants: [{
        id: "default",
        name: "Default",
        requiredSlots: ["body"],
        defaults: { heading: "Welcome" },
      }],
      defaultVariantId: "default",
      responsivePolicy: "standard-flow",
      commerceBindingIds: [],
      customization: {
        allowVariantChange: true,
        allowSlotReorder: false,
        allowBlocks: false,
        allowFreeform: false,
        editableProperties: ["heading"],
        editableSlots: ["body"],
      },
      a11y: {
        landmark: "section",
        accessibleNameProperty: "heading",
        requiredAltSlots: [],
        requiresHeading: true,
      },
    },
  },
});

const blueprintIntegrity = (resourceType: StorefrontResourceType): string => {
  const digit = Math.max(1, [
    "home", "product", "collection", "page", "blog", "cart", "search", "404",
  ].indexOf(resourceType) + 1).toString(16);
  return `sha256:${digit.repeat(64)}`;
};

export const createBlueprint = (
  resourceType: StorefrontResourceType,
): TemplateBlueprint => ({
  kind: "template-blueprint",
  id: `${resourceType === "404" ? "not-found" : resourceType}-blueprint`,
  version: "1.0.0",
  integrity: blueprintIntegrity(resourceType),
  schemaVersion: 1,
  name: `${resourceType} blueprint`,
  resourceType,
  extends: null,
  sections: [{
    path: semanticPath(`${STOREFRONT_RESOURCE_SEMANTIC_PREFIXES[resourceType]}.main`),
    componentId: "content-section",
    variantId: "default",
    properties: { heading: "Welcome" },
    slots: [{ slotId: "body", value: "Body" }],
    bindingIds: [],
  }],
  globalRegions: [],
  bindings: [],
  compositionPatches: [],
  requiredCapabilities: [],
});

export const createStoreKit = (): StoreKit => {
  const resourceTypes = [
    "home", "product", "collection", "page", "blog", "cart", "search", "404",
  ] as const;
  const blueprints = Object.fromEntries(resourceTypes.map((resourceType) => {
    const blueprint = createBlueprint(resourceType);
    return [resourceType, {
      id: blueprint.id,
      version: blueprint.version,
      integrity: blueprint.integrity,
    }];
  })) as StoreKit["lockfile"]["blueprints"];
  return {
    kind: "store-kit",
    id: "professional-store",
    version: "1.0.0",
    integrity: HASH_C,
    schemaVersion: 1,
    name: "Professional Store",
    description: "Exact, installable fixture.",
    releaseState: "released",
    defaultPresetId: "warm",
    requiredCapabilities: [],
    optionalCapabilities: [],
    lockfile: {
      designPack: { id: "professional-core", version: "1.0.0", integrity: HASH_A },
      componentLibrary: { id: "professional-components", version: "1.0.0", integrity: HASH_B },
      blueprints,
      engineSchemaVersion: 1,
      tokenSchemaVersion: "2025.10",
      migrationIds: [],
      capabilityPolicyVersion: "1.0.0",
    },
  };
};

export const createRegistry = (): AdaptiveCommerceRegistry => {
  const registry = new AdaptiveCommerceRegistry({
    engineSchemaVersion: 1,
    tokenSchemaVersion: "2025.10",
    capabilityPolicyVersion: "1.0.0",
    supportedCapabilities: [],
  });
  registry.registerDesignPack(createDesignPack());
  registry.registerComponentLibrary(createComponentLibrary());
  (["home", "product", "collection", "page", "blog", "cart", "search", "404"] as const)
    .forEach((resourceType) => registry.registerTemplateBlueprint(createBlueprint(resourceType)));
  registry.registerStoreKit(createStoreKit());
  return registry;
};

export const createBaseDocument = (): SemanticStorefrontDocument => ({
  schemaVersion: 1,
  revisionId: "base-v1",
  baseHash: HASH_D,
  values: {
    [semanticPath("home.hero.heading")]: "Original heading",
    [semanticPath("home.hero.body")]: "Original body",
  },
  collections: {
    [semanticPath("home.featured.items")]: {
      order: ["a", "b", "c"],
      items: { a: "Alpha", b: "Beta", c: "Gamma" },
    },
  },
});

export const createPatch = (
  operations: MerchantPatch["operations"],
  overrides: Partial<MerchantPatch> = {},
): MerchantPatch => ({
  id: "patch-one",
  storeId: "store-one",
  baseRevisionId: "base-v1",
  sequence: 1,
  status: "active",
  operations,
  createdAt: "2026-08-21T10:00:00.000Z",
  createdBy: "merchant-one",
  ...overrides,
});

export const createBinding = (): CommerceBinding => ({
  id: "hero-title",
  source: { kind: "product", selector: "featured" },
  field: "title",
  target: { path: semanticPath("home.hero"), property: "text" },
  required: false,
});

export const createInstallationRequest = (): StoreKitInstallationRequest => ({
  storeId: "store-one",
  storeKitId: "professional-store",
  storeKitVersion: "1.0.0",
  presetId: null,
  expectedInstallationRevision: 3,
  idempotencyKey: "install-store-one-v1",
  baseDocument: createBaseDocument(),
  merchantPatches: [createPatch([{ op: "set", target: semanticPath("home.hero.heading"), value: "Merchant heading" }])],
  commerceBindings: [createBinding()],
  runtimeArtifactId: "artifact-one",
  runtimeArtifactHash: HASH_A,
  requestedAt: "2026-08-21T10:05:00.000Z",
});
