import { describe, expect, it } from "vitest";
import { STOREFRONT_RESOURCE_TYPES } from "@/adaptive-commerce/contracts";
import {
  BUILT_IN_THEME_STORE_KITS,
  BUILT_IN_STORE_KIT,
  createBuiltInAdaptiveCommerceCatalog,
} from "./builtInStoreKit";

describe("built-in adaptive commerce catalog", () => {
  it("registers one exact, installable pin for every storefront resource", () => {
    const catalog = createBuiltInAdaptiveCommerceCatalog();
    const report = catalog.registry.validateInstallable(
      BUILT_IN_STORE_KIT.id,
      BUILT_IN_STORE_KIT.version,
    );

    expect(report).toEqual({ valid: true, issues: [] });
    const resolved = catalog.registry.resolveInstallable(
      BUILT_IN_STORE_KIT.id,
      BUILT_IN_STORE_KIT.version,
    );
    expect(new Set(Object.keys(resolved.blueprints))).toEqual(
      new Set(STOREFRONT_RESOURCE_TYPES),
    );
    STOREFRONT_RESOURCE_TYPES.forEach((resourceType) => {
      expect(resolved.blueprints[resourceType].resourceType).toBe(resourceType);
      expect(resolved.storeKit.lockfile.blueprints[resourceType]).toEqual({
        id: resolved.blueprints[resourceType].id,
        version: resolved.blueprints[resourceType].version,
        integrity: resolved.blueprints[resourceType].integrity,
      });
    });
  });

  it("returns isolated fixture values", () => {
    const first = createBuiltInAdaptiveCommerceCatalog();
    const second = createBuiltInAdaptiveCommerceCatalog();
    first.storeDefinition.storeId = "changed";

    expect(second.storeDefinition.storeId).toBe("fixture-store");
  });

  it("registers the four installed themes as released, full-route StoreKits", () => {
    const catalog = createBuiltInAdaptiveCommerceCatalog();

    Object.entries(BUILT_IN_THEME_STORE_KITS).forEach(([themeId, storeKit]) => {
      expect(storeKit).toMatchObject({
        id: themeId,
        version: "1.0.0",
        releaseState: "released",
        defaultPresetId: themeId,
      });
      expect(catalog.registry.validateInstallable(themeId, storeKit.version))
        .toEqual({ valid: true, issues: [] });
      expect(new Set(Object.keys(storeKit.lockfile.blueprints)))
        .toEqual(new Set(STOREFRONT_RESOURCE_TYPES));
    });
  });
});
