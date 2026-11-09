import { getSupabaseBrowserClient } from "@/platform/supabase/client";
import {
  adaptiveAuthoringSaveRequestSchema,
  adaptiveAuthoringSaveResultSchema,
  adaptiveAuthoringSourceSchema,
  type AdaptiveAuthoringSaveRequest,
  type AdaptiveAuthoringSaveResult,
  type AdaptiveAuthoringSource,
} from "./types";
import { prepareAdaptiveAuthoringSource } from "./prepareSource";

export type AdaptiveAuthoringRpcError = Readonly<{
  message: string;
  code?: string;
  details?: string;
}>;

export interface AdaptiveAuthoringRpcClient {
  rpc(
    functionName: string,
    args?: Readonly<Record<string, unknown>>,
  ): PromiseLike<Readonly<{ data: unknown; error: AdaptiveAuthoringRpcError | null }>>;
}

export interface AdaptiveAuthoringGateway {
  load(storeId: string): Promise<AdaptiveAuthoringSource | null>;
  save(request: AdaptiveAuthoringSaveRequest): Promise<AdaptiveAuthoringSaveResult>;
}

export class AdaptiveAuthoringGatewayError extends Error {
  readonly code: string | null;

  constructor(action: string, error: AdaptiveAuthoringRpcError) {
    super(`${action} failed: ${error.message}`);
    this.name = "AdaptiveAuthoringGatewayError";
    this.code = error.code ?? null;
  }
}

export class SupabaseAdaptiveAuthoringGateway implements AdaptiveAuthoringGateway {
  constructor(private readonly client: AdaptiveAuthoringRpcClient) {}

  async load(storeId: string): Promise<AdaptiveAuthoringSource | null> {
    const response = await this.client.rpc("load_adaptive_storefront_authoring_source", {
      p_store_id: storeId,
    });
    if (response.error) throw new AdaptiveAuthoringGatewayError("Adaptive source load", response.error);
    if (response.data === null) return null;
    return prepareAdaptiveAuthoringSource(adaptiveAuthoringSourceSchema.parse(response.data));
  }

  async save(rawRequest: AdaptiveAuthoringSaveRequest): Promise<AdaptiveAuthoringSaveResult> {
    const request = adaptiveAuthoringSaveRequestSchema.parse(rawRequest);
    const response = await this.client.rpc("save_adaptive_storefront_authoring_patch", {
      p_store_id: request.storeId,
      p_installation_id: request.installationId,
      p_expected_source_revision: request.expectedSourceRevision,
      p_idempotency_key: request.idempotencyKey,
      p_operations: request.operations,
      p_design_tokens: request.designTokens,
      p_commerce_bindings: request.commerceBindings,
    });
    if (response.error) throw new AdaptiveAuthoringGatewayError("Adaptive source save", response.error);
    return adaptiveAuthoringSaveResultSchema.parse(response.data);
  }
}

let browserGateway: AdaptiveAuthoringGateway | null = null;

export const getAdaptiveAuthoringGateway = (): AdaptiveAuthoringGateway => {
  browserGateway ??= new SupabaseAdaptiveAuthoringGateway(
    getSupabaseBrowserClient() as unknown as AdaptiveAuthoringRpcClient,
  );
  return browserGateway;
};
