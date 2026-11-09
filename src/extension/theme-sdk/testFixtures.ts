import {
  STOREFRONT_RESOURCE_TYPES,
  semanticPath,
  type StorefrontResourceType,
} from "@/adaptive-commerce/contracts";
import {
  createBaseDocument,
  createBlueprint,
  createComponentLibrary,
  createDesignPack,
  createPatch,
  createStoreKit,
} from "@/adaptive-commerce/testing/fixtures";
import type { ExtensionGrant } from "@/extension/app-block";
import type { ThemeSdkPackage } from "./contracts";
import { themePackageIntegrity } from "./ThemeSdkPackageValidator";

export const createThemeSdkPackage = (): ThemeSdkPackage => {
  const designPack = createDesignPack();
  designPack.integrity = themePackageIntegrity(designPack);
  const componentLibrary = createComponentLibrary();
  componentLibrary.integrity = themePackageIntegrity(componentLibrary);
  const blueprints = Object.fromEntries(STOREFRONT_RESOURCE_TYPES.map((resourceType) => {
    const blueprint = createBlueprint(resourceType);
    blueprint.integrity = themePackageIntegrity(blueprint);
    return [resourceType, blueprint];
  })) as Record<StorefrontResourceType, ReturnType<typeof createBlueprint>>;
  const storeKit = createStoreKit();
  storeKit.lockfile.designPack = {
    id: designPack.id,
    version: designPack.version,
    integrity: designPack.integrity,
  };
  storeKit.lockfile.componentLibrary = {
    id: componentLibrary.id,
    version: componentLibrary.version,
    integrity: componentLibrary.integrity,
  };
  STOREFRONT_RESOURCE_TYPES.forEach((resourceType) => {
    storeKit.lockfile.blueprints[resourceType] = {
      id: blueprints[resourceType].id,
      version: blueprints[resourceType].version,
      integrity: blueprints[resourceType].integrity,
    };
  });
  storeKit.integrity = themePackageIntegrity(storeKit);
  const oldBase = createBaseDocument();
  const newBase = createBaseDocument();
  newBase.revisionId = "base-v2";
  const candidate = structuredClone(newBase);
  candidate.values[semanticPath("home.hero.heading")] = "Merchant heading";
  return {
    kind: "storeblink-theme-sdk-package",
    formatVersion: 1,
    manifest: {
      kind: "storeblink-extension",
      schemaVersion: 1,
      id: storeKit.id,
      version: storeKit.version,
      publisherId: "storeblink-sdk",
      name: "Professional Store",
      packageType: "theme",
      trustLevel: "declarative",
      namespace: `theme/${storeKit.id}`,
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
      storeKit: {
        id: storeKit.id,
        version: storeKit.version,
        integrity: storeKit.integrity,
      },
      appBlocks: [],
      assets: [],
    },
    designPack,
    componentLibrary,
    blueprints,
    storeKit,
    migrationFixtures: [{
      id: "preserve-heading",
      oldBase,
      newBase,
      merchantPatches: [createPatch([{
        op: "set",
        target: semanticPath("home.hero.heading"),
        value: "Merchant heading",
      }])],
      renames: [],
      expected: {
        status: "merged",
        publishable: true,
        candidate,
        conflictCount: 0,
      },
    }],
  };
};

export const createThemeGrant = (): ExtensionGrant => ({
  kind: "storeblink-extension-grant",
  schemaVersion: 1,
  extensionId: "professional-store",
  extensionVersion: "1.0.0",
  trustLevel: "declarative",
  grantedCapabilities: [],
  quotas: {
    maxBlocks: 0,
    maxMessageBytes: 4_096,
    maxDataBytes: 4_096,
    maxActionsPerMinute: 0,
    maxViewElements: 10,
  },
  status: "active",
  issuedAt: "2026-01-01T00:00:00.000Z",
  expiresAt: null,
  revokedAt: null,
  revocationReason: null,
});
