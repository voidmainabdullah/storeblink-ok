// @vitest-environment node

import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  "supabase/migrations/20260821000200_adaptive_server_compiler_jobs.sql",
  "utf8",
);
const baseMigration = readFileSync(
  "supabase/migrations/20260821000100_adaptive_commerce_runtime_v3.sql",
  "utf8",
).replace("CREATE EXTENSION IF NOT EXISTS pgcrypto;", "");
const edge = readFileSync("supabase/functions/compile-adaptive-storefront/index.ts", "utf8");
const rolloutEdge = readFileSync("supabase/functions/evaluate-adaptive-rollouts/index.ts", "utf8");
const rolloutScheduler = readFileSync(
  "supabase/migrations/20260821000500_adaptive_rollout_scheduler.sql",
  "utf8",
);
const storefrontWorker = readFileSync("worker/index.ts", "utf8");

describe("adaptive server compiler persistence boundary", () => {
  it("keeps job/source/candidate/publication RPCs service-role only", () => {
    expect(migration).toContain("auth.role() <> 'service_role'");
    expect(migration).toContain("persist_adaptive_storefront_compile_candidate");
    expect(migration).toContain("publish_adaptive_storefront_compile_job");
    expect(migration).toContain("REVOKE ALL ON FUNCTION public.record_adaptive_shadow_compilation");
    expect(migration).toMatch(/publish_adaptive_storefront_compile_job[\s\S]+TO service_role;/);
  });

  it("serializes canonical source writes with publish and rejects stale artifacts", () => {
    expect(migration).toContain("pg_advisory_xact_lock(hashtextextended(target_store_id::text, 0))");
    expect(migration).toContain("adaptive_runtime_artifact_source_revision_guard");
    expect(migration).toContain("Adaptive storefront source changed during compilation");
  });

  it("makes compile/incident audit events immutable", () => {
    expect(migration).toContain("adaptive_compile_job_events_immutable");
    expect(migration).toContain("adaptive_runtime_incidents_immutable");
    expect(migration).toContain("private.prevent_adaptive_immutable_change()");
  });

  it("does not let the browser supply compiler-owned artifact identity", () => {
    expect(edge).toContain("const allowedKeys = new Set");
    expect(edge).not.toMatch(/allowedKeys[\s\S]{0,500}["']artifact(?:Hash|Id)?["']/);
    expect(edge).toContain("jobId: crypto.randomUUID()");
    expect(edge).toContain("ADAPTIVE_COMPILER_WORKER_SECRET");
    expect(edge).not.toContain("SUPABASE_SERVICE_ROLE_KEY");
  });

  it("exposes only a secret-authenticated schedule tick for rollout evaluation", () => {
    expect(rolloutEdge).toContain("ADAPTIVE_ROLLOUT_CRON_SECRET");
    expect(rolloutEdge).toContain("constantTimeEqual");
    expect(rolloutEdge).toContain("evaluationId: crypto.randomUUID()");
    expect(rolloutEdge).not.toContain("storeId");
    expect(rolloutEdge).not.toContain("commit_adaptive_rollout_evaluation");
    expect(rolloutEdge).not.toContain("SUPABASE_SERVICE_ROLE_KEY");
  });

  it("installs one Vault-backed rollout schedule owner without a duplicate Worker cron", () => {
    expect(rolloutScheduler).toContain("private.invoke_adaptive_rollout_evaluator()");
    expect(rolloutScheduler).toContain("adaptive_rollout_edge_url");
    expect(rolloutScheduler).toContain("adaptive_rollout_cron_secret");
    expect(rolloutScheduler).toContain("storeblink-adaptive-rollout-evaluator");
    expect(rolloutScheduler).toContain("*/5 * * * *");
    expect(storefrontWorker).not.toContain("runAdaptiveRolloutBatch(env)");
  });

  it("installs after the v3 persistence foundation in PostgreSQL", async () => {
    const db = new PGlite();
    try {
      await db.exec(`
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
        CREATE TABLE public.profiles (id uuid PRIMARY KEY, theme_revision bigint NOT NULL DEFAULT 0);
        CREATE TABLE public.stores (
          id uuid PRIMARY KEY, owner_user_id uuid NOT NULL REFERENCES public.profiles(id),
          handle text NOT NULL UNIQUE, status text NOT NULL, locale text NOT NULL DEFAULT 'en',
          currency text NOT NULL DEFAULT 'USD', deleted_at timestamptz
        );
        CREATE TABLE public.storefront_publications (
          id uuid PRIMARY KEY, store_id uuid REFERENCES public.stores(id),
          revision bigint NOT NULL DEFAULT 1, snapshot jsonb NOT NULL DEFAULT '{}'::jsonb
        );
      `);
      await db.exec(baseMigration);
      await db.exec(migration);
      const functions = await db.query<{ name: string }>(`
        SELECT proname AS name FROM pg_proc WHERE proname IN (
          'claim_adaptive_storefront_compile_job',
          'load_adaptive_storefront_compile_catalog',
          'persist_adaptive_storefront_compile_candidate',
          'publish_adaptive_storefront_compile_job',
          'load_adaptive_rollout_evaluation_input',
          'list_adaptive_rollouts_due_for_evaluation'
        ) ORDER BY proname
      `);
      expect(functions.rows.map((row) => row.name).sort()).toEqual([
        "claim_adaptive_storefront_compile_job",
        "list_adaptive_rollouts_due_for_evaluation",
        "load_adaptive_rollout_evaluation_input",
        "load_adaptive_storefront_compile_catalog",
        "persist_adaptive_storefront_compile_candidate",
        "publish_adaptive_storefront_compile_job",
      ]);
    } finally {
      await db.close();
    }
  }, 30_000);
});
