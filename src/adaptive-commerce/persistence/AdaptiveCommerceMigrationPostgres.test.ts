// @vitest-environment node

import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const migration = readFileSync(
  resolve(process.cwd(), "supabase/migrations/20260821000100_adaptive_commerce_runtime_v3.sql"),
  "utf8",
).replace("CREATE EXTENSION IF NOT EXISTS pgcrypto;", "");

const existingSchema = `
  CREATE ROLE anon NOLOGIN;
  CREATE ROLE authenticated NOLOGIN;
  CREATE ROLE service_role NOLOGIN;
  CREATE SCHEMA auth;
  CREATE SCHEMA private;

  CREATE TABLE auth.users (id uuid PRIMARY KEY);
  CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT NULL::uuid $$;
  CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE AS $$ SELECT 'service_role'::text $$;
  CREATE FUNCTION private.has_store_capability(uuid, text, uuid DEFAULT auth.uid())
  RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER AS $$ SELECT true $$;

  CREATE TABLE public.profiles (
    id uuid PRIMARY KEY,
    theme_revision bigint NOT NULL DEFAULT 0
  );
  CREATE TABLE public.stores (
    id uuid PRIMARY KEY,
    owner_user_id uuid NOT NULL REFERENCES public.profiles(id),
    handle text NOT NULL UNIQUE,
    status text NOT NULL,
    deleted_at timestamptz
  );
  CREATE TABLE public.storefront_publications (
    id uuid PRIMARY KEY
  );
`;

describe("Adaptive Commerce v3 PostgreSQL migration", () => {
  it("parses and installs its tables, triggers, RLS, and atomic RPCs", async () => {
    const db = new PGlite();
    try {
      await db.exec(existingSchema);
      await db.exec(migration);
      const result = await db.query<{ name: string }>(`
        SELECT proname AS name
        FROM pg_proc
        WHERE proname IN (
          'commit_adaptive_store_kit_installation',
          'publish_adaptive_storefront',
          'commit_adaptive_rollout_evaluation',
          'get_public_adaptive_storefront_artifact'
        )
        ORDER BY proname
      `);
      expect(result.rows.map((row) => row.name)).toEqual([
        "commit_adaptive_rollout_evaluation",
        "commit_adaptive_store_kit_installation",
        "get_public_adaptive_storefront_artifact",
        "publish_adaptive_storefront",
      ]);
      const tables = await db.query<{ name: string }>(`
        SELECT tablename AS name
        FROM pg_tables
        WHERE schemaname = 'public' AND tablename LIKE 'adaptive_%'
      `);
      expect(tables.rows.length).toBeGreaterThanOrEqual(15);
    } finally {
      await db.close();
    }
  }, 30_000);
});
