// @vitest-environment node

import { describe, expect, it } from "vitest";
import { StorefrontCompiler, artifactHashFor } from "../compiler";
import { createBuiltInAdaptiveCommerceCatalog } from "../fixtures";
import type { RuntimeArtifact } from "../contracts";
import { ProductionArtifactReleaseGate } from "./ProductionArtifactReleaseGate";
import type { CanonicalCompileSource } from "./types";

const compileFixture = (): Readonly<{
  artifact: RuntimeArtifact;
  source: CanonicalCompileSource;
}> => {
  const catalog = createBuiltInAdaptiveCommerceCatalog();
  const artifact = new StorefrontCompiler().compile({
    registry: catalog.registry,
    storeDefinition: catalog.storeDefinition,
    createdAt: "2030-01-02T03:04:05.000Z",
  }).artifact;
  return {
    artifact,
    source: {
      sourceRevision: 1,
      sourceHash: artifact.sourceHash,
      storeDefinition: catalog.storeDefinition,
      merchantPatches: [],
      assets: [],
      legacyProjection: { projection: null, uncomparableRoutes: [
        "home", "product", "collection", "page", "blog", "cart", "search", "404",
      ] },
    },
  };
};

const rehash = (artifact: RuntimeArtifact): RuntimeArtifact => {
  const { artifactHash: _previous, ...content } = artifact;
  return { ...content, artifactHash: artifactHashFor(content) };
};

describe("ProductionArtifactReleaseGate", () => {
  it("accepts an intact eight-route compiler artifact", () => {
    const fixture = compileFixture();
    expect(new ProductionArtifactReleaseGate().evaluate(fixture)).toEqual({
      passed: true,
      issues: [],
    });
  });

  it("rejects copied hashes and canonical installation mismatches", () => {
    const fixture = compileFixture();
    const tampered = structuredClone(fixture.artifact) as RuntimeArtifact;
    (tampered as { storeId: string }).storeId = "another-store";
    const result = new ProductionArtifactReleaseGate().evaluate({
      ...fixture,
      artifact: tampered,
    });
    expect(result.passed).toBe(false);
    expect(result.issues.map((issue) => issue.code)).toEqual(expect.arrayContaining([
      "release.artifact.hash-invalid",
      "release.artifact.identity-mismatch",
    ]));
  });

  it("rejects empty routes, fallback markers, and forbidden specificity", () => {
    const fixture = compileFixture();
    const tampered = structuredClone(fixture.artifact) as RuntimeArtifact;
    const home = tampered.routes.home.document as unknown as {
      sections: unknown[];
      marker?: string;
    };
    home.sections = [];
    home.marker = "legacy-route-fallback !important";
    const result = new ProductionArtifactReleaseGate().evaluate({
      ...fixture,
      artifact: rehash(tampered),
    });
    expect(result.passed).toBe(false);
    expect(result.issues.map((issue) => issue.code)).toEqual(expect.arrayContaining([
      "release.route.sections-missing",
      "release.artifact.route-fallback",
      "release.artifact.forbidden-important",
    ]));
  });

  it("rejects a missing route even when the remaining artifact is well formed", () => {
    const fixture = compileFixture();
    const tampered = structuredClone(fixture.artifact) as RuntimeArtifact;
    delete (tampered.routes as unknown as Record<string, unknown>).search;
    const result = new ProductionArtifactReleaseGate().evaluate({
      ...fixture,
      artifact: tampered,
    });
    expect(result.passed).toBe(false);
    expect(result.issues.map((issue) => issue.code)).toContain(
      "release.artifact.schema-invalid",
    );
  });

  it("rejects incomplete compiler, responsive, accessibility, and component contracts", () => {
    const fixture = compileFixture();
    const tampered = structuredClone(fixture.artifact) as RuntimeArtifact;
    const home = tampered.routes.home.document as unknown as {
      responsive?: unknown;
      sections: Array<{
        accessibility: unknown;
        component: { id: string; version: string; variantId: string };
      }>;
    };
    delete home.responsive;
    home.sections[0].accessibility = {};
    home.sections[0].component.version = "9.9.9";
    tampered.extensions.compilerStages = ["schema-validation"];
    tampered.extensions.appliedPatchIds = ["not-canonical"];
    const result = new ProductionArtifactReleaseGate().evaluate({
      ...fixture,
      artifact: rehash(tampered),
    });
    expect(result.passed).toBe(false);
    expect(result.issues.map((issue) => issue.code)).toEqual(expect.arrayContaining([
      "release.route.responsive-uncertified",
      "release.section.a11y-invalid",
      "release.section.component-pin-invalid",
      "release.artifact.compiler-stages-incomplete",
      "release.artifact.patch-set-mismatch",
    ]));
  });

  it("requires the full canonical StoreKit and schema pin", () => {
    const fixture = compileFixture();
    const tampered = structuredClone(fixture.artifact) as RuntimeArtifact;
    tampered.storeKit.integrity = `sha256:${"f".repeat(64)}`;
    tampered.schemaVersion += 1;
    const result = new ProductionArtifactReleaseGate().evaluate({
      ...fixture,
      artifact: rehash(tampered),
    });
    expect(result.passed).toBe(false);
    expect(result.issues.map((issue) => issue.code)).toEqual(expect.arrayContaining([
      "release.artifact.store-kit-mismatch",
      "release.artifact.schema-version-mismatch",
    ]));
  });
});
