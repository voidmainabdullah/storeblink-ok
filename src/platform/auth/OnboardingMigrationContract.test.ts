import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(process.cwd(), "supabase/migrations/20260810000100_onboarding_completion.sql"),
  "utf8",
);

describe("onboarding completion migration contract", () => {
  it("backfills profile, store, and active owner membership for existing users", () => {
    expect(migration).toMatch(/INSERT INTO public\.profiles[\s\S]+FROM auth\.users/);
    expect(migration).toMatch(/INSERT INTO public\.stores[\s\S]+owner_user_id/);
    expect(migration).toMatch(
      /INSERT INTO public\.store_members[\s\S]+\s'owner',\s*'active'/,
    );
  });

  it("completes onboarding through one authenticated atomic RPC", () => {
    expect(migration).toContain("CREATE OR REPLACE FUNCTION public.complete_store_onboarding");
    expect(migration).toContain("current_user_id uuid := auth.uid()");
    expect(migration).toMatch(/onboarding_completed\s*=\s*true/);
    expect(migration).toContain("pg_advisory_xact_lock");
    expect(migration).toContain("'onboarding_completed', true");
  });

  it("keeps the RPC off the anonymous and public grant surface", () => {
    expect(migration).toMatch(
      /REVOKE ALL ON FUNCTION public\.complete_store_onboarding[\s\S]+FROM PUBLIC, anon/,
    );
    expect(migration).toMatch(
      /GRANT EXECUTE ON FUNCTION public\.complete_store_onboarding[\s\S]+TO authenticated, service_role/,
    );
  });
});
