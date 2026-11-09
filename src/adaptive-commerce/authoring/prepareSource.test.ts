import { describe, expect, it } from "vitest";
import {
  sectionControlSemanticPath,
  routeSectionOrderSemanticPath,
} from "@/adaptive-commerce/contracts";
import {
  createBuiltInAdaptiveCommerceCatalog,
  createBuiltInStoreDefinition,
} from "@/adaptive-commerce/fixtures";
import type { AdaptiveAuthoringSource } from "./types";
import { adaptiveSectionControlReadiness } from "./prepareSource";

const source = (): AdaptiveAuthoringSource => {
  const catalog = createBuiltInAdaptiveCommerceCatalog();
  const storeDefinition = createBuiltInStoreDefinition();
  return {
    kind: "adaptive-storefront-authoring-source",
    storeId: storeDefinition.storeId,
    installationId: storeDefinition.installationId,
    installationStatus: "active",
    installationRevision: 1,
    sourceRevision: 1,
    sourceHash: `sha256:${"a".repeat(64)}`,
    baseRevisionRowId: "base-one",
    storeDefinition,
    merchantPatches: [],
    catalog: {
      designPack: catalog.designPack,
      componentLibrary: catalog.componentLibrary,
      blueprints: [...catalog.blueprints],
    },
    publishedSourceRevision: null,
    reviewState: "review-needed",
  };
};

describe("adaptive section authoring readiness", () => {
  it("accepts the fully seeded compiler control contract", () => {
    expect(adaptiveSectionControlReadiness(source())).toEqual({
      ready: true,
      missingPaths: [],
      invalidPaths: [],
    });
  });

  it("fails closed for unsupported variants or incomplete section order", () => {
    const value = source();
    const home = value.catalog.blueprints.find((blueprint) => blueprint.resourceType === "home")!;
    value.storeDefinition.base.values[
      sectionControlSemanticPath(home.sections[0].path, "variant")
    ] = "unregistered-layout";
    value.storeDefinition.base.collections[
      routeSectionOrderSemanticPath("home")
    ].order.pop();
    delete value.storeDefinition.base.collections[
      routeSectionOrderSemanticPath("home")
    ].items[home.sections.at(-1)!.path];
    const readiness = adaptiveSectionControlReadiness(value);
    expect(readiness.ready).toBe(false);
    expect(readiness.invalidPaths).toEqual(expect.arrayContaining([
      sectionControlSemanticPath(home.sections[0].path, "variant"),
      routeSectionOrderSemanticPath("home"),
    ]));
  });
});
