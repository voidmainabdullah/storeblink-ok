import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(process.cwd(), "supabase/migrations/20260809000100_domain_seo_platform.sql"),
  "utf8",
);

describe("domain platform migration contract", () => {
  it("enforces global hostname ownership and one primary domain per store", () => {
    expect(migration).toMatch(
      /CREATE UNIQUE INDEX store_domains_hostname_uidx ON public\.store_domains\(hostname\)/,
    );
    expect(migration).toMatch(
      /CREATE UNIQUE INDEX store_domains_primary_per_store_uidx[\s\S]+WHERE is_primary/,
    );
  });

  it("keeps provider, token, worker, and staff tables off the merchant grant surface", () => {
    expect(migration).toContain(
      "REVOKE ALL ON public.%I FROM PUBLIC, anon, authenticated",
    );
    for (const table of [
      "cloudflare_custom_hostnames",
      "domain_registration_quotes",
      "google_integrations",
      "google_oauth_states",
      "domain_events",
      "seo_sync_jobs",
      "platform_staff",
      "platform_credentials",
      "admin_audit_log",
    ]) {
      expect(migration).not.toMatch(
        new RegExp(`GRANT\\s+(?:ALL|SELECT)[^;]*public\\.${table}\\s+TO\\s+authenticated`, "i"),
      );
    }
  });

  it("limits privileged mutations and job claims to the service role", () => {
    for (const signature of [
      "create_existing_domain_claim(uuid, uuid, text, text)",
      "create_paid_domain_purchase_order(uuid, uuid, uuid)",
      "set_primary_store_domain(uuid, uuid)",
      "claim_seo_sync_jobs(text, integer)",
      "finish_seo_sync_job(uuid, text, boolean, text, text)",
    ]) {
      expect(migration).toContain(
        `GRANT EXECUTE ON FUNCTION public.${signature} TO service_role`,
      );
    }
    expect(migration).toContain("FOR UPDATE SKIP LOCKED");
    expect(migration).toContain("max_attempts BETWEEN 1 AND 240");
  });

  it("does not persist registrar authorization codes", () => {
    const transferTable = migration.match(
      /CREATE TABLE public\.domain_transfer_requests \([\s\S]*?\n\);/,
    )?.[0];
    expect(transferTable).toBeTruthy();
    expect(transferTable).not.toMatch(/auth(?:orization)?_?code|epp/i);
  });

  it("consumes server-side registration quotes atomically", () => {
    expect(migration).toContain("CREATE TABLE public.domain_registration_quotes");
    expect(migration).toMatch(
      /CREATE OR REPLACE FUNCTION public\.create_paid_domain_purchase_order[\s\S]+FOR UPDATE/,
    );
    expect(migration).toContain("selected_quote.expires_at <= now()");
    expect(migration).toContain("SET status = 'used', used_at = now()");
  });
});
