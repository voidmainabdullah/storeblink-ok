import { describe, expect, it } from "vitest";
import type { MerchantPatch, ResolvedStoreKit } from "@/adaptive-commerce";
import { STOREFRONT_RESOURCE_TYPES } from "../contracts";
import {
  routeSectionOrderSemanticPath,
  sectionControlSemanticPath,
} from "../contracts/sectionControls";
import { createBuiltInAdaptiveCommerceCatalog } from "../fixtures";
import { STOREFRONT_COMPILER_STAGES, StorefrontCompilationError } from "./diagnostics";
import { artifactHashFor } from "./sha256";
import { StorefrontCompiler } from "./StorefrontCompiler";

const CREATED_AT = "2030-01-02T03:04:05.000Z";

const rehashBase = (
  catalog: ReturnType<typeof createBuiltInAdaptiveCommerceCatalog>,
): void => {
  catalog.storeDefinition.base.baseHash = artifactHashFor({
    schemaVersion: catalog.storeDefinition.base.schemaVersion,
    revisionId: catalog.storeDefinition.base.revisionId,
    values: catalog.storeDefinition.base.values,
    collections: catalog.storeDefinition.base.collections,
  });
};

const registryOverride = (
  catalog: ReturnType<typeof createBuiltInAdaptiveCommerceCatalog>,
  mutate: (resolved: ResolvedStoreKit) => void,
) => ({
  getStoreKit: catalog.registry.getStoreKit.bind(catalog.registry),
  getDesignPack: catalog.registry.getDesignPack.bind(catalog.registry),
  resolveInstallable: (id: string, version: string): ResolvedStoreKit => {
    const resolved = catalog.registry.resolveInstallable(id, version);
    mutate(resolved);
    return resolved;
  },
});

describe("StorefrontCompiler", () => {
  it("compiles every route through the exact ordered pipeline into an immutable artifact", () => {
    const catalog = createBuiltInAdaptiveCommerceCatalog();
    const sourceBefore = structuredClone(catalog.storeDefinition);
    const result = new StorefrontCompiler().compile({
      registry: catalog.registry,
      storeDefinition: catalog.storeDefinition,
      createdAt: CREATED_AT,
    });

    expect(result.completedStages).toEqual(STOREFRONT_COMPILER_STAGES);
    expect(new Set(Object.keys(result.artifact.routes))).toEqual(
      new Set(STOREFRONT_RESOURCE_TYPES),
    );
    STOREFRONT_RESOURCE_TYPES.forEach((resourceType) => {
      expect(result.artifact.routes[resourceType].resourceType).toBe(resourceType);
      expect(result.artifact.routes[resourceType].document).toMatchObject({
        resourceType,
        responsive: { runtimeLayoutCompiler: false },
      });
    });
    const homeSections = (
      result.artifact.routes.home.document as unknown as {
        sections: Array<{ path: string; properties: Record<string, unknown> }>;
      }
    ).sections;
    expect(homeSections.find((section) => section.path === "home.hero")?.properties.heading)
      .toBe("Thoughtful goods for everyday life");
    expect(result.artifact.sourceHash).toMatch(/^sha256:[a-f0-9]{64}$/);
    expect(result.artifact.artifactHash).toMatch(/^sha256:[a-f0-9]{64}$/);
    const { artifactHash, ...artifactContent } = result.artifact;
    expect(artifactHash).toBe(artifactHashFor(artifactContent));
    expect(result.artifact.bindingPlans.length).toBeGreaterThan(0);
    expect(result.artifact.componentVersions["site-header"]).toBe("1.0.0");
    expect(result.artifact.extensions.executionModel).toBe("publish-time-batch");
    expect(Object.isFrozen(result.artifact)).toBe(true);
    expect(Object.isFrozen(result.artifact.routes.home)).toBe(true);
    expect(catalog.storeDefinition).toEqual(sourceBefore);
  });

  it("is deterministic across semantically identical object key order", () => {
    const firstCatalog = createBuiltInAdaptiveCommerceCatalog();
    const secondCatalog = createBuiltInAdaptiveCommerceCatalog();
    const entries = Object.entries(secondCatalog.storeDefinition.base.values).reverse();
    secondCatalog.storeDefinition.base.values = Object.fromEntries(entries) as typeof secondCatalog.storeDefinition.base.values;
    const compiler = new StorefrontCompiler();

    const first = compiler.compile({
      registry: firstCatalog.registry,
      storeDefinition: firstCatalog.storeDefinition,
      createdAt: CREATED_AT,
    });
    const second = compiler.compile({
      registry: secondCatalog.registry,
      storeDefinition: secondCatalog.storeDefinition,
      createdAt: CREATED_AT,
    });

    expect(second.artifact.sourceHash).toBe(first.artifact.sourceHash);
    expect(second.artifact.artifactHash).toBe(first.artifact.artifactHash);
    expect(second.artifact).toEqual(first.artifact);
  });

  it("applies declared merchant patches without mutating them", () => {
    const catalog = createBuiltInAdaptiveCommerceCatalog();
    catalog.storeDefinition.merchantPatchIds = ["merchant-copy"];
    const patch: MerchantPatch = {
      id: "merchant-copy",
      storeId: catalog.storeDefinition.storeId,
      baseRevisionId: catalog.storeDefinition.base.revisionId,
      sequence: 1,
      status: "active",
      operations: [{
        op: "set",
        target: "home.hero.heading" as MerchantPatch["operations"][number]["target"],
        value: "A merchant-owned heading",
      }],
      createdAt: CREATED_AT,
      createdBy: "fixture-merchant",
    };
    const patchBefore = structuredClone(patch);

    const result = new StorefrontCompiler().compile({
      registry: catalog.registry,
      storeDefinition: catalog.storeDefinition,
      merchantPatches: [patch],
      createdAt: CREATED_AT,
    });
    const content = (result.artifact.routes.home.document as Record<string, unknown>).content as {
      values: Record<string, unknown>;
    };

    expect(content.values["home.hero.heading"]).toBe("A merchant-owned heading");
    const homeSections = (
      result.artifact.routes.home.document as unknown as {
        sections: Array<{ path: string; properties: Record<string, unknown> }>;
      }
    ).sections;
    expect(homeSections.find((section) => section.path === "home.hero")?.properties.heading)
      .toBe("A merchant-owned heading");
    expect(result.artifact.extensions.appliedPatchIds).toEqual(["merchant-copy"]);
    expect(patch).toEqual(patchBefore);
  });

  it("fails closed when any required route is absent", () => {
    const catalog = createBuiltInAdaptiveCommerceCatalog();
    const registry = registryOverride(catalog, (resolved) => {
      Reflect.deleteProperty(resolved.blueprints, "search");
    });

    expect(() => new StorefrontCompiler().compile({
      registry,
      storeDefinition: catalog.storeDefinition,
      createdAt: CREATED_AT,
    })).toThrowError(StorefrontCompilationError);
  });

  it("fails closed when one binding id resolves to different route plans", () => {
    const catalog = createBuiltInAdaptiveCommerceCatalog();
    const registry = registryOverride(catalog, (resolved) => {
      resolved.blueprints.blog.bindings[5].id = "current-page-title";
      resolved.blueprints.blog.sections[0].bindingIds[0] = "current-page-title";
      resolved.componentLibrary.components["blog-article"].commerceBindingIds[0] =
        "current-page-title";
    });

    expect(() => new StorefrontCompiler().compile({
      registry,
      storeDefinition: catalog.storeDefinition,
      createdAt: CREATED_AT,
    })).toThrowError(StorefrontCompilationError);
  });

  it("applies certified variant, visibility, and exact route section-order controls", () => {
    const catalog = createBuiltInAdaptiveCommerceCatalog();
    const homeBlueprint = catalog.registry.resolveInstallable(
      catalog.storeDefinition.storeKit.id,
      catalog.storeDefinition.storeKit.version,
    ).blueprints.home;
    const heroPath = homeBlueprint.sections[0].path;
    const productsPath = homeBlueprint.sections[1].path;
    catalog.storeDefinition.base.values[sectionControlSemanticPath(heroPath, "variant")] = "centered";
    catalog.storeDefinition.base.values[sectionControlSemanticPath(productsPath, "visible")] = true;
    catalog.storeDefinition.base.collections[routeSectionOrderSemanticPath("home")] = {
      order: [productsPath, heroPath],
      items: { [productsPath]: null, [heroPath]: null },
    };
    rehashBase(catalog);

    const artifact = new StorefrontCompiler().compile({
      registry: catalog.registry,
      storeDefinition: catalog.storeDefinition,
      createdAt: CREATED_AT,
    }).artifact;
    const sections = (artifact.routes.home.document as unknown as {
      sections: Array<{ path: string; component: { variantId: string } }>;
    }).sections;
    expect(sections.map((section) => section.path)).toEqual([productsPath, heroPath]);
    expect(sections[1].component.variantId).toBe("centered");
  });

  it("removes hidden certified sections and their route binding plans", () => {
    const catalog = createBuiltInAdaptiveCommerceCatalog();
    const homeBlueprint = catalog.registry.resolveInstallable(
      catalog.storeDefinition.storeKit.id,
      catalog.storeDefinition.storeKit.version,
    ).blueprints.home;
    const productsPath = homeBlueprint.sections[1].path;
    catalog.storeDefinition.base.values[sectionControlSemanticPath(productsPath, "visible")] = false;
    rehashBase(catalog);

    const artifact = new StorefrontCompiler().compile({
      registry: catalog.registry,
      storeDefinition: catalog.storeDefinition,
      createdAt: CREATED_AT,
    }).artifact;
    const sections = (artifact.routes.home.document as unknown as {
      sections: Array<{ path: string }>;
    }).sections;
    expect(sections.map((section) => section.path)).not.toContain(productsPath);
    expect(artifact.bindingPlans.some((binding) => binding.target.path === productsPath)).toBe(false);
  });

  it("fails closed on unknown controls, uncertified variants, and incomplete order", () => {
    const compile = (mutate: (catalog: ReturnType<typeof createBuiltInAdaptiveCommerceCatalog>) => void) => {
      const catalog = createBuiltInAdaptiveCommerceCatalog();
      mutate(catalog);
      rehashBase(catalog);
      return () => new StorefrontCompiler().compile({
        registry: catalog.registry,
        storeDefinition: catalog.storeDefinition,
        createdAt: CREATED_AT,
      });
    };
    expect(compile((catalog) => {
      catalog.storeDefinition.base.values[
        "home.unknown.settings.visible" as keyof typeof catalog.storeDefinition.base.values
      ] = true;
    })).toThrowError(StorefrontCompilationError);
    expect(compile((catalog) => {
      catalog.storeDefinition.base.values[
        "home.hero.settings.variant" as keyof typeof catalog.storeDefinition.base.values
      ] = "uncertified";
    })).toThrowError(StorefrontCompilationError);
    expect(compile((catalog) => {
      catalog.storeDefinition.base.collections[routeSectionOrderSemanticPath("home")] = {
        order: ["home.hero"],
        items: { "home.hero": null },
      };
    })).toThrowError(StorefrontCompilationError);
  });

  it("fails closed when a referenced component loses its accessibility contract", () => {
    const catalog = createBuiltInAdaptiveCommerceCatalog();
    const registry = registryOverride(catalog, (resolved) => {
      delete (resolved.componentLibrary.components.hero as Partial<
        typeof resolved.componentLibrary.components.hero
      >).a11y;
    });

    try {
      new StorefrontCompiler().compile({
        registry,
        storeDefinition: catalog.storeDefinition,
        createdAt: CREATED_AT,
      });
      throw new Error("Expected compilation to fail.");
    } catch (error) {
      expect(error).toBeInstanceOf(StorefrontCompilationError);
      expect((error as StorefrontCompilationError).diagnostics[0]?.code)
        .toBe("component-a11y-missing");
    }
  });

  it("fails closed when required media alt text is absent", () => {
    const catalog = createBuiltInAdaptiveCommerceCatalog();
    const registry = registryOverride(catalog, (resolved) => {
      const media = resolved.blueprints.home.sections[0].slots.find(
        (slot) => slot.slotId === "media",
      );
      if (media) media.value = { kind: "hero-media" };
    });

    try {
      new StorefrontCompiler().compile({
        registry,
        storeDefinition: catalog.storeDefinition,
        createdAt: CREATED_AT,
      });
      throw new Error("Expected compilation to fail.");
    } catch (error) {
      expect(error).toBeInstanceOf(StorefrontCompilationError);
      expect((error as StorefrontCompilationError).diagnostics[0]?.code)
        .toBe("component-alt-text-missing");
    }
  });
});
