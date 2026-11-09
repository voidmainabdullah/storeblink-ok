import { describe, expect, it, vi } from "vitest";
import type { AdaptiveShadowReviewGateway } from "../server/ShadowReviewLifecycle";
import type { AdaptiveReleaseReviewGateway } from "./gateway";
import { AdaptiveReleaseReviewService, type AdaptiveReleaseReviewFunctionsClient } from "./service";
import type { AdaptiveReleaseReviewSnapshot } from "./types";

const storeId = "11111111-1111-4111-8111-111111111111";
const installationId = "22222222-2222-4222-8222-222222222222";
const jobId = "33333333-3333-4333-8333-333333333333";
const shadowId = "44444444-4444-4444-8444-444444444444";

const snapshot = (
  status?: "pending" | "accepted" | "rejected" | "uncomparable",
): AdaptiveReleaseReviewSnapshot => ({
  kind: "adaptive-release-review-snapshot",
  storeId,
  installationId,
  sourceRevision: 4,
  currentPointerRevision: 2,
  currentPublication: null,
  latestJob: status ? {
    jobId,
    state: "succeeded",
    requestedAt: "2026-08-27T00:00:00.000Z",
    completedAt: "2026-08-27T00:00:01.000Z",
    error: null,
    published: false,
    isCurrent: false,
    shadow: {
      shadowId,
      status,
      reviewRevision: 7,
      structuralDiff: { status: "different", changes: [] },
      visualDiff: null,
      reviewedAt: null,
    },
  } : null,
});

const setup = (next: AdaptiveReleaseReviewSnapshot) => {
  const load = vi.fn<AdaptiveReleaseReviewGateway["load"]>(async () => next);
  const review = vi.fn<AdaptiveShadowReviewGateway["review"]>(async () => ({
    shadowId,
    status: "accepted" as const,
    reviewRevision: 8,
    jobId,
    publishEligible: true,
  }));
  const invoke = vi.fn<AdaptiveReleaseReviewFunctionsClient["invoke"]>(
    async () => ({ data: {}, error: null }),
  );
  const service = new AdaptiveReleaseReviewService(
    { load } as AdaptiveReleaseReviewGateway,
    { review } as AdaptiveShadowReviewGateway,
    { invoke } as AdaptiveReleaseReviewFunctionsClient,
  );
  return { service, load, review, invoke };
};

describe("AdaptiveReleaseReviewService", () => {
  it("requests a shadow-only compile from canonical identities", async () => {
    const initial = snapshot();
    const { service, invoke, load } = setup(snapshot("pending"));
    await service.requestValidation(initial);

    expect(invoke).toHaveBeenCalledTimes(1);
    const [functionName, options] = invoke.mock.calls[0]!;
    expect(functionName).toBe("compile-adaptive-storefront");
    expect(options.body).toMatchObject({
      storeId,
      installationId,
      expectedSourceRevision: 4,
      expectedPointerRevision: 2,
      intent: "shadow-only",
    });
    expect(Object.keys(options.body).sort()).toEqual([
      "expectedPointerRevision",
      "expectedSourceRevision",
      "idempotencyKey",
      "installationId",
      "intent",
      "storeId",
    ]);
    expect(load).toHaveBeenCalledWith({ storeId, installationId, sourceRevision: 4 });
  });

  it("accepts only the exact pending shadow revision", async () => {
    const initial = snapshot("pending");
    const { service, review } = setup(snapshot("accepted"));
    await service.review(initial, "accept");

    expect(review).toHaveBeenCalledWith({
      storeId,
      shadowId,
      expectedReviewRevision: 7,
      idempotencyKey: expect.stringMatching(/^adaptive-review-accept-/),
      decision: "accept",
    });
    await expect(service.review(snapshot("uncomparable"), "accept"))
      .rejects.toThrow(/exact pending/i);
  });

  it("publishes by job identity and pointer revision without browser artifact fields", async () => {
    const initial = snapshot("accepted");
    const { service, invoke } = setup({
      ...initial,
      latestJob: { ...initial.latestJob!, isCurrent: true, published: true },
    });
    await service.publish(initial);

    expect(invoke).toHaveBeenCalledWith("publish-reviewed-adaptive-storefront", {
      body: { storeId, jobId, expectedPointerRevision: 2 },
    });
    const payload = invoke.mock.calls[0]![1].body;
    expect(Object.keys(payload).sort()).toEqual([
      "expectedPointerRevision", "jobId", "storeId",
    ]);
    expect(JSON.stringify(payload)).not.toMatch(/artifact|hash|compiler/i);
  });
});
