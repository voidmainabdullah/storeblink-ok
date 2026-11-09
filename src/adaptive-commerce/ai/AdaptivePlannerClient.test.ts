import { planAdaptiveStorefront } from "./AdaptivePlannerClient";
import { semanticPath } from "@/adaptive-commerce/contracts";

const HASH = `sha256:${"a".repeat(64)}`;
const proposal = {
  status: "proposed",
  reviewRequired: true,
  plan: {
    kind: "adaptive-commerce-plan",
    schemaVersion: 1,
    storeKit: { id: "atelier", version: "1.0.0", integrity: HASH },
    presetId: "warm-editorial",
    variantSelections: [{ path: semanticPath("home.hero"), componentId: "hero", variantId: "editorial" }],
    contentMappings: [],
  },
  audit: { intentHash: HASH, attempts: 2 },
};

describe("AdaptivePlannerClient", () => {
  it("sends an authenticated brief and accepts only a review-required proposal", async () => {
    const request = vi.fn(async () => new Response(JSON.stringify(proposal), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    }));
    const result = await planAdaptiveStorefront({ storeId: "store-1", intent: "  Calm   editorial shop  " }, {
      getAccessToken: async () => "session-token",
      fetch: request as typeof fetch,
      endpoint: "https://project.example/functions/v1/plan",
    });
    expect(result.plan.storeKit.id).toBe("atelier");
    expect(request).toHaveBeenCalledWith(
      "https://project.example/functions/v1/plan",
      expect.objectContaining({
        credentials: "omit",
        body: JSON.stringify({ storeId: "store-1", intent: "Calm editorial shop" }),
      }),
    );
  });

  it("rejects invalid or non-reviewable provider output", async () => {
    await expect(planAdaptiveStorefront({ storeId: "store-1", intent: "Build a shop" }, {
      getAccessToken: async () => "session-token",
      fetch: async () => new Response(JSON.stringify({ status: "installed", plan: proposal.plan })) as never,
    })).rejects.toThrow("invalid proposal");
  });
});
