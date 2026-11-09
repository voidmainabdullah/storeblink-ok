// @vitest-environment node

import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(process.cwd(), "supabase/migrations/20260813000100_seo_sitemap_engine_v2.sql"),
  "utf8",
);

const storeId = "11111111-1111-4111-8111-111111111111";
const productId = "22222222-2222-4222-8222-222222222222";
const pageId = "33333333-3333-4333-8333-333333333333";
const collectionId = "44444444-4444-4444-8444-444444444444";
const domainId = "55555555-5555-4555-8555-555555555555";

const existingSchema = `
  CREATE ROLE anon NOLOGIN;
  CREATE ROLE authenticated NOLOGIN;
  CREATE ROLE service_role NOLOGIN;
  CREATE SCHEMA auth;
  CREATE SCHEMA private;

  CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE
  AS $$ SELECT '${storeId}'::uuid $$;
  CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE
  AS $$ SELECT 'service_role'::text $$;
  CREATE FUNCTION private.has_store_capability(uuid, text, uuid DEFAULT auth.uid())
  RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
  AS $$ SELECT true $$;

  CREATE TABLE public.profiles (
    id uuid PRIMARY KEY,
    business_name text,
    store_tagline text,
    store_about text,
    store_banner_url text,
    theme_published jsonb,
    updated_at timestamptz NOT NULL DEFAULT now()
  );
  CREATE TABLE public.stores (
    id uuid PRIMARY KEY,
    owner_user_id uuid NOT NULL,
    name text NOT NULL,
    handle text NOT NULL UNIQUE,
    status text NOT NULL,
    brand_profile jsonb NOT NULL DEFAULT '{}'::jsonb,
    updated_at timestamptz NOT NULL DEFAULT now(),
    deleted_at timestamptz
  );
  CREATE TABLE public.items (
    id uuid PRIMARY KEY,
    user_id uuid NOT NULL,
    store_id uuid,
    name text NOT NULL,
    description text,
    image_url text,
    images jsonb NOT NULL DEFAULT '[]'::jsonb,
    price_cents integer NOT NULL DEFAULT 0,
    original_price_cents integer,
    stock integer DEFAULT 0,
    is_published boolean NOT NULL DEFAULT false,
    handle text,
    category text,
    visible_categories text[] NOT NULL DEFAULT '{}',
    badge text,
    sale_tag text,
    free_delivery boolean NOT NULL DEFAULT false,
    sale_ends_at timestamptz,
    sold_count bigint NOT NULL DEFAULT 0,
    deleted_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now()
  );
  CREATE TABLE public.store_pages (
    id uuid PRIMARY KEY,
    store_id uuid NOT NULL,
    title text NOT NULL,
    handle text NOT NULL,
    category text NOT NULL,
    page_kind text NOT NULL,
    content jsonb NOT NULL DEFAULT '{}'::jsonb,
    status text NOT NULL,
    seo jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    deleted_at timestamptz
  );
  CREATE TABLE public.store_collections (
    id uuid PRIMARY KEY,
    store_id uuid NOT NULL,
    title text NOT NULL,
    handle text NOT NULL,
    collection_type text NOT NULL DEFAULT 'manual',
    rules jsonb NOT NULL DEFAULT '[]'::jsonb,
    status text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    deleted_at timestamptz
  );
  CREATE TABLE public.product_variants (
    id uuid PRIMARY KEY,
    store_id uuid NOT NULL,
    product_id uuid NOT NULL,
    title text NOT NULL,
    price_cents integer NOT NULL,
    compare_at_price_cents integer,
    attributes jsonb NOT NULL DEFAULT '{}'::jsonb,
    deleted_at timestamptz
  );
  CREATE TABLE public.inventory_levels (
    store_id uuid NOT NULL,
    variant_id uuid NOT NULL,
    available integer NOT NULL DEFAULT 0,
    reserved integer NOT NULL DEFAULT 0,
    policy text NOT NULL,
    PRIMARY KEY (store_id, variant_id)
  );
  CREATE TABLE public.collection_products (
    store_id uuid NOT NULL,
    collection_id uuid NOT NULL,
    product_id uuid NOT NULL,
    sort_order integer NOT NULL DEFAULT 0,
    PRIMARY KEY (collection_id, product_id)
  );
  CREATE TABLE public.store_redirects (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    store_id uuid NOT NULL,
    source_path text NOT NULL,
    destination_path text NOT NULL,
    status_code integer NOT NULL DEFAULT 301,
    created_at timestamptz NOT NULL DEFAULT now(),
    deleted_at timestamptz
  );
  CREATE UNIQUE INDEX store_redirects_source_live_idx
    ON public.store_redirects(store_id, source_path) WHERE deleted_at IS NULL;
  CREATE TABLE public.store_domains (
    id uuid PRIMARY KEY,
    store_id uuid NOT NULL,
    hostname text NOT NULL UNIQUE,
    status text NOT NULL,
    seo_status text NOT NULL DEFAULT 'waiting_for_domain',
    is_primary boolean NOT NULL DEFAULT false,
    failure_code text,
    failure_message text,
    updated_at timestamptz NOT NULL DEFAULT now()
  );
  CREATE UNIQUE INDEX store_domains_primary_per_store_uidx
    ON public.store_domains(store_id) WHERE is_primary;
  CREATE TABLE public.domain_events (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    store_id uuid NOT NULL,
    domain_id uuid,
    event_type text NOT NULL,
    event_key text NOT NULL UNIQUE,
    payload jsonb NOT NULL DEFAULT '{}'::jsonb,
    occurred_at timestamptz NOT NULL DEFAULT now(),
    processed_at timestamptz
  );
  CREATE TABLE public.seo_sync_jobs (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    store_id uuid NOT NULL,
    domain_id uuid,
    job_type text NOT NULL,
    status text NOT NULL DEFAULT 'queued',
    idempotency_key text NOT NULL UNIQUE,
    payload jsonb NOT NULL DEFAULT '{}'::jsonb,
    attempts integer NOT NULL DEFAULT 0,
    max_attempts integer NOT NULL DEFAULT 12,
    run_after timestamptz NOT NULL DEFAULT now(),
    created_at timestamptz NOT NULL DEFAULT now()
  );
  CREATE TABLE public.google_integrations (
    store_id uuid PRIMARY KEY,
    refresh_token_ciphertext text,
    token_key_version integer,
    status text NOT NULL
  );
  CREATE TABLE public.google_oauth_states (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    code_verifier_ciphertext text,
    token_key_version integer
  );
  CREATE TABLE public.google_site_verifications (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    store_id uuid NOT NULL,
    domain_id uuid NOT NULL,
    token_ciphertext text,
    token_key_version integer,
    status text NOT NULL DEFAULT 'pending'
  );
  CREATE TABLE public.search_console_properties (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    store_id uuid NOT NULL,
    domain_id uuid NOT NULL,
    status text NOT NULL
  );

  INSERT INTO public.profiles(id, business_name, theme_published)
  VALUES ('${storeId}', 'Acme', '{}'::jsonb);
  INSERT INTO public.stores(id, owner_user_id, name, handle, status)
  VALUES ('${storeId}', '${storeId}', 'Acme', 'acme', 'published');
  INSERT INTO public.items(
    id, user_id, store_id, name, description, image_url, is_published, handle
  ) VALUES (
    '${productId}', '${storeId}', '${storeId}', 'Watch', 'Automatic watch',
    'https://cdn.example.com/watch.jpg', true, 'watch'
  );
  INSERT INTO public.store_pages(id, store_id, title, handle, category, page_kind, status)
  VALUES ('${pageId}', '${storeId}', 'About', 'about', 'content', 'about', 'published');
  INSERT INTO public.store_collections(id, store_id, title, handle, status)
  VALUES ('${collectionId}', '${storeId}', 'Watches', 'watches', 'published');
  INSERT INTO public.store_domains(id, store_id, hostname, status, is_primary)
  VALUES ('${domainId}', '${storeId}', 'shop.example.com', 'active', true);
  INSERT INTO public.google_integrations(store_id, status) VALUES ('${storeId}', 'connected');
  INSERT INTO public.search_console_properties(store_id, domain_id, status)
  VALUES ('${storeId}', '${domainId}', 'active');
`;

describe("SEO sitemap v2 PostgreSQL migration", () => {
  it("executes against the existing schema and preserves versioned activation semantics", async () => {
    const db = new PGlite();
    try {
      await db.exec(existingSchema);
      await db.exec(migration);
      await db.query(
        "INSERT INTO public.collection_products(store_id, collection_id, product_id) VALUES ($1, $2, $3)",
        [storeId, collectionId, productId],
      );

      const resources = await db.query<{ count: number }>(
        "SELECT count(*)::integer AS count FROM public.seo_resources WHERE store_id = $1",
        [storeId],
      );
      expect(resources.rows[0]?.count).toBe(5);

      const collectionCatalog = await db.query<{ id: string; total_count: number }>(
        "SELECT id, total_count::integer FROM public.get_public_collection_catalog($1, 'watches')",
        [storeId],
      );
      expect(collectionCatalog.rows).toEqual([{ id: productId, total_count: 1 }]);
      const collections = await db.query<{ handle: string }>(
        "SELECT handle FROM public.get_public_collections($1)",
        [storeId],
      );
      expect(collections.rows).toEqual([{ handle: "watches" }]);

      const snapshot = await db.query<{ snapshot: { dirtyVersion: number } }>(
        "SELECT public.get_sitemap_compile_snapshot($1::uuid) AS snapshot",
        [storeId],
      );
      const firstVersion = snapshot.rows[0]!.snapshot.dirtyVersion;
      const first = await db.query<{ id: string }>(
        "SELECT (public.begin_sitemap_generation($1::uuid, $2, $3, $4)).id AS id",
        [storeId, "shop.example.com", `stores/${storeId}/generations/1`, firstVersion],
      );
      const firstGenerationId = first.rows[0]!.id;

      await db.query("UPDATE public.items SET name = 'Updated watch' WHERE id = $1", [productId]);
      const changed = await db.query<{ dirty_version: number }>(
        "SELECT dirty_version FROM public.sitemap_store_state WHERE store_id = $1",
        [storeId],
      );
      expect(changed.rows[0]!.dirty_version).toBeGreaterThan(firstVersion);

      const segmentFor = (generation: number, contentHash: string) => JSON.stringify([{
        type: "products",
        number: 1,
        objectKey: `stores/${storeId}/generations/${generation}/sitemap_products_1.xml`,
        urlCount: 1,
        uncompressedBytes: 512,
        contentHash,
        lastModified: "2026-08-13T00:00:00.000Z",
      }]);
      await db.query(
        "SELECT public.activate_sitemap_generation($1::uuid, $2::jsonb, 1, $3)",
        [firstGenerationId, segmentFor(1, "a".repeat(64)), "b".repeat(64)],
      );
      const afterOldSnapshot = await db.query<{ dirty: boolean; active_generation_id: string }>(
        "SELECT dirty, active_generation_id FROM public.sitemap_store_state WHERE store_id = $1",
        [storeId],
      );
      expect(afterOldSnapshot.rows[0]).toMatchObject({
        dirty: true,
        active_generation_id: firstGenerationId,
      });

      const currentVersion = changed.rows[0]!.dirty_version;
      const older = await db.query<{ id: string }>(
        "SELECT (public.begin_sitemap_generation($1::uuid, $2, $3, $4)).id AS id",
        [storeId, "shop.example.com", `stores/${storeId}/generations/2`, currentVersion],
      );
      const newer = await db.query<{ id: string }>(
        "SELECT (public.begin_sitemap_generation($1::uuid, $2, $3, $4)).id AS id",
        [storeId, "shop.example.com", `stores/${storeId}/generations/3`, currentVersion],
      );
      await db.query(
        "SELECT public.activate_sitemap_generation($1::uuid, $2::jsonb, 1, $3)",
        [newer.rows[0]!.id, segmentFor(3, "c".repeat(64)), "d".repeat(64)],
      );
      await expect(db.query(
        "SELECT public.activate_sitemap_generation($1::uuid, $2::jsonb, 1, $3)",
        [older.rows[0]!.id, segmentFor(2, "e".repeat(64)), "f".repeat(64)],
      )).rejects.toThrow("Stale sitemap generation cannot be activated");
    } finally {
      await db.close();
    }
  }, 180_000);
});
