import { RuntimeArtifactResolver } from "./RuntimeArtifactResolver";
import { artifactHashFor } from "@/adaptive-commerce/compiler/sha256";

const PACKAGE_HASH = `sha256:${"a".repeat(64)}`;
const SOURCE_HASH = `sha256:${"c".repeat(64)}`;
const packageRef = (id: string) => ({ id, version: "1.0.0", integrity: PACKAGE_HASH });
const artifactContent = {
  kind: "runtime-artifact" as const,
  artifactVersion: 1 as const,
  id: "artifact-1",
  storeId: "store-1",
  installationId: "installation-1",
  storeKit: packageRef("store-kit"),
  schemaVersion: 1,
  compilerVersion: "1.0.0",
  sourceHash: SOURCE_HASH,
  createdAt: "2026-08-21T00:00:00.000Z",
  routes: Object.fromEntries([
    "home", "product", "collection", "page", "blog", "cart", "search", "404",
  ].map((resourceType) => [resourceType, {
    resourceType,
    blueprint: packageRef(resourceType === "404" ? "not-found-blueprint" : `${resourceType}-blueprint`),
    document: {},
  }])) as never,
  globals: {},
  resolvedTokens: {},
  componentVersions: {},
  bindingPlans: [],
  assets: [],
  diagnostics: [],
  extensions: {},
};
const HASH = artifactHashFor(artifactContent);
const artifact = { ...artifactContent, artifactHash: HASH };

describe("RuntimeArtifactResolver", () => {
  it("accepts only a hash-matched assigned adaptive artifact", async () => {
    const resolver = new RuntimeArtifactResolver({
      resolve: async () => ({
        runtime: "adaptive",
        store_id: "store-1",
        cohort_bucket: 901,
        publication_id: "publication-1",
        publication_revision: 4,
        artifact_hash: HASH,
        artifact,
      }),
    });
    await expect(resolver.resolve("demo-store")).resolves.toEqual({
      runtime: "adaptive",
      reason: "assigned",
      storeId: "store-1",
      cohortBucket: 901,
      publicationId: "publication-1",
      publicationRevision: 4,
      artifactHash: HASH,
      artifact,
    });
  });

  it("fails closed when an adaptive response is incomplete or tampered", async () => {
    const resolver = new RuntimeArtifactResolver({
      resolve: async () => ({
        runtime: "adaptive",
        store_id: "store-1",
        cohort_bucket: 4,
        publication_id: "publication-1",
        publication_revision: 1,
        artifact_hash: HASH,
        artifact: { schemaVersion: 1, artifactHash: `sha256:${"b".repeat(64)}` },
      }),
    });
    await expect(resolver.resolve("demo-store")).resolves.toMatchObject({
      runtime: "legacy",
      reason: "invalid",
    });
  });

  it("recomputes the artifact digest instead of trusting a copied declared hash", async () => {
    const resolver = new RuntimeArtifactResolver({
      resolve: async () => ({
        runtime: "adaptive",
        store_id: "store-1",
        cohort_bucket: 4,
        publication_id: "publication-1",
        publication_revision: 1,
        artifact_hash: HASH,
        artifact: { ...artifact, compilerVersion: "tampered-version" },
      }),
    });
    await expect(resolver.resolve("demo-store")).resolves.toMatchObject({
      runtime: "legacy",
      reason: "invalid",
    });
  });

  it("preserves a server-assigned legacy cohort without requiring an artifact", async () => {
    const resolver = new RuntimeArtifactResolver({
      resolve: async () => ({
        runtime: "legacy",
        store_id: "store-1",
        cohort_bucket: 9901,
        publication_id: "legacy:7",
      }),
    });
    await expect(resolver.resolve("demo-store")).resolves.toEqual({
      runtime: "legacy",
      reason: "assigned",
      storeId: "store-1",
      cohortBucket: 9901,
      publicationId: "legacy:7",
    });
  });

  it("treats missing, invalid, and unavailable assignment services as legacy", async () => {
    await expect(new RuntimeArtifactResolver({ resolve: async () => null }).resolve("store"))
      .resolves.toEqual({ runtime: "legacy", reason: "missing" });
    await expect(new RuntimeArtifactResolver({ resolve: async () => ({ runtime: "v4" }) }).resolve("store"))
      .resolves.toEqual({ runtime: "legacy", reason: "invalid" });
    await expect(new RuntimeArtifactResolver({ resolve: async () => { throw new Error("offline"); } }).resolve("store"))
      .resolves.toEqual({ runtime: "legacy", reason: "unavailable" });
  });
});
