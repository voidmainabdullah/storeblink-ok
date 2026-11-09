// @vitest-environment node

import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createBuiltInAdaptiveCommerceCatalog } from "@/adaptive-commerce/fixtures";

const migration = (name: string) => readFileSync(
  resolve(process.cwd(), `supabase/migrations/${name}`),
  "utf8",
);
const migrations = [
  migration("20260821000100_adaptive_commerce_runtime_v3.sql")
    .replace("CREATE EXTENSION IF NOT EXISTS pgcrypto;", ""),
  migration("20260821000200_adaptive_server_compiler_jobs.sql"),
  migration("20260821000300_adaptive_store_kit_staged_activation.sql"),
  migration("20260821000400_adaptive_storefront_authoring.sql"),
];

const USER_ID = "00000000-0000-0000-0000-000000000001";
const STORE_ID = "10000000-0000-0000-0000-000000000001";
const existingSchema = `
  CREATE ROLE anon NOLOGIN;
  CREATE ROLE authenticated NOLOGIN;
  CREATE ROLE service_role NOLOGIN;
  CREATE SCHEMA auth;
  CREATE SCHEMA private;
  CREATE TABLE auth.users (id uuid PRIMARY KEY);
  CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE
    AS $$ SELECT '${USER_ID}'::uuid $$;
  CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE
    AS $$ SELECT 'service_role'::text $$;
  CREATE FUNCTION private.has_store_capability(uuid, text, uuid DEFAULT auth.uid())
  RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER AS $$ SELECT true $$;
  CREATE FUNCTION public.digest(bytea, text) RETURNS bytea LANGUAGE sql IMMUTABLE
    AS $$ SELECT decode(md5($1::text) || md5('adaptive:' || $1::text), 'hex') $$;
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
  CREATE TABLE public.storefront_publications (id uuid PRIMARY KEY, store_id uuid, revision bigint, snapshot jsonb);
`;

const sqlJson = (value: unknown) => `'${JSON.stringify(value).replace(/'/g, "''")}'::jsonb`;

describe("adaptive authoring PostgreSQL boundary", () => {
  it("loads with theme.read and saves atomically with theme.edit, revision, policy, and idempotency checks", async () => {
    const db = new PGlite();
    try {
      await db.exec(existingSchema);
      for (const sql of migrations) await db.exec(sql);
      const catalog = createBuiltInAdaptiveCommerceCatalog();
      const kit = catalog.storeKit;
      await db.exec(`
        INSERT INTO auth.users(id) VALUES ('${USER_ID}');
        INSERT INTO public.profiles(id) VALUES ('${USER_ID}');
        INSERT INTO public.stores(id, owner_user_id, handle, status, locale, currency)
        VALUES ('${STORE_ID}', '${USER_ID}', 'adaptive-authoring', 'active', 'en', 'USD');
        INSERT INTO public.adaptive_design_pack_versions(
          design_pack_id, version, schema_version, definition, integrity_hash, status
        ) VALUES (
          '${catalog.designPack.id}', '${catalog.designPack.version}', ${catalog.designPack.schemaVersion},
          ${sqlJson(catalog.designPack)}, '${catalog.designPack.integrity}', 'released'
        );
        INSERT INTO public.adaptive_component_library_versions(
          component_library_id, version, schema_version, definition, integrity_hash, status
        ) VALUES (
          '${catalog.componentLibrary.id}', '${catalog.componentLibrary.version}',
          ${catalog.componentLibrary.schemaVersion}, ${sqlJson(catalog.componentLibrary)},
          '${catalog.componentLibrary.integrity}', 'released'
        );
        ${catalog.blueprints.map((blueprint) => `
          INSERT INTO public.adaptive_template_blueprint_versions(
            blueprint_id, version, resource_type, schema_version, definition, integrity_hash, status
          ) VALUES (
            '${blueprint.id}', '${blueprint.version}', '${blueprint.resourceType}',
            ${blueprint.schemaVersion}, ${sqlJson(blueprint)}, '${blueprint.integrity}', 'released'
          );
        `).join("\n")}
        INSERT INTO public.adaptive_store_kit_versions(
          store_kit_id, version, schema_version, engine_version,
          design_pack_id, design_pack_version, component_library_id, component_library_version,
          lockfile, definition, integrity_hash, status
        ) VALUES (
          '${kit.id}', '${kit.version}', ${kit.schemaVersion}, '1.0.0',
          '${kit.lockfile.designPack.id}', '${kit.lockfile.designPack.version}',
          '${kit.lockfile.componentLibrary.id}', '${kit.lockfile.componentLibrary.version}',
          ${sqlJson(kit.lockfile)}, ${sqlJson(kit)}, '${kit.integrity}', 'draft'
        );
        ${catalog.blueprints.map((blueprint) => `
          INSERT INTO public.adaptive_store_kit_blueprint_pins(
            store_kit_id, store_kit_version, resource_type, blueprint_id, blueprint_version, integrity_hash
          ) VALUES (
            '${kit.id}', '${kit.version}', '${blueprint.resourceType}',
            '${blueprint.id}', '${blueprint.version}', '${blueprint.integrity}'
          );
        `).join("\n")}
        UPDATE public.adaptive_store_kit_versions SET status = 'released'
        WHERE store_kit_id = '${kit.id}' AND version = '${kit.version}';
      `);

      const stage = await db.query<{ value: Record<string, any> }>(`
        SELECT public.stage_adaptive_store_kit_installation(
          '${STORE_ID}', '${kit.id}', '${kit.version}', ${sqlJson(kit.lockfile)},
          ${sqlJson(catalog.storeDefinition.designTokens)}, ${sqlJson(catalog.storeDefinition.base)},
          '[]'::jsonb, ${sqlJson(catalog.storeDefinition.commerceBindings)},
          0, 'authoring-stage-one'
        ) AS value
      `);
      const installation = stage.rows[0].value.installation as Record<string, any>;
      const load = async () => (await db.query<{ value: Record<string, any> }>(`
        SELECT public.load_adaptive_storefront_authoring_source('${STORE_ID}') AS value
      `)).rows[0].value;

      await db.exec(`
        CREATE OR REPLACE FUNCTION private.has_store_capability(uuid, text, uuid DEFAULT auth.uid())
        RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER AS $$ SELECT $2 = 'theme.read' $$;
      `);
      const readOnlySource = await load();
      expect(readOnlySource.installationId).toBe(installation.id);
      expect(readOnlySource.catalog.blueprints).toHaveLength(8);
      await expect(db.query(`
        SELECT public.save_adaptive_storefront_authoring_patch(
          '${STORE_ID}', '${installation.id}', ${readOnlySource.sourceRevision}, 'authoring-save-one',
          ${sqlJson([{ op: "set", target: "home.hero.heading", value: "Autumn essentials" }])},
          ${sqlJson(readOnlySource.storeDefinition.designTokens)},
          ${sqlJson(readOnlySource.storeDefinition.commerceBindings)}
        )
      `)).rejects.toThrow(/Theme edit capability required/);

      await db.exec(`
        CREATE OR REPLACE FUNCTION private.has_store_capability(uuid, text, uuid DEFAULT auth.uid())
        RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER AS $$ SELECT $2 IN ('theme.read', 'theme.edit') $$;
      `);
      const saveSql = (key: string, revision: number, heading: string) => `
        SELECT public.save_adaptive_storefront_authoring_patch(
          '${STORE_ID}', '${installation.id}', ${revision}, '${key}',
          ${sqlJson([{ op: "set", target: "home.hero.heading", value: heading }])},
          ${sqlJson(readOnlySource.storeDefinition.designTokens)},
          ${sqlJson(readOnlySource.storeDefinition.commerceBindings)}
        ) AS value
      `;
      const saved = (await db.query<{ value: Record<string, any> }>(
        saveSql("authoring-save-one", readOnlySource.sourceRevision, "Autumn essentials"),
      )).rows[0].value;
      expect(saved.outcome).toBe("saved");
      expect(saved.sourceRevision).toBeGreaterThan(readOnlySource.sourceRevision);
      const replayed = (await db.query<{ value: Record<string, any> }>(
        saveSql("authoring-save-one", readOnlySource.sourceRevision, "Autumn essentials"),
      )).rows[0].value;
      expect(replayed).toMatchObject({ outcome: "replayed", sourceRevision: saved.sourceRevision });

      const afterSave = await load();
      await expect(db.query(saveSql(
        "authoring-save-one",
        readOnlySource.sourceRevision,
        "Different request",
      ))).rejects.toThrow(/idempotency key belongs to another request/i);
      await expect(db.query(saveSql(
        "authoring-save-stale",
        readOnlySource.sourceRevision,
        "Stale request",
      ))).rejects.toThrow(/source revision conflict/i);
      await expect(db.query(`
        SELECT public.save_adaptive_storefront_authoring_patch(
          '${STORE_ID}', '${installation.id}', ${afterSave.sourceRevision}, 'authoring-bad-variant',
          ${sqlJson([{ op: "set", target: "home.hero.settings.variant", value: "unknown-layout" }])},
          ${sqlJson(afterSave.storeDefinition.designTokens)},
          ${sqlJson(afterSave.storeDefinition.commerceBindings)}
        )
      `)).rejects.toThrow(/certified and merchant-editable/i);

      const terminal = await db.query<{ patches: number; revision: number }>(`
        SELECT count(*)::integer AS patches, max(source.revision)::integer AS revision
        FROM public.adaptive_merchant_patches patch
        JOIN public.adaptive_storefront_source_heads source
          ON source.installation_id = patch.installation_id
        WHERE patch.installation_id = '${installation.id}'
        GROUP BY source.revision
      `);
      expect(terminal.rows[0]).toEqual({ patches: 1, revision: saved.sourceRevision });
    } finally {
      await db.close();
    }
  }, 40_000);
});
