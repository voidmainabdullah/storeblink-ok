import { describe, expect, it } from "vitest";
import type { MerchantPatch } from "../contracts";
import {
  routeSectionOrderSemanticPath,
  sectionControlSemanticPath,
} from "../contracts/sectionControls";
import { createBuiltInAdaptiveCommerceCatalog } from "../fixtures";
import { StorefrontCompilationError } from "./diagnostics";
import { artifactHashFor } from "./sha256";
import { StorefrontCompiler } from "./StorefrontCompiler";

const CREATED_AT = "2030-01-02T03:04:05.000Z";

describe("canonical storefront section controls", () => {
  it("seeds every certified variant, visibility, and exact route order without mutating callers", () => {
    const catalog = createBuiltInAdaptiveCommerceCatalog();
    const base = catalog.storeDefinition.base;
    const { baseHash, ...payload } = base;
    expect(baseHash).toBe(artifactHashFor(payload));
    const resolved = catalog.registry.resolveInstallable(
      catalog.storeDefinition.storeKit.id,
      catalog.storeDefinition.storeKit.version,
    );
    Object.entries(resolved.blueprints).forEach(([resourceType, blueprint]) => {
      blueprint.sections.forEach((section) => {
        expect(base.values[sectionControlSemanticPath(section.path, "variant")])
          .toBe(section.variantId);
        expect(base.values[sectionControlSemanticPath(section.path, "visible")]).toBe(true);
      });
      expect(base.collections[
        routeSectionOrderSemanticPath(resourceType as keyof typeof resolved.blueprints)
      ].order).toEqual(blueprint.sections.map((section) => section.path));
    });
  });

  it("lets normal MerchantPatch set/reorder operations make the first control edit", () => {
    const catalog = createBuiltInAdaptiveCommerceCatalog();
    const home = catalog.registry.resolveInstallable(
      catalog.storeDefinition.storeKit.id,
      catalog.storeDefinition.storeKit.version,
    ).blueprints.home;
    const [hero, products] = home.sections;
    const patch: MerchantPatch = {
      id: "section-control-edit",
      storeId: catalog.storeDefinition.storeId,
      baseRevisionId: catalog.storeDefinition.base.revisionId,
      sequence: 1,
      status: "active",
      createdAt: CREATED_AT,
      createdBy: "merchant-1",
      operations: [
        { op: "set", target: sectionControlSemanticPath(hero.path, "variant"), value: "centered" },
        {
          op: "reorder",
          target: routeSectionOrderSemanticPath("home"),
          key: products.path,
          beforeKey: hero.path,
        },
      ],
    };
    catalog.storeDefinition.merchantPatchIds = [patch.id];
    const artifact = new StorefrontCompiler().compile({
      registry: catalog.registry,
      storeDefinition: catalog.storeDefinition,
      merchantPatches: [patch],
      createdAt: CREATED_AT,
    }).artifact;
    const sections = (artifact.routes.home.document as unknown as {
      sections: Array<{ path: string; component: { variantId: string } }>;
    }).sections;
    expect(sections.map((section) => section.path)).toEqual([products.path, hero.path]);
    expect(sections[1].component.variantId).toBe("centered");
  });

  it("fails closed when a MerchantPatch hides every certified section on a route", () => {
    const catalog = createBuiltInAdaptiveCommerceCatalog();
    const home = catalog.registry.resolveInstallable(
      catalog.storeDefinition.storeKit.id,
      catalog.storeDefinition.storeKit.version,
    ).blueprints.home;
    const patch: MerchantPatch = {
      id: "hide-all-home-sections",
      storeId: catalog.storeDefinition.storeId,
      baseRevisionId: catalog.storeDefinition.base.revisionId,
      sequence: 1,
      status: "active",
      createdAt: CREATED_AT,
      createdBy: "merchant-1",
      operations: home.sections.map((section) => ({
        op: "set" as const,
        target: sectionControlSemanticPath(section.path, "visible"),
        value: false,
      })),
    };
    catalog.storeDefinition.merchantPatchIds = [patch.id];

    try {
      new StorefrontCompiler().compile({
        registry: catalog.registry,
        storeDefinition: catalog.storeDefinition,
        merchantPatches: [patch],
        createdAt: CREATED_AT,
      });
      throw new Error("Expected all-hidden route compilation to fail.");
    } catch (error) {
      expect(error).toBeInstanceOf(StorefrontCompilationError);
      expect((error as StorefrontCompilationError).diagnostics.map((diagnostic) => diagnostic.code))
        .toContain("route-visible-sections-missing");
    }
  });
});
