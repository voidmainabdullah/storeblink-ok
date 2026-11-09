// @vitest-environment node

import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";

const readMigration = (name: string): string => readFileSync(
  `supabase/migrations/${name}`,
  "utf8",
);
const base = readMigration("20260821000100_adaptive_commerce_runtime_v3.sql")
  .replace("CREATE EXTENSION IF NOT EXISTS pgcrypto;", "");
const compiler = readMigration("20260821000200_adaptive_server_compiler_jobs.sql");
const installation = readMigration("20260821000300_adaptive_store_kit_staged_activation.sql");
const authoring = readMigration("20260821000400_adaptive_storefront_authoring.sql");
const review = readMigration("20260826000100_adaptive_shadow_review_lifecycle.sql");
const reviewSurface = readMigration("20260827000100_adaptive_release_review_surface.sql");

const storeId = "10000000-0000-4000-8000-000000000001";
const installationId = "20000000-0000-4000-8000-000000000001";
const jobId = "30000000-0000-4000-8000-000000000001";
const userId = "00000000-0000-4000-8000-000000000001";
const hash = (digit: string): string => `sha256:${digit.repeat(64)}`;

const schema = `
  CREATE ROLE anon NOLOGIN;
  CREATE ROLE authenticated NOLOGIN;
  CREATE ROLE service_role NOLOGIN;
  CREATE SCHEMA auth;
  CREATE SCHEMA private;
  CREATE TABLE auth.users (id uuid PRIMARY KEY);
  CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE
    AS $$ SELECT '${userId}'::uuid $$;
  CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE
    AS $$ SELECT 'service_role'::text $$;
  CREATE FUNCTION private.has_store_capability(uuid, text, uuid DEFAULT auth.uid())
    RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER AS $$ SELECT true $$;
  CREATE FUNCTION public.digest(bytea, text) RETURNS bytea LANGUAGE sql IMMUTABLE AS $$
    SELECT decode(
      md5(encode($1, 'hex')) || md5('adaptive:' || encode($1, 'hex')),
      'hex'
    )
  $$;
  CREATE TABLE public.profiles (id uuid PRIMARY KEY, theme_revision bigint NOT NULL DEFAULT 0);
  CREATE TABLE public.stores (
    id uuid PRIMARY KEY,
    owner_user_id uuid NOT NULL REFERENCES public.profiles(id),
    handle text NOT NULL UNIQUE,
    status text NOT NULL,
    locale text NOT NULL DEFAULT 'en',
    currency text NOT NULL DEFAULT 'USD',
    deleted_at timestamptz
  );
  CREATE TABLE public.storefront_publications (
    id uuid PRIMARY KEY,
    store_id uuid,
    revision bigint,
    snapshot jsonb
  );
`;

describe("manual adaptive shadow review migration", () => {
  it("exposes narrow role-separated RPCs", () => {
    expect(review).toContain("record_adaptive_compile_job_shadow");
    expect(review).toContain("review_adaptive_shadow_compilation");
    expect(review).toContain("publish_reviewed_adaptive_storefront_compile_job");
    expect(review).toMatch(/review_adaptive_shadow_compilation[\s\S]+TO authenticated;/);
    expect(review).toMatch(/publish_reviewed_adaptive_storefront_compile_job[\s\S]+TO service_role;/);
    expect(review).not.toMatch(/review_adaptive_shadow_compilation\([\s\S]{0,300}p_artifact/i);
    expect(reviewSurface).toContain("load_adaptive_storefront_release_review");
    expect(reviewSurface).toContain("private.has_store_capability(p_store_id, 'theme.read'");
    expect(reviewSurface).not.toContain("'candidateArtifact'");
    expect(reviewSurface).toMatch(/TO authenticated, service_role;/);
  });

  it("reviews and atomically publishes the exact persisted candidate", async () => {
    const db = new PGlite();
    try {
      await db.exec(schema);
      await db.exec(base);
      await db.exec(compiler);
      await db.exec(installation);
      await db.exec(authoring);
      await db.exec(review);
      await db.exec(reviewSurface);
      const artifact = {
        kind: "runtime-artifact",
        artifactVersion: 1,
        id: jobId,
        storeId,
        installationId,
        storeKit: { id: "kit", version: "1.0.0", integrity: hash("9") },
        compilerVersion: "1.0.0",
        sourceHash: hash("4"),
        artifactHash: hash("5"),
        routes: Object.fromEntries(
          ["home", "product", "collection", "page", "blog", "cart", "search", "404"]
            .map((route) => [route, {}]),
        ),
        globals: {},
        resolvedTokens: {},
        componentVersions: {},
        bindingPlans: {},
        assets: [],
      };
      const json = JSON.stringify(artifact).split("'").join("''");
      await db.exec(`
        INSERT INTO auth.users(id) VALUES ('${userId}');
        INSERT INTO public.profiles(id) VALUES ('${userId}');
        INSERT INTO public.stores(id, owner_user_id, handle, status)
          VALUES ('${storeId}', '${userId}', 'shadow-review-store', 'active');
        INSERT INTO public.adaptive_design_pack_versions(
          design_pack_id, version, schema_version, definition, integrity_hash, status
        ) VALUES ('pack', '1.0.0', 1, '{}'::jsonb, '${hash("1")}', 'released');
        INSERT INTO public.adaptive_component_library_versions(
          component_library_id, version, schema_version, definition, integrity_hash, status
        ) VALUES ('library', '1.0.0', 1, '{}'::jsonb, '${hash("2")}', 'released');
        INSERT INTO public.adaptive_store_kit_versions(
          store_kit_id, version, schema_version, engine_version,
          design_pack_id, design_pack_version, component_library_id,
          component_library_version, lockfile, definition, integrity_hash, status
        ) VALUES (
          'kit', '1.0.0', 1, '1.0.0', 'pack', '1.0.0', 'library', '1.0.0',
          '{}'::jsonb, '{}'::jsonb, '${hash("9")}', 'released'
        );
        INSERT INTO public.adaptive_store_kit_installations(
          id, store_id, store_kit_id, store_kit_version, lockfile, status,
          revision, idempotency_key, store_definition, source_revision, source_hash
        ) VALUES (
          '${installationId}', '${storeId}', 'kit', '1.0.0', '{}'::jsonb, 'active',
          1, 'installed-kit-one', '{}'::jsonb, 1, '${hash("3")}'
        );
        INSERT INTO public.adaptive_storefront_source_heads(installation_id, store_id, revision)
          VALUES ('${installationId}', '${storeId}', 1)
          ON CONFLICT (installation_id) DO UPDATE SET revision = EXCLUDED.revision;
        INSERT INTO public.adaptive_storefront_compile_jobs(
          id, store_id, installation_id, idempotency_key, request_hash,
          expected_source_revision, expected_pointer_revision, intent, state,
          candidate_artifact, candidate_artifact_hash, candidate_compiler_version,
          candidate_source_revision
        ) VALUES (
          '${jobId}', '${storeId}', '${installationId}', 'compile-review-one', '${hash("6")}',
          1, 0, 'publish', 'shadowing', '${json}'::jsonb, '${hash("5")}', '1.0.0', 1
        );
      `);
      const shadow = await db.query<{ id: string }>(`
        SELECT public.record_adaptive_compile_job_shadow(
          '${jobId}',
          '{"status":"different","legacyHash":"${hash("1")}","adaptiveHash":"${hash("5")}","changes":[{"path":"home.hero","beforeHash":"${hash("2")}","afterHash":"${hash("3")}"}]}'::jsonb,
          NULL,
          'pending'
        )::text AS id
      `);
      const shadowId = shadow.rows[0].id;
      await db.query(`
        SELECT public.transition_adaptive_storefront_compile_job(
          '${jobId}', 'shadowing', 'succeeded', jsonb_build_object(
            'jobId', '${jobId}', 'sourceRevision', 1,
            'artifactHash', '${hash("5")}', 'shadowId', '${shadowId}',
            'shadowStatus', 'pending', 'publicationId', NULL,
            'pointerRevision', NULL, 'published', false
          )
        )
      `);
      await db.exec(`
        CREATE OR REPLACE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE
          AS $$ SELECT 'authenticated'::text $$;
      `);
      const accepted = await db.query<{ value: Record<string, unknown> }>(`
        SELECT public.review_adaptive_shadow_compilation(
          '${storeId}', '${shadowId}', 0, 'accept-shadow-one', 'accept'
        ) AS value
      `);
      expect(accepted.rows[0].value).toMatchObject({
        shadowId,
        status: "accepted",
        reviewRevision: 1,
        jobId,
        publishEligible: true,
      });
      const replay = await db.query<{ value: Record<string, unknown> }>(`
        SELECT public.review_adaptive_shadow_compilation(
          '${storeId}', '${shadowId}', 0, 'accept-shadow-one', 'accept'
        ) AS value
      `);
      expect(replay.rows[0].value).toEqual(accepted.rows[0].value);
      await expect(db.query(`
        SELECT public.review_adaptive_shadow_compilation(
          '${storeId}', '${shadowId}', 1, 'accept-shadow-two', 'reject'
        )
      `)).rejects.toThrow(/revision or state conflict/);

      await db.exec(`
        CREATE OR REPLACE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE
          AS $$ SELECT 'service_role'::text $$;
      `);
      const publication = await db.query<{ value: Record<string, unknown> }>(`
        SELECT public.publish_reviewed_adaptive_storefront_compile_job(
          '${storeId}', '${jobId}', 0
        ) AS value
      `);
      expect(publication.rows[0].value).toMatchObject({
        pointer_revision: 1,
        artifact_hash: hash("5"),
        idempotent: false,
      });
      const replayPublication = await db.query<{ value: Record<string, unknown> }>(`
        SELECT public.publish_reviewed_adaptive_storefront_compile_job(
          '${storeId}', '${jobId}', 0
        ) AS value
      `);
      expect(replayPublication.rows[0].value).toMatchObject({
        pointer_revision: 1,
        artifact_hash: hash("5"),
        idempotent: true,
      });
      const pointer = await db.query<{ revision: number; artifact_hash: string }>(`
        SELECT pointer.pointer_revision::integer AS revision, artifact.artifact_hash
        FROM public.adaptive_storefront_active_publications pointer
        JOIN public.adaptive_storefront_publications publication
          ON publication.id = pointer.publication_id
        JOIN public.adaptive_storefront_runtime_artifacts artifact
          ON artifact.id = publication.artifact_id
        WHERE pointer.store_id = '${storeId}'
      `);
      expect(pointer.rows).toEqual([{ revision: 1, artifact_hash: hash("5") }]);
      const releaseStatus = await db.query<{ value: Record<string, unknown> }>(`
        SELECT public.load_adaptive_storefront_release_review(
          '${storeId}', '${installationId}', 1
        ) AS value
      `);
      expect(releaseStatus.rows[0].value).toMatchObject({
        kind: "adaptive-release-review-snapshot",
        storeId,
        installationId,
        sourceRevision: 1,
        currentPointerRevision: 1,
        currentPublication: {
          installationId,
          sourceRevision: 1,
          pointerRevision: 1,
        },
        latestJob: {
          jobId,
          state: "succeeded",
          published: true,
          isCurrent: true,
          shadow: {
            shadowId,
            status: "accepted",
            reviewRevision: 1,
          },
        },
      });
      expect(JSON.stringify(releaseStatus.rows[0].value)).not.toContain("candidate_artifact");
      expect(JSON.stringify(releaseStatus.rows[0].value)).not.toMatch(/(?:legacyHash|adaptiveHash|beforeHash|afterHash)/);

      const opaqueJobId = "40000000-0000-4000-8000-000000000001";
      const opaqueArtifact = {
        ...artifact,
        id: opaqueJobId,
        artifactHash: hash("7"),
      };
      const opaqueJson = JSON.stringify(opaqueArtifact).split("'").join("''");
      await db.exec(`
        INSERT INTO public.adaptive_storefront_compile_jobs(
          id, store_id, installation_id, idempotency_key, request_hash,
          expected_source_revision, expected_pointer_revision, intent, state,
          candidate_artifact, candidate_artifact_hash, candidate_compiler_version,
          candidate_source_revision
        ) VALUES (
          '${opaqueJobId}', '${storeId}', '${installationId}', 'compile-opaque-one', '${hash("8")}',
          1, 1, 'shadow-only', 'shadowing', '${opaqueJson}'::jsonb, '${hash("7")}', '1.0.0', 1
        );
      `);
      const opaqueShadow = await db.query<{ id: string }>(`
        SELECT public.record_adaptive_compile_job_shadow(
          '${opaqueJobId}', '{"status":"uncomparable","reason":"opaque"}'::jsonb,
          NULL, 'uncomparable'
        )::text AS id
      `);
      const opaqueShadowId = opaqueShadow.rows[0].id;
      await db.query(`
        SELECT public.transition_adaptive_storefront_compile_job(
          '${opaqueJobId}', 'shadowing', 'succeeded', jsonb_build_object(
            'jobId', '${opaqueJobId}', 'sourceRevision', 1,
            'artifactHash', '${hash("7")}', 'shadowId', '${opaqueShadowId}',
            'shadowStatus', 'uncomparable', 'publicationId', NULL,
            'pointerRevision', NULL, 'published', false
          )
        )
      `);
      await db.exec(`
        CREATE OR REPLACE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE
          AS $$ SELECT 'authenticated'::text $$;
      `);
      await expect(db.query(`
        SELECT public.review_adaptive_shadow_compilation(
          '${storeId}', '${opaqueShadowId}', 0, 'opaque-review-before-evidence', 'accept'
        )
      `)).rejects.toThrow(/revision or state conflict/);
      await db.exec(`
        CREATE OR REPLACE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE
          AS $$ SELECT 'service_role'::text $$;
      `);
      const visual = await db.query<{ value: Record<string, unknown> }>(`
        SELECT public.record_adaptive_shadow_visual_evidence(
          '${opaqueShadowId}', 0, jsonb_build_object(
            'kind', 'adaptive-shadow-visual-evidence',
            'outcome', 'comparable',
            'artifactHash', '${hash("7")}',
            'evidenceHash', '${hash("a")}',
            'report', jsonb_build_object('changedPixels', 12)
          )
        ) AS value
      `);
      expect(visual.rows[0].value).toMatchObject({
        shadowId: opaqueShadowId,
        status: "pending",
        reviewRevision: 1,
      });
      await db.exec(`
        CREATE OR REPLACE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE
          AS $$ SELECT 'authenticated'::text $$;
      `);
      const visualAccepted = await db.query<{ value: Record<string, unknown> }>(`
        SELECT public.review_adaptive_shadow_compilation(
          '${storeId}', '${opaqueShadowId}', 1, 'opaque-review-after-evidence', 'accept'
        ) AS value
      `);
      expect(visualAccepted.rows[0].value).toMatchObject({
        shadowId: opaqueShadowId,
        status: "accepted",
        reviewRevision: 2,
      });
    } finally {
      await db.close();
    }
  }, 45_000);
});
