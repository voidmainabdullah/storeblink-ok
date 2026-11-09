import type { CatalogRequest, CatalogSort } from "@/storefront/data-resolvers";

export type StoreSearchState = {
  query: string;
  sort: CatalogSort;
  page: number;
  pageSize: number;
};

export const normalizeStoreSearchQuery = (query: string): string =>
  query.trim().replace(/\s+/g, " ").slice(0, 120);

export const createStoreSearchRequest = (
  storeId: string,
  state: StoreSearchState,
): CatalogRequest => ({
  storeId,
  search: normalizeStoreSearchQuery(state.query),
  sort: state.sort,
  page: Math.max(1, Math.trunc(state.page)),
  pageSize: Math.max(1, Math.min(100, Math.trunc(state.pageSize))),
});
