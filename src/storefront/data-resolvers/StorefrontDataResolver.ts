import { storefrontCache, type TaggedCache } from "@/platform/caching";
import type {
  CatalogPage,
  CatalogRequest,
  StorefrontDataGateway,
  StorefrontCollection,
  StorefrontProduct,
  StorefrontProfile,
} from "./types";

const profileTag = (slug: string) => `storefront:profile:${slug}`;
const catalogTag = (storeId: string) => `storefront:catalog:${storeId}`;
const productTag = (storeId: string, identifier: string) =>
  `storefront:product:${storeId}:${identifier}`;

const normalizeCatalogRequest = (input: CatalogRequest): Required<CatalogRequest> => ({
  storeId: input.storeId,
  page: Math.max(1, Math.floor(input.page ?? 1)),
  pageSize: Math.min(60, Math.max(1, Math.floor(input.pageSize ?? 24))),
  search: input.search?.trim().slice(0, 120) ?? "",
  sort: input.sort ?? "newest",
  collectionHandle: input.collectionHandle?.trim().toLowerCase().slice(0, 120) ?? "",
});

export class StorefrontDataResolver {
  constructor(
    private readonly gateway: StorefrontDataGateway,
    private readonly cache: TaggedCache = storefrontCache,
  ) {}

  async getStore(slug: string): Promise<StorefrontProfile | null> {
    const normalized = slug.trim().toLowerCase();
    return this.cache.getOrLoad(
      `storefront:profile:${normalized}`,
      () => this.gateway.findPublishedStore(normalized),
      { tags: [profileTag(normalized)], ttlMs: 30_000 },
    );
  }

  getCollections(storeId: string): Promise<StorefrontCollection[]> {
    return this.cache.getOrLoad(
      `storefront:collections:${storeId}`,
      () => this.gateway.listPublishedCollections(storeId),
      { tags: [catalogTag(storeId)], ttlMs: 20_000 },
    );
  }

  getCatalog(input: CatalogRequest): Promise<CatalogPage> {
    const request = normalizeCatalogRequest(input);
    const key = [
      "storefront:catalog",
      request.storeId,
      request.page,
      request.pageSize,
      request.sort,
      encodeURIComponent(request.collectionHandle),
      encodeURIComponent(request.search),
    ].join(":");

    return this.cache.getOrLoad(
      key,
      async () => {
        const result = await this.gateway.listPublishedProducts(request);
        return {
          items: result.items,
          page: request.page,
          pageSize: request.pageSize,
          total: result.total,
          pageCount: Math.max(1, Math.ceil(result.total / request.pageSize)),
        };
      },
      {
        tags: [catalogTag(request.storeId)],
        ttlMs: request.search ? 10_000 : 20_000,
      },
    );
  }

  getProduct(storeId: string, idOrHandle: string): Promise<StorefrontProduct | null> {
    const identifier = idOrHandle.trim();
    return this.cache.getOrLoad(
      productTag(storeId, identifier),
      () => this.gateway.findPublishedProduct(storeId, identifier),
      {
        tags: [catalogTag(storeId), productTag(storeId, identifier)],
        ttlMs: 20_000,
      },
    );
  }

  invalidateStore(slug: string): void {
    this.cache.invalidateTag(profileTag(slug.trim().toLowerCase()));
  }

  invalidateCatalog(storeId: string): void {
    this.cache.invalidateTag(catalogTag(storeId));
  }

  invalidateProduct(storeId: string, identifiers: readonly string[]): void {
    identifiers.forEach((identifier) => {
      this.cache.invalidateTag(productTag(storeId, identifier));
    });
    this.invalidateCatalog(storeId);
  }
}
