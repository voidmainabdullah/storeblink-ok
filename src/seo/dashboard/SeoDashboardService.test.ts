import { describe, expect, it, vi } from "vitest";
import { SeoDashboardService } from "./SeoDashboardService";
import { seoMetadataInputSchema } from "./seo-dashboard.types";

const storeId = "11111111-1111-4111-8111-111111111111";
const dashboard = {
  resources: [],
  state: {},
  generations: [],
  segments: [],
  redirects: [],
  indexNow: {},
  healthIssues: [],
};

const validMetadata = {
  seoTitle: "Product title",
  metaDescription: "Product description",
  indexing: "index_follow" as const,
  canonicalMode: "automatic" as const,
  customCanonicalUrl: "",
  socialTitle: "Social title",
  socialDescription: "Social description",
  socialImageId: "https://cdn.example.com/product.jpg",
  customMetaTags: [],
  alternates: [{ locale: "en-GB", url: "https://shop.example.com/products/watch" }],
};

describe("SeoDashboardService", () => {
  it("uses the authenticated orchestrator action and validates its dashboard", async () => {
    const invoke = vi.fn(async () => ({ data: { data: dashboard }, error: null }));
    const service = new SeoDashboardService({ functions: { invoke } } as any);

    await expect(service.getDashboard(storeId)).resolves.toMatchObject({ resources: [] });
    expect(invoke).toHaveBeenCalledWith("domain-orchestrator", {
      body: { action: "seo-dashboard", storeId },
    });
  });

  it("validates metadata before invoking the server sanitizer", async () => {
    const invoke = vi.fn(async () => ({ data: { data: dashboard }, error: null }));
    const service = new SeoDashboardService({ functions: { invoke } } as any);

    await service.updateMetadata(storeId, "product", "watch", validMetadata);

    expect(invoke).toHaveBeenCalledWith("domain-orchestrator", {
      body: {
        action: "seo-metadata-update",
        storeId,
        resourceType: "product",
        resourceId: "watch",
        metadata: validMetadata,
      },
    });
  });

  it("rejects unsafe social and alternate URLs", () => {
    expect(seoMetadataInputSchema.safeParse({
      ...validMetadata,
      socialImageId: "javascript:alert(1)",
    }).success).toBe(false);
    expect(seoMetadataInputSchema.safeParse({
      ...validMetadata,
      alternates: [{ locale: "en", url: "http://shop.example.com/" }],
    }).success).toBe(false);
  });

  it("maps an unsupported deployed action to a version mismatch", async () => {
    const context = new Response(JSON.stringify({
      error: { code: "UNKNOWN_ACTION", message: "Unknown domain operation." },
    }), { status: 404, headers: { "Content-Type": "application/json" } });
    const service = new SeoDashboardService({
      functions: {
        invoke: vi.fn(async () => ({
          data: null,
          error: Object.assign(new Error("Edge Function returned a non-2xx status code"), {
            context,
          }),
        })),
      },
    } as any);

    await expect(service.getDashboard(storeId)).rejects.toMatchObject({
      code: "DOMAIN_SERVICE_VERSION_MISMATCH",
      message: "StoreBlink services are being updated. Refresh the page and try again shortly.",
    });
  });
});
