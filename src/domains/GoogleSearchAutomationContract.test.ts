import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");
const provider = read("supabase/functions/_shared/domain/google.ts");
const workflow = read("supabase/functions/domain-orchestrator/google-workflow.ts");
const orchestrator = read("supabase/functions/domain-orchestrator/index.ts");
const migration = read("supabase/migrations/20260812000100_google_search_automation.sql");
const storefrontSeo = read("supabase/functions/storefront-seo/index.ts");
const workerConfig = read("wrangler.jsonc");

describe("Google Search automation architecture", () => {
  it("keeps OAuth credentials server-only and encrypts durable secrets", () => {
    expect(provider).toContain('requireEnvironment("GOOGLE_OAUTH_CLIENT_SECRET")');
    expect(provider).toContain('importEncryptionKey("GOOGLE_TOKEN_ENCRYPTION_KEY")');
    expect(provider).toContain("GOOGLE_TOKEN_ENCRYPTION_PREVIOUS_KEY");
    expect(provider).toContain("requiresReencryption");
    expect(provider).toContain('name: "AES-GCM"');
    expect(provider).toContain("code_challenge_method");
    expect(provider).toContain("sha256Base64Url");
    expect(provider).not.toContain("VITE_GOOGLE");
  });

  it("wires every declared Google job through the durable orchestrator", () => {
    for (const jobType of [
      "google-site-verify",
      "google-property-create",
      "sitemap-submit",
      "search-console-sync",
      "url-inspection-sync",
    ]) {
      expect(workflow).toContain(`"${jobType}"`);
    }
    expect(orchestrator).toContain("googleWorkflow.processJob(client, job)");
    expect(orchestrator).toContain('case "google-oauth-callback"');
  });

  it("adds bounded daily monitoring and a tenant-protected inspection projection", () => {
    expect(migration).toContain("CREATE TABLE IF NOT EXISTS public.url_inspection_results");
    expect(migration).toContain("storeblink-google-search-monitoring");
    expect(migration).toContain("private.has_store_capability(store_id, 'domains.manage', auth.uid())");
    expect(migration).toContain("REVOKE ALL ON public.url_inspection_results FROM PUBLIC, anon, authenticated");
  });

  it("injects verification metadata at the trusted Worker response boundary", () => {
    expect(storefrontSeo).toContain("decryptGoogleSecret");
    expect(storefrontSeo).toContain("googleSiteVerification");
    expect(workerConfig).toContain('"main": "worker/index.ts"');
    expect(workerConfig).toContain('"run_worker_first": true');
    expect(workerConfig).toContain('"binding": "ASSETS"');
  });
});
