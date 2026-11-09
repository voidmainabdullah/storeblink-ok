import type { SupabaseRpcClient } from "./SupabaseAdaptiveReleaseGateway";

export type ShadowReviewDecision = "accept" | "reject";

export type ShadowReviewResult = Readonly<{
  shadowId: string;
  status: "accepted" | "rejected";
  reviewRevision: number;
  jobId: string;
  publishEligible: boolean;
}>;

export type ReviewedPublicationResult = Readonly<{
  publicationId: string;
  pointerRevision: number;
  artifactHash: string;
  idempotent: boolean;
}>;

export type ShadowVisualEvidence = Readonly<{
  kind: "adaptive-shadow-visual-evidence";
  outcome: "comparable";
  artifactHash: string;
  evidenceHash: string;
  report: Readonly<Record<string, unknown>>;
}>;

export interface AdaptiveShadowReviewGateway {
  review(input: Readonly<{
    storeId: string;
    shadowId: string;
    expectedReviewRevision: number;
    idempotencyKey: string;
    decision: ShadowReviewDecision;
  }>): Promise<ShadowReviewResult>;
}

export interface TrustedReviewedPublicationGateway {
  publishPersistedCandidate(input: Readonly<{
    storeId: string;
    jobId: string;
    expectedPointerRevision: number;
  }>): Promise<ReviewedPublicationResult>;
  attachVisualEvidence(input: Readonly<{
    shadowId: string;
    expectedReviewRevision: number;
    evidence: ShadowVisualEvidence;
  }>): Promise<Readonly<{
    shadowId: string;
    status: "pending";
    reviewRevision: number;
  }>>;
}

const object = (value: unknown, label: string): Record<string, unknown> => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} returned an invalid response.`);
  }
  return value as Record<string, unknown>;
};

const string = (value: unknown, label: string): string => {
  if (typeof value !== "string" || !value) throw new Error(`${label} is missing.`);
  return value;
};

const integer = (value: unknown, label: string): number => {
  if (!Number.isSafeInteger(value)) throw new Error(`${label} is invalid.`);
  return value as number;
};

const rpc = async (
  client: SupabaseRpcClient,
  name: string,
  args: Readonly<Record<string, unknown>>,
): Promise<unknown> => {
  const response = await client.rpc(name, args);
  if (response.error) {
    const error = new Error(`${name} failed: ${response.error.message}`);
    error.name = response.error.code ? `SupabaseRpcError:${response.error.code}` : "SupabaseRpcError";
    throw error;
  }
  return response.data;
};

const validRevision = (value: number, label: string): void => {
  if (!Number.isSafeInteger(value) || value < 0) throw new Error(`${label} is invalid.`);
};

export class SupabaseAdaptiveShadowReviewGateway implements AdaptiveShadowReviewGateway {
  constructor(private readonly client: SupabaseRpcClient) {}

  async review(input: Parameters<AdaptiveShadowReviewGateway["review"]>[0]): Promise<ShadowReviewResult> {
    validRevision(input.expectedReviewRevision, "Expected shadow review revision");
    if (input.idempotencyKey.trim().length < 8 || input.idempotencyKey.length > 160) {
      throw new Error("Shadow review idempotency key is invalid.");
    }
    const data = object(await rpc(this.client, "review_adaptive_shadow_compilation", {
      p_store_id: input.storeId,
      p_shadow_id: input.shadowId,
      p_expected_review_revision: input.expectedReviewRevision,
      p_idempotency_key: input.idempotencyKey.trim(),
      p_decision: input.decision,
    }), "Adaptive shadow review");
    const status = string(data.status, "Shadow review status");
    if (status !== "accepted" && status !== "rejected") {
      throw new Error("Shadow review returned an unsupported status.");
    }
    return Object.freeze({
      shadowId: string(data.shadowId, "Shadow id"),
      status,
      reviewRevision: integer(data.reviewRevision, "Shadow review revision"),
      jobId: string(data.jobId, "Compile job id"),
      publishEligible: data.publishEligible === true,
    });
  }
}

export class SupabaseTrustedReviewedPublicationGateway implements TrustedReviewedPublicationGateway {
  constructor(private readonly client: SupabaseRpcClient) {}

  async publishPersistedCandidate(
    input: Parameters<TrustedReviewedPublicationGateway["publishPersistedCandidate"]>[0],
  ): Promise<ReviewedPublicationResult> {
    validRevision(input.expectedPointerRevision, "Expected publication pointer revision");
    const data = object(await rpc(
      this.client,
      "publish_reviewed_adaptive_storefront_compile_job",
      {
        p_store_id: input.storeId,
        p_job_id: input.jobId,
        p_expected_pointer_revision: input.expectedPointerRevision,
      },
    ), "Reviewed adaptive publication");
    const artifactHash = string(data.artifact_hash, "Reviewed artifact hash");
    if (!/^sha256:[a-f0-9]{64}$/.test(artifactHash)) {
      throw new Error("Reviewed artifact hash is invalid.");
    }
    return Object.freeze({
      publicationId: string(data.publication_id, "Reviewed publication id"),
      pointerRevision: integer(data.pointer_revision, "Reviewed pointer revision"),
      artifactHash,
      idempotent: data.idempotent === true,
    });
  }

  async attachVisualEvidence(
    input: Parameters<TrustedReviewedPublicationGateway["attachVisualEvidence"]>[0],
  ): Promise<Readonly<{ shadowId: string; status: "pending"; reviewRevision: number }>> {
    validRevision(input.expectedReviewRevision, "Expected shadow review revision");
    if (
      input.evidence.kind !== "adaptive-shadow-visual-evidence" ||
      input.evidence.outcome !== "comparable" ||
      !/^sha256:[a-f0-9]{64}$/.test(input.evidence.artifactHash) ||
      !/^sha256:[a-f0-9]{64}$/.test(input.evidence.evidenceHash)
    ) throw new Error("Trusted visual evidence is invalid.");
    const data = object(await rpc(this.client, "record_adaptive_shadow_visual_evidence", {
      p_shadow_id: input.shadowId,
      p_expected_review_revision: input.expectedReviewRevision,
      p_evidence: input.evidence,
    }), "Adaptive visual evidence");
    if (data.status !== "pending") throw new Error("Visual evidence did not produce a pending review.");
    return Object.freeze({
      shadowId: string(data.shadowId, "Shadow id"),
      status: "pending",
      reviewRevision: integer(data.reviewRevision, "Shadow review revision"),
    });
  }
}

/**
 * Trusted-worker use only. It deliberately accepts a job identity and pointer
 * revision, never artifact bytes or a browser-computed hash.
 */
export class ReviewedShadowPublicationService {
  constructor(private readonly gateway: TrustedReviewedPublicationGateway) {}

  publish(input: Readonly<{
    storeId: string;
    jobId: string;
    expectedPointerRevision: number;
  }>): Promise<ReviewedPublicationResult> {
    if (!input.storeId || !input.jobId) throw new Error("Reviewed publication identity is required.");
    validRevision(input.expectedPointerRevision, "Expected publication pointer revision");
    return this.gateway.publishPersistedCandidate(input);
  }
}
