import { describe, expect, it } from "vitest";
import {
  STOREFRONT_RESOURCE_TYPES,
  type VersionedPackageRef,
} from "@/adaptive-commerce/contracts";
import { TemplateBlueprintCatalog } from "./TemplateBlueprintCatalog";
import {
  BUILT_IN_BLUEPRINT_BY_RESOURCE,
  BUILT_IN_STOREFRONT_BLUEPRINTS,
} from "./builtInBlueprints";

describe("built-in storefront blueprints", () => {
  it("covers every required storefront resource with real sections", () => {
    expect(BUILT_IN_STOREFRONT_BLUEPRINTS.map((entry) => entry.resourceType)).toEqual(
      STOREFRONT_RESOURCE_TYPES,
    );
    for (const resourceType of STOREFRONT_RESOURCE_TYPES) {
      const blueprint = BUILT_IN_BLUEPRINT_BY_RESOURCE[resourceType];
      expect(blueprint.resourceType).toBe(resourceType);
      expect(blueprint.sections.length).toBeGreaterThan(0);
      expect(blueprint.globalRegions.map((region) => region.slot)).toEqual([
        "header",
        "footer",
      ]);
      expect(new Set(blueprint.sections.map((entry) => entry.path)).size).toBe(
        blueprint.sections.length,
      );
      expect(blueprint.integrity).toMatch(/^sha256:[a-f0-9]{64}$/);
    }
  });

  it("uses dedicated commerce components instead of generic route fallbacks", () => {
    expect(BUILT_IN_BLUEPRINT_BY_RESOURCE.product.sections.map((entry) => entry.componentId))
      .toEqual(["product-gallery", "product-information", "recommendations"]);
    expect(BUILT_IN_BLUEPRINT_BY_RESOURCE.collection.sections[0].componentId)
      .toBe("collection-grid");
    expect(BUILT_IN_BLUEPRINT_BY_RESOURCE.cart.sections[0].componentId).toBe("cart");
    expect(BUILT_IN_BLUEPRINT_BY_RESOURCE.search.sections[0].componentId)
      .toBe("search-results");
    expect(BUILT_IN_BLUEPRINT_BY_RESOURCE["404"].sections[0].componentId)
      .toBe("not-found");
  });

  it("resolves only exact id, version and integrity pins", () => {
    const catalog = new TemplateBlueprintCatalog();
    BUILT_IN_STOREFRONT_BLUEPRINTS.forEach((blueprint) => catalog.register(blueprint));
    const home = BUILT_IN_BLUEPRINT_BY_RESOURCE.home;
    const reference: VersionedPackageRef = {
      id: home.id,
      version: home.version,
      integrity: home.integrity,
    };
    expect(catalog.resolve(reference)?.resourceType).toBe("home");
    expect(catalog.resolve({ ...reference, integrity: `sha256:${"0".repeat(64)}` }))
      .toBeNull();
  });
});
