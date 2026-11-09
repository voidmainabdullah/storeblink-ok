import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const migrationPath = resolve(
  process.cwd(),
  "supabase/migrations/20260821000100_adaptive_commerce_runtime_v3.sql",
);

describe("Adaptive Commerce v3 persistence migration", () => {
  const sql = readFileSync(migrationPath, "utf8");

  it("keeps the v3 domain additive and immutable", () => {
    expect(sql).toContain("CREATE TABLE IF NOT EXISTS public.adaptive_store_kit_versions");
    expect(sql).toContain("CREATE TABLE IF NOT EXISTS public.adaptive_storefront_runtime_artifacts");
    expect(sql).toContain("CREATE TABLE IF NOT EXISTS public.adaptive_storefront_active_publications");
    expect(sql).toContain("private.prevent_adaptive_immutable_change()");
    expect(sql).not.toMatch(/DROP\s+TABLE\s+(?:IF\s+EXISTS\s+)?public\.(?:theme_|storefront_)/i);
    expect(sql).not.toContain("REVOKE ALL ON ALL TABLES IN SCHEMA public");
  });

  it("requires complete pinned StoreKits and an accepted shadow before activation", () => {
    expect(sql).toContain("p_lockfile -> 'blueprints'");
    for (const resource of [
      "home",
      "product",
      "collection",
      "page",
      "blog",
      "cart",
      "search",
      "404",
    ]) {
      expect(sql).toContain(`'${resource}'`);
    }
    expect(sql).toContain("released_dependency_count <> 8");
    expect(sql).toContain("Accepted shadow compilation required");
    expect(sql).toContain("Server-owned compiler required");
  });

  it("uses pointer swaps for publish and rollback without rewriting artifacts", () => {
    expect(sql).toContain("public.publish_adaptive_storefront(");
    expect(sql).toContain("public.activate_adaptive_storefront_publication(");
    expect(sql).toContain("previous_publication_id = current_publication_id");
    expect(sql).not.toMatch(/UPDATE\s+public\.adaptive_storefront_runtime_artifacts/i);
    expect(sql).not.toMatch(/DELETE\s+FROM\s+public\.adaptive_storefront_runtime_artifacts/i);
  });

  it("fails public artifact resolution closed and accepts only bounded RUM fields", () => {
    expect(sql).toContain("OR rollout.kill_switch");
    expect(sql).toContain("OR artifact.id IS NULL");
    expect(sql).toMatch(/THEN\s+jsonb_build_object\(\s*'runtime',\s*'legacy'/);
    expect(sql).toContain("metric IN ('LCP', 'CLS', 'INP', 'render-error')");
    expect(sql).toContain("error_code text CHECK");
    expect(sql).toContain("public.commit_adaptive_rollout_evaluation(");
    expect(sql).toContain("assignment.store_id IS NULL");
  });
});
