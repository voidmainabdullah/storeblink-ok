import type {
  DesignPack,
  DesignTokenOverride,
  JsonValue,
  StoreDefinition,
  StoreKit,
  StorefrontResourceType,
  TemplateBlueprint,
  VersionedPackageRef,
} from "@/adaptive-commerce";
import { designPackSchema, tokenAddress, tokenLiteral } from "../contracts/designPack";
import { semanticPathSchema } from "../contracts/identifiers";
import { storeDefinitionSchema } from "../contracts/storeDefinition";
import { storeKitSchema } from "../contracts/storeKit";
import { AdaptiveCommerceRegistry } from "../registry";
import { BUILT_IN_BLUEPRINT_BY_RESOURCE, BUILT_IN_STOREFRONT_BLUEPRINTS } from "../blueprints";
import { STOREFRONT_CERTIFIED_COMPONENT_LIBRARY } from "../components";
import { artifactHashFor } from "../compiler/sha256";
import { cloneAndFreeze } from "../compiler/immutable";
import { seedStorefrontSectionControls } from "../compiler/sectionControls";

export const BUILT_IN_ENGINE_SCHEMA_VERSION = 1;
export const BUILT_IN_TOKEN_SCHEMA_VERSION = "2025.10" as const;
export const BUILT_IN_CAPABILITY_POLICY_VERSION = "1.0.0";
export const BUILT_IN_COMMERCE_CAPABILITIES = [
  "commerce-bindings",
  "responsive-layout",
] as const;

const referenceFor = (
  value: Pick<VersionedPackageRef, "id" | "version" | "integrity">,
): VersionedPackageRef => ({
  id: value.id,
  version: value.version,
  integrity: value.integrity,
});

const ref = (address: string) => ({
  $ref: tokenAddress(
    address.slice(0, address.indexOf(":")) as "primitive" | "semantic" | "component",
    address.slice(address.indexOf(":") + 1),
  ),
});

const designPackPayload = {
  kind: "design-pack" as const,
  id: "storeblink-foundation",
  version: "1.0.0",
  schemaVersion: 1,
  tokenSchemaVersion: BUILT_IN_TOKEN_SCHEMA_VERSION,
  name: "StoreBlink Foundation",
  description: "A restrained, accessible commerce foundation with intentional hierarchy and no decorative shadow dependence.",
  tokens: {
    primitive: {
      "color.paper": tokenLiteral("color", "#ffffff"),
      "color.ink": tokenLiteral("color", "#171717"),
      "color.muted": tokenLiteral("color", "#666666"),
      "color.line": tokenLiteral("color", "#deded8"),
      "color.accent": tokenLiteral("color", "#4338ca"),
      "color.soft": tokenLiteral("color", "#f6f6f2"),
      "space.xs": tokenLiteral("dimension", "0.5rem"),
      "space.sm": tokenLiteral("dimension", "0.75rem"),
      "space.md": tokenLiteral("dimension", "1rem"),
      "space.lg": tokenLiteral("dimension", "1.5rem"),
      "space.xl": tokenLiteral("dimension", "clamp(2rem, 5vw, 5rem)"),
      "radius.control": tokenLiteral("dimension", "0.5rem"),
      "radius.panel": tokenLiteral("dimension", "0.75rem"),
      "type.body": tokenLiteral("fontFamily", ["Inter", "system-ui", "sans-serif"]),
      "type.display": tokenLiteral("fontFamily", ["Inter", "system-ui", "sans-serif"]),
      "type.regular": tokenLiteral("fontWeight", 400),
      "type.strong": tokenLiteral("fontWeight", 650),
      "motion.quick": tokenLiteral("duration", "160ms"),
      "motion.standard": tokenLiteral("duration", "240ms"),
      "motion.ease": tokenLiteral("cubicBezier", [0.2, 0, 0, 1]),
    },
    semantic: {
      "color.surface": ref("primitive:color.paper"),
      "color.surface-muted": ref("primitive:color.soft"),
      "color.text": ref("primitive:color.ink"),
      "color.text-muted": ref("primitive:color.muted"),
      "color.border": ref("primitive:color.line"),
      "color.action": ref("primitive:color.accent"),
      "space.inline": ref("primitive:space.md"),
      "space.stack": ref("primitive:space.lg"),
      "space.section": ref("primitive:space.xl"),
      "radius.control": ref("primitive:radius.control"),
      "radius.panel": ref("primitive:radius.panel"),
      "type.body": ref("primitive:type.body"),
      "type.display": ref("primitive:type.display"),
      "type.regular": ref("primitive:type.regular"),
      "type.strong": ref("primitive:type.strong"),
      "motion.quick": ref("primitive:motion.quick"),
      "motion.standard": ref("primitive:motion.standard"),
      "motion.ease": ref("primitive:motion.ease"),
    },
    component: {
      "header.background": ref("semantic:color.surface"),
      "header.foreground": ref("semantic:color.text"),
      "header.border": ref("semantic:color.border"),
      "button.background": ref("semantic:color.action"),
      "button.foreground": ref("primitive:color.paper"),
      "button.radius": ref("semantic:radius.control"),
      "card.background": ref("semantic:color.surface"),
      "card.border": ref("semantic:color.border"),
      "card.radius": ref("semantic:radius.panel"),
      "section.gap": ref("semantic:space.section"),
    },
  },
  presets: [
    {
      id: "clean-neutral",
      name: "Clean neutral",
      overrides: [],
    },
    {
      id: "warm-editorial",
      name: "Warm editorial",
      overrides: [
        {
          address: tokenAddress("semantic", "color.surface"),
          value: tokenLiteral("color", "#fffdf8"),
        },
        {
          address: tokenAddress("semantic", "color.surface-muted"),
          value: tokenLiteral("color", "#f4eee3"),
        },
        {
          address: tokenAddress("semantic", "color.action"),
          value: tokenLiteral("color", "#8a351f"),
        },
      ] satisfies DesignTokenOverride[],
    },
    {
      id: "basic",
      name: "Basic",
      overrides: [
        { address: tokenAddress("semantic", "color.surface"), value: tokenLiteral("color", "#ffffff") },
        { address: tokenAddress("semantic", "color.surface-muted"), value: tokenLiteral("color", "#f5f7f8") },
        { address: tokenAddress("semantic", "color.text"), value: tokenLiteral("color", "#15171a") },
        { address: tokenAddress("semantic", "color.text-muted"), value: tokenLiteral("color", "#5f6670") },
        { address: tokenAddress("semantic", "color.border"), value: tokenLiteral("color", "#d7dce1") },
        { address: tokenAddress("semantic", "color.action"), value: tokenLiteral("color", "#1f2937") },
        { address: tokenAddress("semantic", "radius.control"), value: tokenLiteral("dimension", "0.375rem") },
        { address: tokenAddress("semantic", "radius.panel"), value: tokenLiteral("dimension", "0.5rem") },
      ] satisfies DesignTokenOverride[],
    },
    {
      id: "atelier",
      name: "Atelier",
      overrides: [
        { address: tokenAddress("semantic", "color.surface"), value: tokenLiteral("color", "#fffaf2") },
        { address: tokenAddress("semantic", "color.surface-muted"), value: tokenLiteral("color", "#f3eadc") },
        { address: tokenAddress("semantic", "color.text"), value: tokenLiteral("color", "#211b16") },
        { address: tokenAddress("semantic", "color.text-muted"), value: tokenLiteral("color", "#6c5c4d") },
        { address: tokenAddress("semantic", "color.border"), value: tokenLiteral("color", "#d8c7ae") },
        { address: tokenAddress("semantic", "color.action"), value: tokenLiteral("color", "#8a351f") },
        { address: tokenAddress("semantic", "type.display"), value: tokenLiteral("fontFamily", ["Georgia", "Times New Roman", "serif"]) },
        { address: tokenAddress("semantic", "radius.control"), value: tokenLiteral("dimension", "0.125rem") },
        { address: tokenAddress("semantic", "radius.panel"), value: tokenLiteral("dimension", "0.25rem") },
      ] satisfies DesignTokenOverride[],
    },
    {
      id: "spark-fashion",
      name: "Spark Fashion",
      overrides: [
        { address: tokenAddress("semantic", "color.surface"), value: tokenLiteral("color", "#ffffff") },
        { address: tokenAddress("semantic", "color.surface-muted"), value: tokenLiteral("color", "#f4f0ff") },
        { address: tokenAddress("semantic", "color.text"), value: tokenLiteral("color", "#181325") },
        { address: tokenAddress("semantic", "color.text-muted"), value: tokenLiteral("color", "#625a70") },
        { address: tokenAddress("semantic", "color.border"), value: tokenLiteral("color", "#d9cfee") },
        { address: tokenAddress("semantic", "color.action"), value: tokenLiteral("color", "#6d28d9") },
        { address: tokenAddress("semantic", "type.display"), value: tokenLiteral("fontFamily", ["Space Grotesk", "Inter", "sans-serif"]) },
        { address: tokenAddress("semantic", "radius.control"), value: tokenLiteral("dimension", "0.75rem") },
        { address: tokenAddress("semantic", "radius.panel"), value: tokenLiteral("dimension", "1rem") },
      ] satisfies DesignTokenOverride[],
    },
    {
      id: "noir-chrono",
      name: "Noir Chrono",
      overrides: [
        { address: tokenAddress("semantic", "color.surface"), value: tokenLiteral("color", "#0f0f11") },
        { address: tokenAddress("semantic", "color.surface-muted"), value: tokenLiteral("color", "#1a1a1e") },
        { address: tokenAddress("semantic", "color.text"), value: tokenLiteral("color", "#f5f3ed") },
        { address: tokenAddress("semantic", "color.text-muted"), value: tokenLiteral("color", "#b4b0a7") },
        { address: tokenAddress("semantic", "color.border"), value: tokenLiteral("color", "#38373c") },
        { address: tokenAddress("semantic", "color.action"), value: tokenLiteral("color", "#d6b85d") },
        { address: tokenAddress("semantic", "type.display"), value: tokenLiteral("fontFamily", ["Inter", "Arial", "sans-serif"]) },
        { address: tokenAddress("semantic", "radius.control"), value: tokenLiteral("dimension", "0.25rem") },
        { address: tokenAddress("semantic", "radius.panel"), value: tokenLiteral("dimension", "0.375rem") },
        { address: tokenAddress("component", "button.foreground"), value: tokenLiteral("color", "#0f0f11") },
      ] satisfies DesignTokenOverride[],
    },
  ],
};

export const BUILT_IN_DESIGN_PACK: DesignPack = cloneAndFreeze(
  designPackSchema.parse({
    ...designPackPayload,
    integrity: artifactHashFor(designPackPayload),
  }),
) as DesignPack;

const blueprintAssignments = Object.fromEntries(
  Object.entries(BUILT_IN_BLUEPRINT_BY_RESOURCE).map(([resourceType, blueprint]) => [
    resourceType,
    referenceFor(blueprint),
  ]),
) as Record<StorefrontResourceType, VersionedPackageRef>;

type BuiltInStoreKitInput = Readonly<{
  id: string;
  name: string;
  description: string;
  defaultPresetId: string;
}>;

const createStoreKit = (input: BuiltInStoreKitInput): StoreKit => {
  const payload = {
    kind: "store-kit" as const,
    id: input.id,
    version: "1.0.0",
    schemaVersion: 1,
    name: input.name,
    description: input.description,
    releaseState: "released" as const,
    defaultPresetId: input.defaultPresetId,
    requiredCapabilities: [...BUILT_IN_COMMERCE_CAPABILITIES],
    optionalCapabilities: [],
    lockfile: {
      designPack: referenceFor(BUILT_IN_DESIGN_PACK),
      componentLibrary: referenceFor(STOREFRONT_CERTIFIED_COMPONENT_LIBRARY),
      blueprints: structuredClone(blueprintAssignments),
      engineSchemaVersion: BUILT_IN_ENGINE_SCHEMA_VERSION,
      tokenSchemaVersion: BUILT_IN_TOKEN_SCHEMA_VERSION,
      migrationIds: [],
      capabilityPolicyVersion: BUILT_IN_CAPABILITY_POLICY_VERSION,
    },
  };
  return cloneAndFreeze(storeKitSchema.parse({
    ...payload,
    integrity: artifactHashFor(payload),
  })) as StoreKit;
};

export const BUILT_IN_STORE_KIT = createStoreKit({
  id: "storeblink-adaptive-commerce",
  name: "StoreBlink Adaptive Commerce",
  description: "A complete certified StoreKit for every public storefront resource.",
  defaultPresetId: "clean-neutral",
});

export const BASIC_STORE_KIT = createStoreKit({
  id: "basic",
  name: "Basic",
  description: "A clear, dependable storefront with neutral hierarchy and compact geometry.",
  defaultPresetId: "basic",
});

export const ATELIER_STORE_KIT = createStoreKit({
  id: "atelier",
  name: "Atelier",
  description: "A warm editorial storefront with refined typography and restrained geometry.",
  defaultPresetId: "atelier",
});

export const SPARK_FASHION_STORE_KIT = createStoreKit({
  id: "spark-fashion",
  name: "Spark Fashion",
  description: "A confident fashion storefront with energetic contrast and generous rhythm.",
  defaultPresetId: "spark-fashion",
});

export const NOIR_CHRONO_STORE_KIT = createStoreKit({
  id: "noir-chrono",
  name: "Noir Chrono",
  description: "A precise dark luxury storefront with high legibility and metallic emphasis.",
  defaultPresetId: "noir-chrono",
});

export const BUILT_IN_THEME_STORE_KITS = {
  basic: BASIC_STORE_KIT,
  atelier: ATELIER_STORE_KIT,
  "spark-fashion": SPARK_FASHION_STORE_KIT,
  "noir-chrono": NOIR_CHRONO_STORE_KIT,
} as const;

export type BuiltInThemeStoreKitId = keyof typeof BUILT_IN_THEME_STORE_KITS;

export const BUILT_IN_RELEASED_STORE_KITS = [
  BUILT_IN_STORE_KIT,
  ...Object.values(BUILT_IN_THEME_STORE_KITS),
] as const;

const fixtureBasePayload = {
  schemaVersion: 1,
  revisionId: "fixture-base-v1",
  values: {
    [semanticPathSchema.parse("global.store-name")]: "StoreBlink Demo",
    [semanticPathSchema.parse("home.hero.heading")]: "Thoughtful goods for everyday life",
    [semanticPathSchema.parse("home.hero.description")]: "A polished storefront built from certified commerce primitives.",
    [semanticPathSchema.parse("product.information.note")]: "Designed for a smooth, dependable shopping flow.",
  } as Record<string, JsonValue>,
  collections: {},
};

export const createBuiltInStoreDefinition = (
  storeKit: StoreKit = BUILT_IN_STORE_KIT,
  storeId = `fixture-store-${storeKit.id}`,
): StoreDefinition => structuredClone(storeDefinitionSchema.parse({
    kind: "store-definition",
    schemaVersion: 1,
    storeId,
    installationId: `fixture-installation-${storeKit.id}`,
    storeKit: referenceFor(storeKit),
    locale: "en-US",
    currency: "USD",
    base: seedStorefrontSectionControls({
      ...fixtureBasePayload,
      baseHash: artifactHashFor(fixtureBasePayload),
    }, BUILT_IN_BLUEPRINT_BY_RESOURCE),
    merchantPatchIds: [],
    designTokens: {
      presetId: storeKit.defaultPresetId,
      overrides: [],
    },
    commerceBindings: [],
  }));

export const BUILT_IN_STORE_DEFINITION: StoreDefinition = cloneAndFreeze(
  createBuiltInStoreDefinition(BUILT_IN_STORE_KIT, "fixture-store"),
) as StoreDefinition;

export const BUILT_IN_THEME_STORE_DEFINITIONS = Object.fromEntries(
  Object.entries(BUILT_IN_THEME_STORE_KITS).map(([themeId, storeKit]) => [
    themeId,
    createBuiltInStoreDefinition(storeKit),
  ]),
) as Record<BuiltInThemeStoreKitId, StoreDefinition>;

export type BuiltInAdaptiveCommerceCatalog = Readonly<{
  registry: AdaptiveCommerceRegistry;
  designPack: DesignPack;
  componentLibrary: typeof STOREFRONT_CERTIFIED_COMPONENT_LIBRARY;
  blueprints: readonly TemplateBlueprint[];
  storeKit: StoreKit;
  storeKits: readonly StoreKit[];
  themeStoreKits: Readonly<Record<BuiltInThemeStoreKitId, StoreKit>>;
  storeDefinition: StoreDefinition;
  themeStoreDefinitions: Readonly<Record<BuiltInThemeStoreKitId, StoreDefinition>>;
}>;

/** Creates an isolated, fully registered catalog suitable for compile/evaluation fixtures. */
export const createBuiltInAdaptiveCommerceCatalog = (): BuiltInAdaptiveCommerceCatalog => {
  const registry = new AdaptiveCommerceRegistry({
    engineSchemaVersion: BUILT_IN_ENGINE_SCHEMA_VERSION,
    tokenSchemaVersion: BUILT_IN_TOKEN_SCHEMA_VERSION,
    capabilityPolicyVersion: BUILT_IN_CAPABILITY_POLICY_VERSION,
    supportedCapabilities: BUILT_IN_COMMERCE_CAPABILITIES,
  });
  registry.registerDesignPack(BUILT_IN_DESIGN_PACK);
  registry.registerComponentLibrary(STOREFRONT_CERTIFIED_COMPONENT_LIBRARY);
  BUILT_IN_STOREFRONT_BLUEPRINTS.forEach((blueprint) =>
    registry.registerTemplateBlueprint(blueprint));
  BUILT_IN_RELEASED_STORE_KITS.forEach((storeKit) =>
    registry.registerStoreKit(storeKit));
  return {
    registry,
    designPack: structuredClone(BUILT_IN_DESIGN_PACK),
    componentLibrary: structuredClone(STOREFRONT_CERTIFIED_COMPONENT_LIBRARY),
    blueprints: structuredClone(BUILT_IN_STOREFRONT_BLUEPRINTS),
    storeKit: structuredClone(BUILT_IN_STORE_KIT),
    storeKits: structuredClone(BUILT_IN_RELEASED_STORE_KITS),
    themeStoreKits: structuredClone(BUILT_IN_THEME_STORE_KITS),
    storeDefinition: structuredClone(BUILT_IN_STORE_DEFINITION),
    themeStoreDefinitions: structuredClone(BUILT_IN_THEME_STORE_DEFINITIONS),
  };
};
