export type StorefrontProfile = {
  id: string;
  business_name: string | null;
  store_slug: string | null;
  store_tagline?: string | null;
  store_about?: string | null;
  store_color?: string | null;
  store_banner_url?: string | null;
  store_template?: string | null;
  theme: unknown;
  theme_draft?: unknown;
  theme_published?: unknown;
  theme_revision?: number;
  published_at?: string | null;
};

export type StorefrontProduct = {
  id: string;
  handle?: string | null;
  name: string;
  category: string | null;
  description: string | null;
  image_url: string | null;
  images: unknown;
  is_published: boolean;
  price_cents: number;
  original_price_cents: number | null;
  stock: number | null;
  badge?: string | null;
  free_delivery?: boolean | null;
  sale_tag?: string | null;
  sale_ends_at?: string | null;
};

export type StorefrontCollection = {
  id: string;
  title: string;
  handle: string;
  collection_type: "manual" | "smart";
};

export type CatalogSort = "newest" | "name" | "price-asc" | "price-desc";

export type CatalogRequest = {
  storeId: string;
  page?: number;
  pageSize?: number;
  search?: string;
  sort?: CatalogSort;
  collectionHandle?: string;
};

export type CatalogPage = {
  items: StorefrontProduct[];
  page: number;
  pageSize: number;
  total: number;
  pageCount: number;
};

export interface StorefrontDataGateway {
  findPublishedStore(slug: string): Promise<StorefrontProfile | null>;
  listPublishedCollections(storeId: string): Promise<StorefrontCollection[]>;
  listPublishedProducts(input: Required<CatalogRequest>): Promise<{
    items: StorefrontProduct[];
    total: number;
  }>;
  findPublishedProduct(storeId: string, idOrHandle: string): Promise<StorefrontProduct | null>;
}
