import { describe, expect, it } from "vitest";
import type { RuntimeArtifact } from "@/adaptive-commerce";
import { STOREFRONT_RESOURCE_TYPES } from "../contracts";
import {
  BUILT_IN_THEME_STORE_KITS,
  createBuiltInAdaptiveCommerceCatalog,
  type BuiltInThemeStoreKitId,
} from "../fixtures";
import { StorefrontCompiler } from "./StorefrontCompiler";

const CREATED_AT = "2030-01-02T03:04:05.000Z";
const themeIds = Object.keys(BUILT_IN_THEME_STORE_KITS) as BuiltInThemeStoreKitId[];
const matrix = themeIds.flatMap((themeId) =>
  STOREFRONT_RESOURCE_TYPES.map((resourceType) => [themeId, resourceType] as const));
const artifacts = new Map<BuiltInThemeStoreKitId, RuntimeArtifact>();
const catalog = createBuiltInAdaptiveCommerceCatalog();

const artifactFor = (themeId: BuiltInThemeStoreKitId): RuntimeArtifact => {
  const cached = artifacts.get(themeId);
  if (cached) return cached;
  const result = new StorefrontCompiler().compile({
    registry: catalog.registry,
    storeDefinition: catalog.themeStoreDefinitions[themeId],
    createdAt: CREATED_AT,
  });
  artifacts.set(themeId, result.artifact);
  return result.artifact;
};

describe("installed theme StoreKit compile matrix", () => {
  it.each(matrix)("%s compiles a real %s route", (themeId, resourceType) => {
    const artifact = artifactFor(themeId);

    expect(artifact.storeKit.id).toBe(themeId);
    expect(artifact.routes[resourceType]).toMatchObject({
      resourceType,
      document: {
        resourceType,
        responsive: { runtimeLayoutCompiler: false },
      },
    });
    expect((artifact.routes[resourceType].document as { sections: unknown[] }).sections.length)
      .toBeGreaterThan(0);
  });

  it("keeps the four theme visual languages distinct through certified token presets", () => {
    const tokenSignatures = themeIds.map((themeId) => {
      const tokens = artifactFor(themeId).resolvedTokens;
      return [
        tokens["semantic:color.surface"],
        tokens["semantic:color.text"],
        tokens["semantic:color.action"],
        tokens["semantic:radius.panel"],
      ].join("|");
    });

    expect(new Set(tokenSignatures).size).toBe(themeIds.length);
  });
});
