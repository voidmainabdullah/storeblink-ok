import { getSupabaseBrowserClient } from "@/platform/supabase/client";
import {
  SupabaseAdaptiveShadowReviewGateway,
  type AdaptiveShadowReviewGateway,
} from "../server";
import {
  SupabaseAdaptiveReleaseReviewGateway,
  type AdaptiveReleaseReviewGateway,
  type AdaptiveReleaseReviewRpcClient,
} from "./gateway";
import type {
  AdaptiveReleaseReviewDecision,
  AdaptiveReleaseReviewIdentity,
  AdaptiveReleaseReviewSnapshot,
} from "./types";

export type AdaptiveReleaseReviewFunctionError = Readonly<{
  message: string;
  name?: string;
}>;

export interface AdaptiveReleaseReviewFunctionsClient {
  invoke(
    functionName: string,
    options: Readonly<{ body: Readonly<Record<string, unknown>> }>,
  ): PromiseLike<Readonly<{
    data: unknown;
    error: AdaptiveReleaseReviewFunctionError | null;
  }>>;
}

const operationKey = (prefix: string): string =>
  `${prefix}-${globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`}`;

const identityFor = (snapshot: AdaptiveReleaseReviewSnapshot): AdaptiveReleaseReviewIdentity => ({
  storeId: snapshot.storeId,
  installationId: snapshot.installationId,
  sourceRevision: snapshot.sourceRevision,
});

const invoke = async (
  client: AdaptiveReleaseReviewFunctionsClient,
  functionName: string,
  body: Readonly<Record<string, unknown>>,
): Promise<void> => {
  const result = await client.invoke(functionName, { body });
  if (result.error) {
    const error = new Error(`${functionName} failed: ${result.error.message}`);
    error.name = result.error.name ?? "AdaptiveReleaseReviewFunctionError";
    throw error;
  }
};

export interface AdaptiveReleaseReviewController {
  load(identity: AdaptiveReleaseReviewIdentity): Promise<AdaptiveReleaseReviewSnapshot>;
  requestValidation(snapshot: AdaptiveReleaseReviewSnapshot): Promise<AdaptiveReleaseReviewSnapshot>;
  review(
    snapshot: AdaptiveReleaseReviewSnapshot,
    decision: AdaptiveReleaseReviewDecision,
  ): Promise<AdaptiveReleaseReviewSnapshot>;
  publish(snapshot: AdaptiveReleaseReviewSnapshot): Promise<AdaptiveReleaseReviewSnapshot>;
}

export class AdaptiveReleaseReviewService implements AdaptiveReleaseReviewController {
  constructor(
    private readonly gateway: AdaptiveReleaseReviewGateway,
    private readonly shadowReview: AdaptiveShadowReviewGateway,
    private readonly functions: AdaptiveReleaseReviewFunctionsClient,
  ) {}

  load(identity: AdaptiveReleaseReviewIdentity): Promise<AdaptiveReleaseReviewSnapshot> {
    return this.gateway.load(identity);
  }

  async requestValidation(
    snapshot: AdaptiveReleaseReviewSnapshot,
  ): Promise<AdaptiveReleaseReviewSnapshot> {
    await invoke(this.functions, "compile-adaptive-storefront", {
      storeId: snapshot.storeId,
      installationId: snapshot.installationId,
      idempotencyKey: operationKey("adaptive-validation"),
      expectedSourceRevision: snapshot.sourceRevision,
      expectedPointerRevision: snapshot.currentPointerRevision,
      intent: "shadow-only",
    });
    return this.gateway.load(identityFor(snapshot));
  }

  async review(
    snapshot: AdaptiveReleaseReviewSnapshot,
    decision: AdaptiveReleaseReviewDecision,
  ): Promise<AdaptiveReleaseReviewSnapshot> {
    const shadow = snapshot.latestJob?.shadow;
    if (!snapshot.latestJob || !shadow || shadow.status !== "pending") {
      throw new Error("Only the exact pending adaptive candidate can be reviewed.");
    }
    await this.shadowReview.review({
      storeId: snapshot.storeId,
      shadowId: shadow.shadowId,
      expectedReviewRevision: shadow.reviewRevision,
      idempotencyKey: operationKey(`adaptive-review-${decision}`),
      decision,
    });
    return this.gateway.load(identityFor(snapshot));
  }

  async publish(snapshot: AdaptiveReleaseReviewSnapshot): Promise<AdaptiveReleaseReviewSnapshot> {
    const job = snapshot.latestJob;
    if (
      !job || job.state !== "succeeded" || job.shadow?.status !== "accepted" ||
      job.isCurrent || job.published
    ) {
      throw new Error("Only the exact accepted adaptive candidate can be published.");
    }
    await invoke(this.functions, "publish-reviewed-adaptive-storefront", {
      storeId: snapshot.storeId,
      jobId: job.jobId,
      expectedPointerRevision: snapshot.currentPointerRevision,
    });
    return this.gateway.load(identityFor(snapshot));
  }
}

let browserService: AdaptiveReleaseReviewService | null = null;

export const getAdaptiveReleaseReviewService = (): AdaptiveReleaseReviewService => {
  if (browserService) return browserService;
  const client = getSupabaseBrowserClient();
  browserService = new AdaptiveReleaseReviewService(
    new SupabaseAdaptiveReleaseReviewGateway(
      client as unknown as AdaptiveReleaseReviewRpcClient,
    ),
    new SupabaseAdaptiveShadowReviewGateway(
      client as unknown as AdaptiveReleaseReviewRpcClient,
    ),
    client.functions as unknown as AdaptiveReleaseReviewFunctionsClient,
  );
  return browserService;
};
