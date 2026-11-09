import {
  adaptiveReleaseReviewSnapshotSchema,
  type AdaptiveReleaseReviewIdentity,
  type AdaptiveReleaseReviewSnapshot,
} from "./types";

export type AdaptiveReleaseReviewGatewayErrorData = Readonly<{
  message: string;
  code?: string;
}>;

export interface AdaptiveReleaseReviewRpcClient {
  rpc(
    functionName: string,
    args?: Readonly<Record<string, unknown>>,
  ): PromiseLike<Readonly<{
    data: unknown;
    error: AdaptiveReleaseReviewGatewayErrorData | null;
  }>>;
}

export interface AdaptiveReleaseReviewGateway {
  load(identity: AdaptiveReleaseReviewIdentity): Promise<AdaptiveReleaseReviewSnapshot>;
}

export class AdaptiveReleaseReviewGatewayError extends Error {
  readonly code: string | null;

  constructor(action: string, error: AdaptiveReleaseReviewGatewayErrorData) {
    super(`${action} failed: ${error.message}`);
    this.name = "AdaptiveReleaseReviewGatewayError";
    this.code = error.code ?? null;
  }
}

export class SupabaseAdaptiveReleaseReviewGateway implements AdaptiveReleaseReviewGateway {
  constructor(private readonly client: AdaptiveReleaseReviewRpcClient) {}

  async load(identity: AdaptiveReleaseReviewIdentity): Promise<AdaptiveReleaseReviewSnapshot> {
    if (!identity.storeId || !identity.installationId || !Number.isSafeInteger(identity.sourceRevision) || identity.sourceRevision < 1) {
      throw new Error("Adaptive release review identity is invalid.");
    }
    const response = await this.client.rpc("load_adaptive_storefront_release_review", {
      p_store_id: identity.storeId,
      p_installation_id: identity.installationId,
      p_expected_source_revision: identity.sourceRevision,
    });
    if (response.error) {
      throw new AdaptiveReleaseReviewGatewayError("Adaptive release review load", response.error);
    }
    const snapshot = adaptiveReleaseReviewSnapshotSchema.parse(response.data);
    if (
      snapshot.storeId !== identity.storeId ||
      snapshot.installationId !== identity.installationId ||
      snapshot.sourceRevision !== identity.sourceRevision
    ) {
      throw new Error("Adaptive release review returned a different source identity.");
    }
    return snapshot;
  }
}

