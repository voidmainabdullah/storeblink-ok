// @vitest-environment node

import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const migration = (name: string) => readFileSync(
  resolve(process.cwd(), `supabase/migrations/${name}`),
  "utf8",
);

const baseMigration = migration(
  "20260821000100_adaptive_commerce_runtime_v3.sql",
).replace("CREATE EXTENSION IF NOT EXISTS pgcrypto;", "");
const compilerMigration = migration(
  "20260821000200_adaptive_server_compiler_jobs.sql",
);
const lifecycleMigration = migration(
  "20260821000300_adaptive_store_kit_staged_activation.sql",
);

const existingSchema = `
  CREATE ROLE anon NOLOGIN;
  CREATE ROLE authenticated NOLOGIN;
  CREATE ROLE service_role NOLOGIN;
  CREATE SCHEMA auth;
  CREATE SCHEMA private;

  CREATE TABLE auth.users (id uuid PRIMARY KEY);
  CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE
    AS $$ SELECT '00000000-0000-0000-0000-000000000001'::uuid $$;
  CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE
    AS $$ SELECT 'service_role'::text $$;
  CREATE FUNCTION private.has_store_capability(uuid, text, uuid DEFAULT auth.uid())
  RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER AS $$ SELECT true $$;
  -- PGlite does not ship pgcrypto. A stable 32-byte digest is enough to parse
  -- and exercise transaction ownership; production PostgreSQL uses pgcrypto.
  CREATE FUNCTION public.digest(bytea, text) RETURNS bytea LANGUAGE sql IMMUTABLE
    AS $$ SELECT decode(repeat('ab', 32), 'hex') $$;

  CREATE TABLE public.profiles (
    id uuid PRIMARY KEY,
    theme_revision bigint NOT NULL DEFAULT 0
  );
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

const hash = (digit: string) => `sha256:${digit.repeat(64)}`;
const STORE_ID = "10000000-0000-0000-0000-000000000001";

const catalogFixture = () => {
  const routes = ["home", "product", "collection", "page", "blog", "cart", "search", "404"];
  const blueprints = Object.fromEntries(routes.map((route, index) => [route, {
    id: `${route}-blueprint`,
    version: "1.0.0",
    integrity: hash((index + 1).toString(16)),
  }]));
  const lockfile = {
    designPack: { id: "professional", version: "1.0.0", integrity: hash("a") },
    componentLibrary: { id: "commerce", version: "1.0.0", integrity: hash("b") },
    blueprints,
    engineSchemaVersion: 1,
    tokenSchemaVersion: "2025.10",
    migrationIds: [],
    capabilityPolicyVersion: "1.0.0",
  };
  return { routes, lockfile };
};

const sqlJson = (value: unknown) => `'${JSON.stringify(value).split("'").join("''")}'::jsonb`;

describe("staged StoreKit lifecycle PostgreSQL migration", () => {
  it("installs after the compiler-job migration with the staged RPC boundary", async () => {
    const db = new PGlite();
    try {
      await db.exec(existingSchema);
      await db.exec(baseMigration);
      await db.exec(compilerMigration);
      await db.exec(lifecycleMigration);
      const functions = await db.query<{ name: string }>(`
        SELECT proname AS name
        FROM pg_proc
        WHERE proname IN (
          'stage_adaptive_store_kit_installation',
          'record_adaptive_installation_shadow',
          'activate_adaptive_store_kit_installation'
        ) ORDER BY proname
      `);
      expect(functions.rows.map((row) => row.name)).toEqual([
        "activate_adaptive_store_kit_installation",
        "record_adaptive_installation_shadow",
        "stage_adaptive_store_kit_installation",
      ]);
      const columns = await db.query<{ name: string }>(`
        SELECT column_name AS name
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'adaptive_store_kit_installations'
          AND column_name IN (
            'store_definition', 'source_revision', 'source_hash',
            'preset_id', 'design_token_overrides', 'commerce_bindings'
          ) ORDER BY column_name
      `);
      expect(columns.rows.map((row) => row.name)).toEqual([
        "commerce_bindings",
        "design_token_overrides",
        "preset_id",
        "source_hash",
        "source_revision",
        "store_definition",
      ]);

      const { routes, lockfile } = catalogFixture();
      await db.exec(`
        INSERT INTO auth.users(id) VALUES ('00000000-0000-0000-0000-000000000001');
        INSERT INTO public.profiles(id) VALUES ('00000000-0000-0000-0000-000000000001');
        INSERT INTO public.stores(
          id, owner_user_id, handle, status, locale, currency
        ) VALUES (
          '${STORE_ID}', '00000000-0000-0000-0000-000000000001',
          'staged-lifecycle', 'active', 'en', 'USD'
        );
        INSERT INTO public.adaptive_design_pack_versions(
          design_pack_id, version, schema_version, definition, integrity_hash, status
        ) VALUES (
          'professional', '1.0.0', 1,
          ${sqlJson({ presets: [{ id: "warm" }] })}, '${hash("a")}', 'released'
        );
        INSERT INTO public.adaptive_component_library_versions(
          component_library_id, version, schema_version, definition, integrity_hash, status
        ) VALUES ('commerce', '1.0.0', 1, '{}'::jsonb, '${hash("b")}', 'released');
        ${routes.map((route, index) => `
          INSERT INTO public.adaptive_template_blueprint_versions(
            blueprint_id, version, resource_type, schema_version, definition,
            integrity_hash, status
          ) VALUES (
            '${route}-blueprint', '1.0.0', '${route}', 1, '{}'::jsonb,
            '${hash((index + 1).toString(16))}', 'released'
          );
        `).join("\n")}
        INSERT INTO public.adaptive_store_kit_versions(
          store_kit_id, version, schema_version, engine_version,
          design_pack_id, design_pack_version,
          component_library_id, component_library_version,
          lockfile, definition, integrity_hash, status
        ) VALUES (
          'professional-store', '1.0.0', 1, '1.0.0',
          'professional', '1.0.0', 'commerce', '1.0.0',
          ${sqlJson(lockfile)}, ${sqlJson({ defaultPresetId: "warm" })},
          '${hash("c")}', 'draft'
        );
        ${routes.map((route, index) => `
          INSERT INTO public.adaptive_store_kit_blueprint_pins(
            store_kit_id, store_kit_version, resource_type,
            blueprint_id, blueprint_version, integrity_hash
          ) VALUES (
            'professional-store', '1.0.0', '${route}',
            '${route}-blueprint', '1.0.0', '${hash((index + 1).toString(16))}'
          );
        `).join("\n")}
        UPDATE public.adaptive_store_kit_versions SET status = 'released'
        WHERE store_kit_id = 'professional-store' AND version = '1.0.0';
      `);

      const base = {
        schemaVersion: 1,
        revisionId: "base-v1",
        baseHash: hash("d"),
        values: { "home.hero.heading": "Welcome" },
        collections: {},
      };
      const patches = [{
        id: "patch-one",
        storeId: STORE_ID,
        baseRevisionId: "base-v1",
        sequence: 1,
        status: "active",
        operations: [{ op: "set", target: "home.hero.heading", value: "Merchant" }],
        createdAt: "2026-08-21T10:00:00.000Z",
        createdBy: "merchant-one",
      }];
      const bindings = [{
        id: "hero-title",
        source: { kind: "product", selector: "featured" },
        field: "title",
        target: { path: "home.hero", property: "text" },
        required: false,
      }];
      const stage = async (idempotencyKey: string, expectedRevision: number) => {
        const result = await db.query<{ value: Record<string, unknown> }>(`
          SELECT public.stage_adaptive_store_kit_installation(
            '${STORE_ID}', 'professional-store', '1.0.0', ${sqlJson(lockfile)},
            ${sqlJson({ presetId: "warm", overrides: [] })}, ${sqlJson(base)},
            ${sqlJson(patches)}, ${sqlJson(bindings)}, ${expectedRevision},
            '${idempotencyKey}'
          ) AS value
        `);
        return result.rows[0].value as Record<string, any>;
      };

      const firstStage = await stage("stage-first-install", 0);
      const firstInstall = firstStage.installation as Record<string, any>;
      expect(firstStage.outcome).toBe("staged");
      expect(firstInstall.status).toBe("staged");
      expect(firstInstall.sourceHash).toMatch(/^sha256:[a-f0-9]{64}$/);
      expect(firstInstall.sourceRevision).toBe(2);
      expect((await stage("stage-first-install", 0)).installation.id).toBe(firstInstall.id);

      const artifactFor = (installationId: string, artifactHash: string) => ({
        kind: "runtime-artifact",
        artifactVersion: 1,
        id: `artifact-${artifactHash.slice(-4)}`,
        storeId: STORE_ID,
        installationId,
        storeKit: { id: "professional-store", version: "1.0.0", integrity: hash("c") },
        compilerVersion: "1.0.0",
        sourceHash: hash("e"),
        artifactHash,
        routes: Object.fromEntries(routes.map((route) => [route, {}])),
      });
      const acceptShadow = async (installation: Record<string, any>, artifact: unknown) => {
        const result = await db.query<{ id: string }>(`
          SELECT public.record_adaptive_installation_shadow(
            '${STORE_ID}', '${installation.id}', ${installation.sourceRevision},
            '${installation.sourceHash}', ${sqlJson(artifact)},
            '${(artifact as { artifactHash: string }).artifactHash}',
            '{"status":"equal"}'::jsonb, NULL, 'accepted'
          )::text AS id
        `);
        return result.rows[0].id;
      };
      const activate = async (
        installation: Record<string, any>,
        artifact: ReturnType<typeof artifactFor>,
        shadowId: string,
        pointerRevision: number,
      ) => db.query<{ value: Record<string, any> }>(`
        SELECT public.activate_adaptive_store_kit_installation(
          '${STORE_ID}', '${installation.id}', '${shadowId}',
          ${installation.revision}, ${installation.sourceRevision},
          '${installation.sourceHash}', ${sqlJson(artifact)}, '${artifact.artifactHash}',
          '1.0.0', ${pointerRevision}
        ) AS value
      `);

      const firstArtifact = artifactFor(firstInstall.id, hash("1"));
      const firstShadow = await acceptShadow(firstInstall, firstArtifact);
      const firstActivation = await activate(firstInstall, firstArtifact, firstShadow, 0);
      expect(firstActivation.rows[0].value.status).toBe("active");
      expect(firstActivation.rows[0].value.pointerRevision).toBe(1);

      const secondStage = await stage("stage-second-install", 1);
      const secondInstall = secondStage.installation as Record<string, any>;
      const secondArtifact = artifactFor(secondInstall.id, hash("2"));
      const secondShadow = await acceptShadow(secondInstall, secondArtifact);
      await expect(activate(secondInstall, secondArtifact, secondShadow, 0)).rejects.toThrow();

      const preserved = await db.query<{ active_id: string; pointer_revision: number }>(`
        SELECT installation.id::text AS active_id, pointer.pointer_revision
        FROM public.adaptive_store_kit_installations installation
        JOIN public.adaptive_storefront_active_publications pointer
          ON pointer.store_id = installation.store_id
        WHERE installation.store_id = '${STORE_ID}' AND installation.status = 'active'
      `);
      expect(preserved.rows[0]).toEqual({
        active_id: firstInstall.id,
        pointer_revision: 1,
      });

      const secondActivation = await activate(secondInstall, secondArtifact, secondShadow, 1);
      expect(secondActivation.rows[0].value.previousInstallationId).toBe(firstInstall.id);
      expect(secondActivation.rows[0].value.pointerRevision).toBe(2);

      await db.exec(`
        CREATE OR REPLACE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE
          AS $$ SELECT 'authenticated'::text $$;
      `);
      await expect(db.query(`
        SELECT public.record_adaptive_installation_shadow(
          '${STORE_ID}', '${secondInstall.id}', ${secondInstall.sourceRevision},
          '${secondInstall.sourceHash}', ${sqlJson(secondArtifact)},
          '${secondArtifact.artifactHash}', '{"status":"equal"}'::jsonb,
          NULL, 'accepted'
        )
      `)).rejects.toThrow(/Server-owned shadow candidate required/);
      await expect(db.query(`
        SELECT public.commit_adaptive_store_kit_installation(
          '${STORE_ID}', 'professional-store', '1.0.0', ${sqlJson(lockfile)},
          ${sqlJson(base)}, '${hash("d")}', 2, 'unsafe-old-commit'
        )
      `)).rejects.toThrow(/Deprecated unsafe install RPC/);
      const terminalState = await db.query<{ active_count: number; pointer_revision: number }>(`
        SELECT count(*) FILTER (WHERE installation.status = 'active')::integer AS active_count,
          max(pointer.pointer_revision)::integer AS pointer_revision
        FROM public.adaptive_store_kit_installations installation
        JOIN public.adaptive_storefront_active_publications pointer
          ON pointer.store_id = installation.store_id
        WHERE installation.store_id = '${STORE_ID}'
      `);
      expect(terminalState.rows[0]).toEqual({ active_count: 1, pointer_revision: 2 });
    } finally {
      await db.close();
    }
  }, 30_000);
});
