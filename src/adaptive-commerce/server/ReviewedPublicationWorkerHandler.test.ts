import { describe, expect, it, vi } from "vitest";
import { createReviewedPublicationWorkerHandler } from "./ReviewedPublicationWorkerHandler";
import type { ReviewedShadowPublicationService } from "./ShadowReviewLifecycle";

const secret = "trusted-reviewed-publication-secret-123456";
const storeId = "11111111-1111-4111-8111-111111111111";
const jobId = "22222222-2222-4222-8222-222222222222";

describe("reviewed publication Worker boundary", () => {
  it("forwards only persisted identity after secret authentication", async () => {
    const publish = vi.fn(async () => ({
      publicationId: "publication-one",
      pointerRevision: 2,
      artifactHash: `sha256:${"a".repeat(64)}`,
      idempotent: false,
    }));
    const handler = createReviewedPublicationWorkerHandler({
      secret,
      service: { publish } as unknown as ReviewedShadowPublicationService,
    });
    const result = await handler(new Request("https://worker.invalid/reviewed-publication", {
      method: "POST",
      headers: { authorization: `Bearer ${secret}`, "content-type": "application/json" },
      body: JSON.stringify({ storeId, jobId, expectedPointerRevision: 1 }),
    }));

    expect(result.status).toBe(200);
    expect(publish).toHaveBeenCalledWith({ storeId, jobId, expectedPointerRevision: 1 });
  });

  it("rejects browser artifact fields before the service boundary", async () => {
    const publish = vi.fn();
    const handler = createReviewedPublicationWorkerHandler({
      secret,
      service: { publish } as unknown as ReviewedShadowPublicationService,
    });
    const result = await handler(new Request("https://worker.invalid/reviewed-publication", {
      method: "POST",
      headers: { authorization: `Bearer ${secret}` },
      body: JSON.stringify({
        storeId, jobId, expectedPointerRevision: 1, artifactHash: `sha256:${"a".repeat(64)}`,
      }),
    }));

    expect(result.status).toBe(400);
    expect(publish).not.toHaveBeenCalled();
  });
});
