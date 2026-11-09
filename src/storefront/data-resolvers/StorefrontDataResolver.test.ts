import { describe, expect, it, vi } from "vitest";
import { TaggedCache } from "@/platform/caching";
import { StorefrontDataResolver } from "./StorefrontDataResolver";
import type { StorefrontDataGateway } from "./types";

const profile = {
  id: "store-1",
  business_name: "Demo",
  store_slug: "demo",
  theme: {},
};

const product = {
  id: "product-1",
  name: "Product",
  category: null,
  description: null,
  image_url: null,
  images: [],
  is_published: true,
  price_cents: 100,
  original_price_cents: null,
  stock: 2,
};

const gateway = (): StorefrontDataGateway => ({
  findPublishedStore: vi.fn(async () => profile),
  listPublishedCollections: vi.fn(async () => [{
    id: "collection-1",
    title: "Watches",
    handle: "watches",
    collection_type: "manual" as const,
  }]),
  listPublishedProducts: vi.fn(async () => ({ items: [product], total: 81 })),
  findPublishedProduct: vi.fn(async () => product),
});

describe("StorefrontDataResolver", () => {
  it("deduplicates profile loads and invalidates by store", async () => {
    const source = gateway();
    const resolver = new StorefrontDataResolver(source, new TaggedCache());
    await Promise.all([resolver.getStore("demo"), resolver.getStore("demo")]);
    expect(source.findPublishedStore).toHaveBeenCalledTimes(1);

    resolver.invalidateStore("demo");
    await resolver.getStore("demo");
    expect(source.findPublishedStore).toHaveBeenCalledTimes(2);
  });

  it("returns no store when there is no published document", async () => {
    const source = gateway();
    vi.mocked(source.findPublishedStore).mockResolvedValue(null);
    const resolver = new StorefrontDataResolver(source, new TaggedCache());

    await expect(resolver.getStore("Demo")).resolves.toBeNull();
    expect(source.findPublishedStore).toHaveBeenCalledWith("demo");
  });

  it("normalizes and paginates catalog requests", async () => {
    const source = gateway();
    const resolver = new StorefrontDataResolver(source, new TaggedCache());
    const result = await resolver.getCatalog({
      storeId: "store-1",
      page: 2,
      pageSize: 24,
      search: " chair ",
      sort: "price-asc",
    });

    expect(source.listPublishedProducts).toHaveBeenCalledWith({
      storeId: "store-1",
      page: 2,
      pageSize: 24,
      search: "chair",
      sort: "price-asc",
      collectionHandle: "",
    });
    expect(result).toMatchObject({ total: 81, page: 2, pageCount: 4 });
  });

  it("normalizes collection handles into an isolated catalog cache key", async () => {
    const source = gateway();
    const resolver = new StorefrontDataResolver(source, new TaggedCache());

    await resolver.getCatalog({ storeId: "store-1", collectionHandle: " Watches " });

    expect(source.listPublishedProducts).toHaveBeenCalledWith(expect.objectContaining({
      collectionHandle: "watches",
      search: "",
    }));
  });

  it("loads published collections through the catalog cache boundary", async () => {
    const source = gateway();
    const resolver = new StorefrontDataResolver(source, new TaggedCache());

    const collections = await resolver.getCollections("store-1");

    expect(collections[0]).toMatchObject({ handle: "watches" });
    expect(source.listPublishedCollections).toHaveBeenCalledWith("store-1");
  });
});
