import type { Json } from "@/integrations/supabase/types";
import {
  PublicSupabaseRestError,
  publicSupabaseRequest,
  publicSupabaseRpc,
} from "@/platform/supabase/publicRest";
import type {
  StorefrontDataGateway,
  StorefrontCollection,
  StorefrontProduct,
  StorefrontProfile,
} from "./types";

const PUBLIC_PROFILE_COLUMNS =
  "id,business_name,store_slug,store_tagline,store_about,store_color,store_banner_url,store_template,theme_published,theme_revision,published_at";
const PUBLIC_PRODUCT_COLUMNS =
  "id,handle,name,category,description,image_url,images,is_published,price_cents,original_price_cents,stock,badge,free_delivery,sale_tag,sale_ends_at,created_at";

const isMissingArchitecture = (error: unknown) =>
  error instanceof PublicSupabaseRestError &&
  (error.code === "PGRST202" || error.code === "PGRST204" || error.status === 404);

const readProfileRpcRow = (value: Json | null): StorefrontProfile | null => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;
  if (typeof row.id !== "string" || !row.theme_published) return null;
  return {
    id: row.id,
    business_name: typeof row.business_name === "string" ? row.business_name : null,
    store_slug: typeof row.store_slug === "string" ? row.store_slug : null,
    store_tagline: typeof row.store_tagline === "string" ? row.store_tagline : null,
    store_about: typeof row.store_about === "string" ? row.store_about : null,
    store_color: typeof row.store_color === "string" ? row.store_color : null,
    store_banner_url: typeof row.store_banner_url === "string" ? row.store_banner_url : null,
    store_template: typeof row.store_template === "string" ? row.store_template : null,
    theme: row.theme_published,
    theme_published: row.theme_published,
    theme_revision: Number(row.theme_revision ?? 0),
    published_at: typeof row.published_at === "string" ? row.published_at : null,
  };
};

const normalizeProduct = (row: Record<string, unknown>): StorefrontProduct => ({
  id: String(row.id),
  handle: typeof row.handle === "string" ? row.handle : null,
  name: String(row.name ?? "Product"),
  category: typeof row.category === "string" ? row.category : null,
  description: typeof row.description === "string" ? row.description : null,
  image_url: typeof row.image_url === "string" ? row.image_url : null,
  images: row.images ?? [],
  is_published: row.is_published === true,
  price_cents: Number(row.price_cents ?? 0),
  original_price_cents: typeof row.original_price_cents === "number" ? row.original_price_cents : null,
  stock: typeof row.stock === "number" ? row.stock : null,
  badge: typeof row.badge === "string" ? row.badge : null,
  free_delivery: row.free_delivery === true,
  sale_tag: typeof row.sale_tag === "string" ? row.sale_tag : null,
  sale_ends_at: typeof row.sale_ends_at === "string" ? row.sale_ends_at : null,
});

const normalizeCollection = (row: Record<string, unknown>): StorefrontCollection => ({
  id: String(row.id),
  title: String(row.title ?? "Collection"),
  handle: String(row.handle ?? ""),
  collection_type: row.collection_type === "smart" ? "smart" : "manual",
});

const safeSearch = (value: string) => value.replace(/[^a-z0-9 _-]/gi, " ").trim().slice(0, 120);
const totalFromContentRange = (value: string | null) => Number(value?.split("/")[1] ?? 0) || 0;

export const supabaseStorefrontGateway: StorefrontDataGateway = {
  async findPublishedStore(slug) {
    try {
      const rpc = await publicSupabaseRpc<Json | null>("get_public_storefront", { p_handle: slug });
      return readProfileRpcRow(rpc.data);
    } catch (error) {
      if (!isMissingArchitecture(error)) throw error;
    }

    const params = new URLSearchParams({
      select: PUBLIC_PROFILE_COLUMNS,
      store_slug: `eq.${slug}`,
      limit: "1",
    });
    const result = await publicSupabaseRequest<Array<Record<string, unknown>>>(`profiles?${params}`);
    const row = result.data[0];
    return row ? readProfileRpcRow(row as Json) : null;
  },

  async listPublishedCollections(storeId) {
    try {
      const rpc = await publicSupabaseRpc<Array<Record<string, unknown>>>("get_public_collections", {
        p_store_id: storeId,
      });
      return rpc.data.map(normalizeCollection);
    } catch (error) {
      if (!isMissingArchitecture(error)) throw error;
      return [];
    }
  },

  async listPublishedProducts(input) {
    const offset = (input.page - 1) * input.pageSize;
    try {
      const rpc = input.collectionHandle
        ? await publicSupabaseRpc<Array<Record<string, unknown>>>("get_public_collection_catalog", {
            p_store_id: input.storeId,
            p_collection_handle: input.collectionHandle,
            p_limit: input.pageSize,
            p_offset: offset,
            p_query: input.search,
            p_sort: input.sort,
          })
        : await publicSupabaseRpc<Array<Record<string, unknown>>>("get_public_catalog", {
            p_store_id: input.storeId,
            p_limit: input.pageSize,
            p_offset: offset,
            p_query: input.search,
            p_sort: input.sort,
          });
      return {
        items: rpc.data.map(normalizeProduct),
        total: Number(rpc.data[0]?.total_count ?? 0),
      };
    } catch (error) {
      if (!isMissingArchitecture(error)) throw error;
    }

    const order = input.sort === "price-asc"
      ? "price_cents.asc"
      : input.sort === "price-desc"
        ? "price_cents.desc"
        : input.sort === "name"
          ? "name.asc"
          : "created_at.desc";
    const params = new URLSearchParams({
      select: PUBLIC_PRODUCT_COLUMNS,
      user_id: `eq.${input.storeId}`,
      is_published: "eq.true",
      order,
      limit: String(input.pageSize),
      offset: String(offset),
    });
    const search = safeSearch(input.search);
    if (search) params.set("or", `(name.ilike.*${search}*,category.ilike.*${search}*,description.ilike.*${search}*)`);
    if (input.collectionHandle) {
      params.set("category", `ilike.${safeSearch(input.collectionHandle).replace(/-/g, " ")}`);
    }
    const result = await publicSupabaseRequest<Array<Record<string, unknown>>>(`items?${params}`, {
      headers: { Prefer: "count=exact" },
    });
    return {
      items: result.data.map(normalizeProduct),
      total: totalFromContentRange(result.headers.get("content-range")),
    };
  },

  async findPublishedProduct(storeId, idOrHandle) {
    try {
      const rpc = await publicSupabaseRpc<Json | null>("get_public_product", {
        p_store_id: storeId,
        p_identifier: idOrHandle,
      });
      return rpc.data && typeof rpc.data === "object" && !Array.isArray(rpc.data)
        ? normalizeProduct(rpc.data as Record<string, unknown>)
        : null;
    } catch (error) {
      if (!isMissingArchitecture(error)) throw error;
    }

    const byId = /^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(idOrHandle);
    const params = new URLSearchParams({
      select: PUBLIC_PRODUCT_COLUMNS,
      user_id: `eq.${storeId}`,
      is_published: "eq.true",
      [byId ? "id" : "handle"]: `eq.${idOrHandle}`,
      limit: "1",
    });
    const result = await publicSupabaseRequest<Array<Record<string, unknown>>>(`items?${params}`);
    return result.data[0] ? normalizeProduct(result.data[0]) : null;
  },
};
