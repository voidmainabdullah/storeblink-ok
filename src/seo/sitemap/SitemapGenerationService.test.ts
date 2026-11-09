import { describe, expect, it, vi } from "vitest";
import { SitemapGenerationService } from "./SitemapGenerationService";
import type { SeoCompileSnapshot } from "../types";

const snapshot: SeoCompileSnapshot = {
  store: {
    id: "store-1",
    name: "Store",
    handle: "store",
    status: "published",
    primaryHostname: "shop.example.com",
    canonicalOrigin: "https://shop.example.com",
  },
  resources: [{
    resourceType: "system_page",
    resourceId: "home",
    route: "/",
    title: "Home",
    status: "published",
    private: false,
    redirecting: false,
    publicContentUpdatedAt: "2026-08-13T00:00:00.000Z",
    indexing: "index_follow",
    canonicalMode: "automatic",
    customCanonicalUrl: null,
    customMetaTags: [],
    alternates: [],
  }],
  dirtyVersion: 1,
};

describe("SitemapGenerationService", () => {
  it("activates only after every immutable artifact is written", async () => {
    const order: string[] = [];
    const service = new SitemapGenerationService();
    await service.compileValidateAndActivate({
      generationId: "generation-1",
      snapshot,
      storagePrefix: "stores/store-1/generations/1",
      artifacts: { put: vi.fn(async ({ key }) => { order.push(`put:${key}`); }) },
      gateway: {
        activate: vi.fn(async () => { order.push("activate"); }),
        fail: vi.fn(),
      },
    });
    expect(order.at(-1)).toBe("activate");
    expect(order.filter((entry) => entry.startsWith("put:"))).toHaveLength(2);
  });

  it("never flips the active pointer when the compiler is killed mid-write", async () => {
    const activate = vi.fn();
    const fail = vi.fn();
    let writes = 0;
    await expect(new SitemapGenerationService().compileValidateAndActivate({
      generationId: "generation-2",
      snapshot,
      storagePrefix: "stores/store-1/generations/2",
      artifacts: {
        put: vi.fn(async () => {
          writes += 1;
          if (writes === 2) throw new Error("worker terminated");
        }),
      },
      gateway: { activate, fail },
    })).rejects.toThrow("worker terminated");
    expect(activate).not.toHaveBeenCalled();
    expect(fail).toHaveBeenCalledWith(expect.objectContaining({ generationId: "generation-2" }));
  });
});
