import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const readWorkspaceFile = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");
const httpSource = readWorkspaceFile("supabase/functions/_shared/domain/http.ts");
const orchestratorSource = readWorkspaceFile("supabase/functions/domain-orchestrator/index.ts");
const supabaseConfig = readWorkspaceFile("supabase/config.toml");

describe("domain Edge runtime contract", () => {
  it("allows only the canonical production origin by default", () => {
    expect(httpSource).toContain('"https://storeblink.com"');
    expect(httpSource).not.toContain('"http://localhost:8082"');
    expect(httpSource).not.toContain('"http://127.0.0.1:8082"');
    expect(httpSource).toContain('"Access-Control-Allow-Origin"');
    expect(httpSource).toContain('"Access-Control-Allow-Methods": "GET, POST, OPTIONS"');
  });

  it("answers preflight before method, authentication, or body handling", () => {
    const preflight = orchestratorSource.indexOf('request.method === "OPTIONS"');
    const postOnly = orchestratorSource.indexOf('request.method !== "POST"');
    const bodyRead = orchestratorSource.indexOf("readJsonObject(request)");

    expect(preflight).toBeGreaterThan(-1);
    expect(orchestratorSource.slice(preflight, postOnly)).toContain("status: 204");
    expect(preflight).toBeLessThan(postOnly);
    expect(postOnly).toBeLessThan(bodyRead);
  });

  it("targets the same project as the active Supabase link", () => {
    expect(supabaseConfig).toContain('project_id = "shflnrznleodviqphvfg"');
  });

  it("keeps registrar transactions disabled until downstream DNS and SSL provisioning is configured", () => {
    expect(orchestratorSource).toContain(
      "available: includedClaimEnabled && provisioningConfigured",
    );
    expect(orchestratorSource).toContain(
      "available: paidRegistrationEnabled && provisioningConfigured",
    );
    expect(orchestratorSource).toContain(
      "available: includedTransferEnabled && provisioningConfigured",
    );

    const purchaseAction = orchestratorSource.indexOf("const purchasePaidDomain");
    const purchaseWorker = orchestratorSource.indexOf("const processHostingerPurchase");
    expect(
      orchestratorSource.slice(purchaseAction, purchaseWorker),
    ).toContain("requireProvisioningReadiness()");
    expect(
      orchestratorSource.slice(purchaseWorker),
    ).toContain("requireProvisioningReadiness()");
  });

  it("preserves transferred-domain nameservers and waits for authoritative DNS", () => {
    const transferPoll = orchestratorSource.indexOf("const processTransferPoll");
    const nextHandler = orchestratorSource.indexOf("const processSitemapRefresh", transferPoll);
    const transferSource = orchestratorSource.slice(transferPoll, nextHandler);

    expect(transferSource).not.toContain("configureStorefrontDns");
    expect(transferSource).toContain('dns_status: "pending"');
    expect(transferSource).toContain('status: "verification_pending"');
  });
});
