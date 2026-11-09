import { describe, expect, it, vi } from "vitest";
import { semanticPath } from "@/adaptive-commerce/contracts";
import type { AdaptiveAuthoringSaveRequest } from "./types";
import { SupabaseAdaptiveAuthoringGateway } from "./gateway";

describe("SupabaseAdaptiveAuthoringGateway", () => {
  it("loads through the merchant RPC and treats an absent source as legacy", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: null, error: null });
    const gateway = new SupabaseAdaptiveAuthoringGateway({ rpc });
    await expect(gateway.load("store-one")).resolves.toBeNull();
    expect(rpc).toHaveBeenCalledWith("load_adaptive_storefront_authoring_source", {
      p_store_id: "store-one",
    });
  });

  it("sends declarative source only and never calls compiler or publication RPCs", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: {
        kind: "adaptive-storefront-authoring-save-result",
        outcome: "saved",
        storeId: "store-one",
        installationId: "installation-one",
        sourceRevision: 4,
        sourceHash: `sha256:${"a".repeat(64)}`,
        patchId: "patch-one",
        reviewState: "review-needed",
        compileJobEnqueued: false,
      },
      error: null,
    });
    const gateway = new SupabaseAdaptiveAuthoringGateway({ rpc });
    const request: AdaptiveAuthoringSaveRequest = {
      storeId: "store-one",
      installationId: "installation-one",
      expectedSourceRevision: 3,
      idempotencyKey: "authoring-save-one",
      operations: [{ op: "set", target: semanticPath("home.hero.heading"), value: "New heading" }],
      designTokens: { presetId: null, overrides: [] },
      commerceBindings: [],
    };
    await expect(gateway.save(request)).resolves.toMatchObject({
      reviewState: "review-needed",
      compileJobEnqueued: false,
    });
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc.mock.calls[0][0]).toBe("save_adaptive_storefront_authoring_patch");
    expect(JSON.stringify(rpc.mock.calls[0])).not.toMatch(/artifact|publish|service.?key/i);
  });
});
