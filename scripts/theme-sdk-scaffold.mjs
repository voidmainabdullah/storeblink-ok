import { createHash } from "node:crypto";

export const THEME_RESOURCE_TYPES = [
  "home",
  "product",
  "collection",
  "page",
  "blog",
  "cart",
  "search",
  "404",
];

export const RESOURCE_PREFIX = Object.freeze({
  home: "home",
  product: "product",
  collection: "collection",
  page: "page",
  blog: "blog",
  cart: "cart",
  search: "search",
  "404": "not-found",
});

export const canonicalize = (value) => {
  if (value === null || typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new Error("Theme package contains a non-finite number.");
    return Object.is(value, -0) ? 0 : value;
  }
  if (Array.isArray(value)) return value.map(canonicalize);
  if (!value || typeof value !== "object" || Object.getPrototypeOf(value) !== Object.prototype) {
    throw new Error("Theme package must contain plain JSON values only.");
  }
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonicalize(value[key])]));
};

export const canonicalJson = (value) => JSON.stringify(canonicalize(value));
export const sha256 = (value) => `sha256:${createHash("sha256").update(
  typeof value === "string" || Buffer.isBuffer(value) ? value : canonicalJson(value),
).digest("hex")}`;

export const withIntegrity = (payload) => ({ ...payload, integrity: sha256(payload) });
const reference = (value) => ({ id: value.id, version: value.version, integrity: value.integrity });

const createDesignPack = (id, name) => withIntegrity({
  kind: "design-pack",
  id: `${id}-design`,
  version: "1.0.0",
  schemaVersion: 1,
  tokenSchemaVersion: "2025.10",
  name: `${name} Design Pack`,
  description: `Design tokens for ${name}.`,
  tokens: {
    primitive: {
      "color.ink": { $type: "color", $value: "#171717" },
      "color.paper": { $type: "color", $value: "#ffffff" },
      "space.section": { $type: "dimension", $value: "clamp(2rem, 5vw, 5rem)" },
    },
    semantic: {
      "color.text": { $ref: "primitive:color.ink" },
      "color.surface": { $ref: "primitive:color.paper" },
      "space.section": { $ref: "primitive:space.section" },
    },
    component: {
      "section.foreground": { $ref: "semantic:color.text" },
      "section.background": { $ref: "semantic:color.surface" },
      "section.spacing": { $ref: "semantic:space.section" },
    },
  },
  presets: [{ id: "default", name: "Default", overrides: [] }],
});

const createComponentLibrary = (id, name) => withIntegrity({
  kind: "component-library",
  id: `${id}-components`,
  version: "1.0.0",
  schemaVersion: 1,
  name: `${name} Components`,
  components: {
    "content-section": {
      id: "content-section",
      version: "1.0.0",
      name: "Content section",
      role: "section",
      properties: [{ id: "heading", label: "Heading", valueType: "string", required: true, defaultValue: "Welcome" }],
      slots: [{ id: "body", accepts: ["text"], required: true, minimumItems: 1, maximumItems: 1, static: false }],
      variants: [{ id: "default", name: "Default", requiredSlots: ["body"], defaults: { heading: "Welcome" } }],
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

const createBlueprint = (id, resourceType) => withIntegrity({
  kind: "template-blueprint",
  id: `${id}-${resourceType === "404" ? "not-found" : resourceType}`,
  version: "1.0.0",
  schemaVersion: 1,
  name: `${resourceType === "404" ? "Not found" : resourceType} template`,
  resourceType,
  extends: null,
  sections: [{
    path: `${RESOURCE_PREFIX[resourceType]}.main`,
    componentId: "content-section",
    variantId: "default",
    properties: { heading: resourceType === "404" ? "Page not found" : "Welcome" },
    slots: [{ slotId: "body", value: "Replace this with merchant content." }],
    bindingIds: [],
  }],
  globalRegions: [],
  bindings: [],
  compositionPatches: [],
  requiredCapabilities: [],
});

const createMigrationFixture = () => {
  const oldPayload = {
    schemaVersion: 1,
    revisionId: "base-v1",
    values: { "home.main.heading": "Welcome" },
    collections: {},
  };
  const newPayload = { ...oldPayload, revisionId: "base-v2" };
  const oldBase = { ...oldPayload, baseHash: sha256(oldPayload) };
  const newBase = { ...newPayload, baseHash: sha256(newPayload) };
  return {
    id: "preserve-merchant-heading",
    oldBase,
    newBase,
    merchantPatches: [{
      id: "merchant-heading",
      storeId: "fixture-store",
      baseRevisionId: "base-v1",
      sequence: 1,
      status: "active",
      operations: [{ op: "set", target: "home.main.heading", value: "Merchant heading" }],
      createdAt: "2026-01-01T00:00:00.000Z",
      createdBy: "theme-sdk-fixture",
    }],
    renames: [],
    expected: {
      status: "merged",
      publishable: true,
      candidate: { ...newBase, values: { "home.main.heading": "Merchant heading" } },
      conflictCount: 0,
    },
  };
};

export const createThemeScaffoldData = ({ id, name }) => {
  const designPack = createDesignPack(id, name);
  const componentLibrary = createComponentLibrary(id, name);
  const blueprints = Object.fromEntries(THEME_RESOURCE_TYPES.map((resourceType) => [
    resourceType,
    createBlueprint(id, resourceType),
  ]));
  const storeKit = withIntegrity({
    kind: "store-kit",
    id,
    version: "1.0.0",
    schemaVersion: 1,
    name,
    description: `${name} exact StoreKit.`,
    releaseState: "released",
    defaultPresetId: "default",
    requiredCapabilities: [],
    optionalCapabilities: [],
    lockfile: {
      designPack: reference(designPack),
      componentLibrary: reference(componentLibrary),
      blueprints: Object.fromEntries(THEME_RESOURCE_TYPES.map((resourceType) => [
        resourceType,
        reference(blueprints[resourceType]),
      ])),
      engineSchemaVersion: 1,
      tokenSchemaVersion: "2025.10",
      migrationIds: ["preserve-merchant-heading"],
      capabilityPolicyVersion: "1.0.0",
    },
  });
  const manifest = {
    kind: "storeblink-extension",
    schemaVersion: 1,
    id,
    version: "1.0.0",
    publisherId: "theme-sdk",
    name,
    packageType: "theme",
    trustLevel: "declarative",
    namespace: `theme/${id}`,
    requestedCapabilities: ["theme/content.read"],
    grantedCapabilities: [],
    requestedQuotas: {
      maxBlocks: 0,
      maxMessageBytes: 4_096,
      maxDataBytes: 4_096,
      maxActionsPerMinute: 0,
      maxViewElements: 10,
    },
    compiledReact: false,
    storeKit: reference(storeKit),
    appBlocks: [],
    assets: [],
  };
  const migrationFixtures = [createMigrationFixture()];
  return {
    manifest,
    designPack,
    componentLibrary,
    blueprints,
    storeKit,
    migrationFixtures,
  };
};

export const assembleThemePackage = (data) => ({
  kind: "storeblink-theme-sdk-package",
  formatVersion: 1,
  manifest: data.manifest,
  designPack: data.designPack,
  componentLibrary: data.componentLibrary,
  blueprints: data.blueprints,
  storeKit: data.storeKit,
  migrationFixtures: data.migrationFixtures,
});
