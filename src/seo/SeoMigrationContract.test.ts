import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(process.cwd(), "supabase/migrations/20260813000100_seo_sitemap_engine_v2.sql"),
  "utf8",
);

describe("SEO sitemap v2 migration contract", () => {
  it("acquires trigger-target DDL locks before backfills to avoid autosave deadlocks", () => {
    const storesLock = migration.indexOf(
      "LOCK TABLE public.stores IN ACCESS EXCLUSIVE MODE",
    );
    const sourceLocks = migration.indexOf("public.profiles,", storesLock);
    const firstBackfill = migration.indexOf("UPDATE public.google_integrations");

    expect(storesLock).toBeGreaterThan(-1);
    expect(sourceLocks).toBeGreaterThan(storesLock);
    expect(firstBackfill).toBeGreaterThan(sourceLocks);
    expect(migration).toContain("SET LOCAL lock_timeout = '90s'");
    expect(migration).toContain("public.store_domains\nIN ACCESS EXCLUSIVE MODE");
  });

  it("defines registry, metadata, immutable generations, segments, and dirty state", () => {
    for (const table of [
      "seo_resources",
      "seo_metadata",
      "sitemap_generations",
      "sitemap_segments",
      "sitemap_store_state",
      "indexnow_configurations",
    ]) {
      expect(migration).toContain(`CREATE TABLE IF NOT EXISTS public.${table}`);
    }
    expect(migration).toContain("UNIQUE (store_id, resource_type, resource_id)");
    expect(migration).toContain("sitemap_generations_one_active_idx");
  });

  it("uses a versioned atomic activation and lease-based dirty-store claim", () => {
    expect(migration).toContain("source_dirty_version");
    expect(migration).toContain("p_source_dirty_version bigint");
    expect(migration).toContain("Stale sitemap generation cannot be activated");
    expect(migration).toContain("ROLLBACK_CANCELLED");
    expect(migration).toContain("pg_advisory_xact_lock(hashtextextended(p_store_id::text || ':sitemap', 0))");
    expect(migration).toContain("dirty_version = public.sitemap_store_state.dirty_version + 1");
    expect(migration).toContain("FOR UPDATE OF state SKIP LOCKED");
    expect(migration).toContain("public.activate_sitemap_generation");
    expect(migration).toContain("public.rollback_sitemap_generation");
    expect(migration).toMatch(/rollback_sitemap_generation[\s\S]*active_generation_id = target\.id,[\s\n]+updated_at/);
    expect(migration).toContain("indexnow_full_refresh");
    expect(migration).toContain("changed_resource_keys");
    expect(migration).toContain("seo_status = 'sitemap_ready'");
  });

  it("removes request-per-edit legacy triggers and protects merchant writes behind a sanitizer RPC", () => {
    expect(migration).toContain("DROP TRIGGER IF EXISTS enqueue_sitemap_refresh ON public.items");
    expect(migration).toContain("CREATE OR REPLACE FUNCTION public.update_seo_metadata");
    expect(migration).toContain("CREATE TRIGGER seo_metadata_touch");
    expect(migration).toContain("AFTER INSERT OR UPDATE ON public.seo_metadata");
    expect(migration).not.toContain("GRANT INSERT, UPDATE ON public.seo_metadata TO authenticated");
    expect(migration).not.toContain("'sitemap-sweep:' || p_store_id");
  });

  it("tracks only public product changes while including variant price and inventory changes", () => {
    expect(migration).not.toContain("COALESCE(i.updated_at, i.created_at)");
    expect(migration).not.toContain("target_updated_at");
    expect(migration).toContain("CREATE TRIGGER seo_resource_sync_public_update");
    expect(migration).toContain("CREATE TRIGGER seo_product_variant_public_update");
    expect(migration).toContain("CREATE TRIGGER seo_inventory_public_update");
    expect(migration).toContain("CREATE TRIGGER seo_collection_membership_change");
    expect(migration).toContain("CREATE TRIGGER seo_profile_public_content_change");
    expect(migration).toContain("CREATE TRIGGER seo_primary_domain_change");
    expect(migration).toContain("'PRIMARY_DOMAIN_CHANGED'");
    expect(migration).toContain("PRODUCT_AVAILABILITY_CHANGED");
  });
});
