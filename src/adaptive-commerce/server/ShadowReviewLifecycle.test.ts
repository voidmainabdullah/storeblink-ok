import { describe, expect, it, vi } from "vitest";
import {
  ReviewedShadowPublicationService,
  SupabaseAdaptiveShadowReviewGateway,
  SupabaseTrustedReviewedPublicationGateway,
} from "./ShadowReviewLifecycle";
import type { SupabaseRpcClient } from "./SupabaseAdaptiveReleaseGateway";

const hash = `sha256:${"a".repeat(64)}`;

describe("adaptive shadow review lifecycle", () => {
  it("reviews only an exact shadow revision and never sends artifact identity", async () => {
    const rpc = vi.fn(async () => ({
      data: {
        shadowId: "shadow-one",
        status: "accepted",
        reviewRevision: 1,
        jobId: "job-one",
        publishEligible: true,
      },
      error: null,
    }));
    const gateway = new SupabaseAdaptiveShadowReviewGateway({ rpc } satisfies SupabaseRpcClient);

    await expect(gateway.review({
      storeId: "store-one",
      shadowId: "shadow-one",
      expectedReviewRevision: 0,
      idempotencyKey: "review-command-one",
      decision: "accept",
    })).resolves.toEqual({
      shadowId: "shadow-one",
      status: "accepted",
      reviewRevision: 1,
      jobId: "job-one",
      publishEligible: true,
    });
    expect(rpc).toHaveBeenCalledWith("review_adaptive_shadow_compilation", {
      p_store_id: "store-one",
      p_shadow_id: "shadow-one",
      p_expected_review_revision: 0,
      p_idempotency_key: "review-command-one",
      p_decision: "accept",
    });
    expect(JSON.stringify(rpc.mock.calls[0])).not.toMatch(/artifact|compiler/i);
  });

  it("trusted publication submits only persisted job identity and pointer revision", async () => {
    const rpc = vi.fn(async () => ({
      data: {
        publication_id: "publication-one",
        pointer_revision: 4,
        artifact_hash: hash,
        idempotent: false,
      },
      error: null,
    }));
    const gateway = new SupabaseTrustedReviewedPublicationGateway({ rpc } satisfies SupabaseRpcClient);
    const service = new ReviewedShadowPublicationService(gateway);

    await expect(service.publish({
      storeId: "store-one",
      jobId: "job-one",
      expectedPointerRevision: 3,
    })).resolves.toMatchObject({ publicationId: "publication-one", pointerRevision: 4 });
    expect(rpc).toHaveBeenCalledWith(
      "publish_reviewed_adaptive_storefront_compile_job",
      {
        p_store_id: "store-one",
        p_job_id: "job-one",
        p_expected_pointer_revision: 3,
      },
    );
  });

  it("promotes uncomparable evidence to pending only through trusted visual evidence", async () => {
    const rpc = vi.fn(async () => ({
      data: { shadowId: "shadow-one", status: "pending", reviewRevision: 1 },
      error: null,
    }));
    const gateway = new SupabaseTrustedReviewedPublicationGateway({ rpc } satisfies SupabaseRpcClient);
    await expect(gateway.attachVisualEvidence({
      shadowId: "shadow-one",
      expectedReviewRevision: 0,
      evidence: {
        kind: "adaptive-shadow-visual-evidence",
        outcome: "comparable",
        artifactHash: hash,
        evidenceHash: `sha256:${"b".repeat(64)}`,
        report: { changedPixels: 42 },
      },
    })).resolves.toEqual({ shadowId: "shadow-one", status: "pending", reviewRevision: 1 });
    expect(rpc).toHaveBeenCalledWith("record_adaptive_shadow_visual_evidence", expect.objectContaining({
      p_shadow_id: "shadow-one",
      p_expected_review_revision: 0,
    }));
  });
});
