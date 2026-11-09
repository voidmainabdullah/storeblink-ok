import { describe, expect, it, vi } from "vitest";
import {
  StorefrontPublishingService,
  type StorefrontPublishingGateway,
} from "./StorefrontPublishingService";
import { PublicationRecoverySystem } from "./PublicationRecoverySystem";
import { createDependencyGraph } from "@/engine/dependency-graph";

describe("StorefrontPublishingService", () => {
  it("serializes writes and advances optimistic revisions", async () => {
    const revisions: number[] = [];
    const gateway: StorefrontPublishingGateway = {
      write: vi.fn(async (_mode, input) => {
        revisions.push(input.expectedRevision);
        await Promise.resolve();
        return {
          revision: input.expectedRevision + 1,
          persistedAt: "2026-01-01T00:00:00.000Z",
          concurrency: "atomic" as const,
        };
      }),
    };
    const service = new StorefrontPublishingService(gateway);
    service.initialize(4);

    const first = service.saveDraft({ userId: "u1", document: { a: 1 } });
    const second = service.publish({ userId: "u1", document: { a: 2 } });
    await Promise.all([first, second]);

    expect(revisions).toEqual([4, 5]);
    expect(service.getRevision()).toBe(6);
  });

  it("continues the queue after a failed write", async () => {
    const gateway: StorefrontPublishingGateway = {
      write: vi
        .fn()
        .mockRejectedValueOnce(new Error("offline"))
        .mockResolvedValueOnce({
          revision: 3,
          persistedAt: "2026-01-01T00:00:00.000Z",
          concurrency: "atomic" as const,
        }),
    };
    const service = new StorefrontPublishingService(gateway);
    service.initialize(2);

    await expect(service.saveDraft({ userId: "u1", document: {} })).rejects.toThrow("offline");
    await expect(service.saveDraft({ userId: "u1", document: {} })).resolves.toMatchObject({ revision: 3 });
  });

  it("runs the guard and republishes an immutable recovery point", async () => {
    const writes: unknown[] = [];
    const gateway: StorefrontPublishingGateway = {
      write: vi.fn(async (_mode, input) => {
        writes.push(structuredClone(input.document));
        return {
          revision: input.expectedRevision + 1,
          persistedAt: "2026-01-01T00:00:00.000Z",
          concurrency: "atomic" as const,
        };
      }),
    };
    const guard = { validate: vi.fn() };
    const recovery = new PublicationRecoverySystem();
    const service = new StorefrontPublishingService(gateway, { guard, recovery });
    const original = { version: "original" };
    service.initialize(7, { storeId: "u1", document: original });
    original.version = "mutated";

    await service.publish({ userId: "u1", document: { version: "next" } });
    const prePublish = service.listRecoveryPoints().find((point) => point.reason === "pre-publish");
    expect(prePublish?.document).toEqual({ version: "original" });
    expect(guard.validate).toHaveBeenCalledWith(
      "publish",
      expect.objectContaining({ expectedRevision: 7 }),
    );

    await service.rollback(prePublish!.id, { userId: "u1" });
    expect(writes.at(-1)).toEqual({ version: "original" });
  });

  it("does not create a pre-publish recovery point when persistence fails", async () => {
    const gateway: StorefrontPublishingGateway = {
      write: vi.fn().mockRejectedValue(new Error("offline")),
    };
    const recovery = new PublicationRecoverySystem();
    const service = new StorefrontPublishingService(gateway, { recovery });
    service.initialize(1, { storeId: "u1", document: { version: "live" } });

    await expect(
      service.publish({ userId: "u1", document: { version: "failed" } }),
    ).rejects.toThrow("offline");
    expect(
      service.listRecoveryPoints().filter((point) => point.reason === "pre-publish"),
    ).toEqual([]);
  });

  it("indexes an immutable published revision and its asset manifest", async () => {
    const gateway: StorefrontPublishingGateway = {
      write: vi.fn(async (_mode, input) => ({
        revision: input.expectedRevision + 1,
        persistedAt: "2026-01-01T00:00:00.000Z",
        concurrency: "atomic" as const,
      })),
    };
    const dependencies = createDependencyGraph();
    const service = new StorefrontPublishingService(gateway, { dependencies });
    service.initialize(2);

    await service.publish({
      userId: "store-1",
      document: {
        engine_scene: {
          rootNodeId: "root",
          nodes: {
            root: {
              extensions: {
                assetLibrary: {
                  version: 1,
                  items: { "asset-logo": {} },
                },
              },
            },
            image: {
              props: { assetId: "asset-photo" },
              style: { fills: [] },
            },
          },
        },
      },
    });

    expect(
      dependencies.getDependencies({
        kind: "published-revision",
        id: "store-1:3",
      })[0],
    ).toMatchObject({
      target: { kind: "asset-manifest", id: "store-1:3:assets" },
      relation: "publishes-assets",
      metadata: { assetCount: 2 },
    });
    expect(
      dependencies
        .getDependencies({ kind: "asset-manifest", id: "store-1:3:assets" })
        .map((edge) => edge.target.id),
    ).toEqual(["asset-logo", "asset-photo"]);
  });

  it("restores a persisted publication after creating a new service session", async () => {
    const publications = new Map<string, { id: string; revision: number; createdAt: string; document: unknown }>([
      ["publication-3", {
        id: "publication-3",
        revision: 3,
        createdAt: "2026-01-01T00:00:00.000Z",
        document: { version: "known-good" },
      }],
    ]);
    const writes: unknown[] = [];
    const gateway: StorefrontPublishingGateway = {
      write: vi.fn(async (_mode, input) => {
        writes.push(structuredClone(input.document));
        return {
          revision: input.expectedRevision + 1,
          persistedAt: "2026-01-02T00:00:00.000Z",
          concurrency: "atomic" as const,
        };
      }),
      listPublications: vi.fn(async () => [...publications.values()]),
      getPublication: vi.fn(async (id) => publications.get(id) ?? null),
    };

    const reloadedService = new StorefrontPublishingService(gateway);
    reloadedService.initialize(8);
    expect(await reloadedService.listPersistedPublications()).toEqual([
      expect.objectContaining({ id: "publication-3", revision: 3 }),
    ]);

    await reloadedService.rollbackPersistedPublication("publication-3", { userId: "store-1" });
    expect(writes).toEqual([{ version: "known-good" }]);
    expect(reloadedService.getRevision()).toBe(9);
  });
});
