import { describe, expect, it, vi } from "vitest";
import { DomainService } from "./DomainService";

const storeId = "11111111-1111-4111-8111-111111111111";
const capability = { available: false, reason: "Not configured" };
const dashboard = {
  storeId,
  domains: [],
  purchaseOrders: [],
  transferRequests: [],
  google: { status: "disconnected" },
  siteVerifications: [],
  searchConsoleProperties: [],
  sitemapSubmissions: [],
  searchMetrics: [],
  urlInspectionResults: [],
  capabilities: {
    existingDomain: capability,
    domainSearch: capability,
    includedRegistration: capability,
    paidRegistration: capability,
    includedTransfer: capability,
    googleSearch: capability,
  },
  generatedAt: "2026-08-10T00:00:00.000Z",
};

describe("DomainService", () => {
  it("requests and validates the tenant dashboard", async () => {
    const invoke = vi.fn(async () => ({ data: { data: dashboard }, error: null }));
    const service = new DomainService({ functions: { invoke } } as any);

    await expect(service.getDashboard(storeId)).resolves.toEqual(dashboard);
    expect(invoke).toHaveBeenCalledWith("domain-orchestrator", {
      body: { action: "status", storeId },
    });
  });

  it("preserves a sanitized server error code and message", async () => {
    const context = new Response(JSON.stringify({
      error: {
        code: "DOMAIN_ALREADY_CLAIMED",
        message: "This domain is already connected to another store.",
      },
    }), { status: 409, headers: { "Content-Type": "application/json" } });
    const invoke = vi.fn(async () => ({
      data: null,
      error: Object.assign(new Error("Edge Function returned a non-2xx status code"), { context }),
    }));
    const service = new DomainService({ functions: { invoke } } as any);

    await expect(service.connectExisting(storeId, "shop.example.dev"))
      .rejects.toMatchObject({
        code: "DOMAIN_ALREADY_CLAIMED",
        message: "This domain is already connected to another store.",
      });
  });

  it("maps an Edge Function transport failure to a useful service error", async () => {
    const service = new DomainService({
      functions: {
        invoke: vi.fn(async () => ({
          data: null,
          error: new Error("Failed to send a request to the Edge Function"),
        })),
      },
    } as any);

    await expect(service.getDashboard(storeId)).rejects.toMatchObject({
      code: "DOMAIN_SERVICE_UNAVAILABLE",
      message: "The domain service is temporarily unavailable. Try again shortly.",
    });
  });

  it("rejects malformed provider responses", async () => {
    const service = new DomainService({
      functions: { invoke: vi.fn(async () => ({ data: { data: { domains: [] } }, error: null })) },
    } as any);

    await expect(service.getDashboard(storeId)).rejects.toMatchObject({
      code: "INVALID_DOMAIN_RESPONSE",
    });
  });

  it("submits only an opaque server quote when purchasing a domain", async () => {
    const invoke = vi.fn(async () => ({ data: { data: dashboard }, error: null }));
    const service = new DomainService({ functions: { invoke } } as any);
    const quoteId = "22222222-2222-4222-8222-222222222222";

    await expect(service.purchaseDomain(storeId, quoteId)).resolves.toEqual(dashboard);
    expect(invoke).toHaveBeenCalledWith("domain-orchestrator", {
      body: { action: "purchase-domain", storeId, quoteId, confirm: true },
    });
  });

  it("uses dedicated server actions for the Google OAuth lifecycle", async () => {
    const authorization = {
      authorizationUrl: "https://accounts.google.com/o/oauth2/v2/auth?state=opaque",
      expiresAt: "2026-08-12T12:10:00.000Z",
    };
    const invoke = vi.fn()
      .mockResolvedValueOnce({ data: { data: authorization }, error: null })
      .mockResolvedValue({ data: { data: dashboard }, error: null });
    const service = new DomainService({ functions: { invoke } } as any);

    await expect(service.beginGoogleConnection(storeId)).resolves.toEqual(authorization);
    await expect(service.completeGoogleConnection(storeId, "code", "state")).resolves.toEqual(dashboard);
    await expect(service.retryGoogleConnection(storeId)).resolves.toEqual(dashboard);
    await expect(service.disconnectGoogle(storeId)).resolves.toEqual(dashboard);

    expect(invoke.mock.calls.map((call) => call[1].body.action)).toEqual([
      "google-connect",
      "google-oauth-callback",
      "google-retry",
      "google-disconnect",
    ]);
  });
});
