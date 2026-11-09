import { describe, expect, it, vi } from "vitest";
import { StorefrontCompiler } from "../compiler";
import { createBuiltInAdaptiveCommerceCatalog } from "../fixtures";
import { SupabaseAdaptiveReleaseGateway, type SupabaseRpcClient } from "./SupabaseAdaptiveReleaseGateway";

describe("SupabaseAdaptiveReleaseGateway shadow baseline", () => {
  it("projects an exact active adaptive artifact without a custom legacy adapter", async () => {
    const catalog = createBuiltInAdaptiveCommerceCatalog();
    const artifact = new StorefrontCompiler().compile({
      registry: catalog.registry,
      storeDefinition: catalog.storeDefinition,
      artifactId: "active-adaptive-artifact",
      createdAt: "2030-01-02T03:04:05.000Z",
    }).artifact;
    const rpc = vi.fn(async () => ({
      data: {
        sourceRevision: 2,
        sourceHash: `sha256:${"a".repeat(64)}`,
        storeDefinition: catalog.storeDefinition,
        merchantPatches: [],
        assets: [],
        legacySnapshot: artifact,
      },
      error: null,
    }));
    const gateway = new SupabaseAdaptiveReleaseGateway({ rpc } satisfies SupabaseRpcClient);

    const source = await gateway.loadCanonicalSource({
      storeId: catalog.storeDefinition.storeId,
      installationId: catalog.storeDefinition.installationId,
      expectedSourceRevision: 2,
    });

    expect(source.legacyProjection.projection?.routes).toEqual(artifact.routes);
    expect(source.legacyProjection.uncomparableRoutes).toEqual([]);
  });

  it("keeps an opaque first legacy snapshot uncomparable", async () => {
    const catalog = createBuiltInAdaptiveCommerceCatalog();
    const rpc = vi.fn(async () => ({
      data: {
        sourceRevision: 1,
        sourceHash: `sha256:${"b".repeat(64)}`,
        storeDefinition: catalog.storeDefinition,
        merchantPatches: [],
        assets: [],
        legacySnapshot: { legacyScene: true },
      },
      error: null,
    }));
    const gateway = new SupabaseAdaptiveReleaseGateway({ rpc } satisfies SupabaseRpcClient);

    const source = await gateway.loadCanonicalSource({
      storeId: catalog.storeDefinition.storeId,
      installationId: catalog.storeDefinition.installationId,
      expectedSourceRevision: 1,
    });

    expect(source.legacyProjection.projection).toBeNull();
    expect(source.legacyProjection.uncomparableRoutes).toHaveLength(8);
  });
});
