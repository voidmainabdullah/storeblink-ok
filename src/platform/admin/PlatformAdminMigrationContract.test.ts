import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(process.cwd(), "supabase/migrations/20260810000200_editor_admin_domain_repair.sql"),
  "utf8",
);

describe("editor and platform admin migration contract", () => {
  it("repairs the exact product field consumed by the editor", () => {
    expect(migration).toMatch(/ALTER TABLE public\.items[\s\S]*sold_count bigint/i);
    expect(migration).toMatch(/items_sold_count_nonnegative/i);
    expect(migration).toMatch(/items_store_best_sellers_idx/i);
  });

  it("keeps platform administration behind staff and AAL2 database checks", () => {
    expect(migration).toMatch(/private\.is_active_platform_staff\(auth\.uid\(\)\)/i);
    expect(migration).toMatch(/private\.has_aal2\(\)/i);
    expect(migration).toMatch(/REVOKE ALL ON FUNCTION public\.get_platform_domain_overview\(\)[\s\S]*FROM PUBLIC, anon/i);
  });

  it("does not hard-code a person or destructive all-user reset into schema deployment", () => {
    expect(migration).not.toMatch(/abdullahx\.ext@gmail\.com/i);
    expect(migration).not.toMatch(/TRUNCATE\s+TABLE/i);
    expect(migration).not.toMatch(/DELETE\s+FROM\s+public\.store_domains/i);
  });
});
