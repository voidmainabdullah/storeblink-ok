import {
  adaptiveComponentLibrarySchema,
  designPackSchema,
  merchantPatchSchema,
  runtimeArtifactSchema,
  STOREFRONT_RESOURCE_TYPES,
  storeKitSchema,
  storeDefinitionSchema,
  templateBlueprintSchema,
  type MerchantPatch,
  type StorefrontResourceType,
} from "../contracts";
import type { RuntimeAsset } from "../compiler";
import { AdaptiveCommerceRegistry } from "../registry";
import { projectRuntimeArtifact, type LegacyShadowProjection } from "../shadow";
import type {
  RolloutEvaluatorConfigInput,
  RolloutEvaluatorState,
  RolloutPercentage,
} from "../rollout";
import { isRolloutPercentage, parseRumSample } from "../rollout";
import type {
  CanonicalCompileSource,
  ClaimedCompileJob,
  CompileJobClaim,
  ServerCompileJobResult,
  ServerCompilerGateway,
  ServerCompilerRegistryLoader,
} from "./types";
import { SERVER_COMPILE_JOB_STATES } from "./types";
import type {
  RolloutCommitResult,
  RolloutControllerGateway,
  RolloutControllerSnapshot,
  ScheduledRolloutBatchGateway,
} from "./ScheduledRolloutController";

export type SupabaseRpcError = Readonly<{
  message: string;
  code?: string;
  details?: string;
}>;

export interface SupabaseRpcClient {
  rpc(
    functionName: string,
    args?: Readonly<Record<string, unknown>>,
  ): PromiseLike<Readonly<{ data: unknown; error: SupabaseRpcError | null }>>;
}

export type LegacyProjectionResolver = (
  legacySnapshot: unknown,
) => LegacyShadowProjection | Promise<LegacyShadowProjection>;

const record = (value: unknown, label: string): Record<string, unknown> => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} returned an invalid response.`);
  }
  return value as Record<string, unknown>;
};

const requiredString = (value: unknown, label: string): string => {
  if (typeof value !== "string" || !value) throw new Error(`${label} is missing.`);
  return value;
};

const requiredInteger = (value: unknown, label: string): number => {
  if (typeof value !== "number" || !Number.isSafeInteger(value)) {
    throw new Error(`${label} is invalid.`);
  }
  return value;
};

const rpcFailure = (name: string, error: SupabaseRpcError): Error => {
  const failure = new Error(`${name} failed: ${error.message}`);
  failure.name = error.code ? `SupabaseRpcError:${error.code}` : "SupabaseRpcError";
  return failure;
};

const callRpc = async (
  client: SupabaseRpcClient,
  name: string,
  args: Readonly<Record<string, unknown>>,
): Promise<unknown> => {
  const response = await client.rpc(name, args);
  if (response.error) throw rpcFailure(name, response.error);
  return response.data;
};

const compileJobResult = (value: unknown): ServerCompileJobResult | null => {
  if (value === null || value === undefined) return null;
  const input = record(value, "Compile job result");
  const shadowStatus = requiredString(input.shadowStatus, "Shadow status");
  if (!(["pending", "accepted", "rejected", "uncomparable"] as const).includes(
    shadowStatus as "pending" | "accepted" | "rejected" | "uncomparable",
  )) throw new Error("Compile job shadow status is invalid.");
  return Object.freeze({
    jobId: requiredString(input.jobId, "Compile job id"),
    sourceRevision: requiredInteger(input.sourceRevision, "Compile source revision"),
    artifactHash: requiredString(input.artifactHash, "Artifact hash"),
    shadowId: requiredString(input.shadowId, "Shadow id"),
    shadowStatus: shadowStatus as ServerCompileJobResult["shadowStatus"],
    publicationId: input.publicationId === null
      ? null
      : requiredString(input.publicationId, "Publication id"),
    pointerRevision: input.pointerRevision === null
      ? null
      : requiredInteger(input.pointerRevision, "Pointer revision"),
    published: input.published === true,
  });
};

const defaultLegacyProjection: LegacyProjectionResolver = (snapshot) => {
  const adaptiveArtifact = runtimeArtifactSchema.safeParse(snapshot);
  if (adaptiveArtifact.success) {
    return {
      projection: projectRuntimeArtifact(adaptiveArtifact.data),
      uncomparableRoutes: [],
    };
  }
  return {
    projection: null,
    uncomparableRoutes: [...STOREFRONT_RESOURCE_TYPES],
    reason: "No active adaptive artifact or certified legacy projection is available.",
  };
};

export class SupabaseAdaptiveReleaseGateway implements ServerCompilerGateway, ServerCompilerRegistryLoader {
  constructor(
    private readonly client: SupabaseRpcClient,
    private readonly resolveLegacyProjection: LegacyProjectionResolver = defaultLegacyProjection,
  ) {}

  async loadCompilerRegistry(input: Readonly<{
    storeId: string;
    installationId: string;
  }>): Promise<AdaptiveCommerceRegistry> {
    const data = record(await callRpc(this.client, "load_adaptive_storefront_compile_catalog", {
      p_store_id: input.storeId,
      p_installation_id: input.installationId,
    }), "Adaptive compiler catalog");
    const storeKit = storeKitSchema.parse(data.storeKit);
    const designPack = designPackSchema.parse(data.designPack);
    const componentLibrary = adaptiveComponentLibrarySchema.parse(data.componentLibrary);
    if (!Array.isArray(data.blueprints)) throw new Error("Adaptive compiler blueprints are invalid.");
    const blueprints = data.blueprints.map((blueprint) => templateBlueprintSchema.parse(blueprint));
    const registry = new AdaptiveCommerceRegistry({
      engineSchemaVersion: storeKit.lockfile.engineSchemaVersion,
      tokenSchemaVersion: storeKit.lockfile.tokenSchemaVersion,
      capabilityPolicyVersion: storeKit.lockfile.capabilityPolicyVersion,
      supportedCapabilities: [...storeKit.requiredCapabilities, ...storeKit.optionalCapabilities],
    });
    registry.registerDesignPack(designPack);
    registry.registerComponentLibrary(componentLibrary);
    blueprints.forEach((blueprint) => registry.registerTemplateBlueprint(blueprint));
    registry.registerStoreKit(storeKit);
    registry.resolveInstallable(storeKit.id, storeKit.version);
    return registry;
  }

  async claimJob(input: Parameters<ServerCompilerGateway["claimJob"]>[0]): Promise<CompileJobClaim> {
    const data = record(await callRpc(this.client, "claim_adaptive_storefront_compile_job", {
      p_job_id: input.request.jobId,
      p_store_id: input.request.storeId,
      p_installation_id: input.request.installationId,
      p_idempotency_key: input.request.idempotencyKey,
      p_request_hash: input.requestHash,
      p_expected_source_revision: input.request.expectedSourceRevision,
      p_expected_pointer_revision: input.request.expectedPointerRevision,
      p_intent: input.request.intent,
    }), "Compile job claim");
    const state = requiredString(data.state, "Compile job state") as ClaimedCompileJob["state"];
    if (!SERVER_COMPILE_JOB_STATES.includes(state)) throw new Error("Compile job state is invalid.");
    const job: ClaimedCompileJob = Object.freeze({
      jobId: requiredString(data.jobId, "Compile job id"),
      state,
      createdAt: requiredString(data.createdAt, "Compile job creation time"),
      result: compileJobResult(data.result),
      errorCode: data.errorCode === null ? null : requiredString(data.errorCode, "Compile error code"),
      errorMessage: data.errorMessage === null
        ? null
        : requiredString(data.errorMessage, "Compile error message"),
    });
    return Object.freeze({ kind: data.claimed === true ? "claimed" : "existing", job });
  }

  async transitionJob(input: Parameters<ServerCompilerGateway["transitionJob"]>[0]): Promise<void> {
    await callRpc(this.client, "transition_adaptive_storefront_compile_job", {
      p_job_id: input.jobId,
      p_expected_state: input.expectedState,
      p_next_state: input.nextState,
      p_result: null,
    });
  }

  async loadCanonicalSource(
    input: Parameters<ServerCompilerGateway["loadCanonicalSource"]>[0],
  ): Promise<CanonicalCompileSource> {
    const data = record(await callRpc(this.client, "load_adaptive_storefront_compile_source", {
      p_store_id: input.storeId,
      p_installation_id: input.installationId,
      p_expected_source_revision: input.expectedSourceRevision,
    }), "Canonical compile source");
    const patches = Array.isArray(data.merchantPatches)
      ? data.merchantPatches.map((patch) => merchantPatchSchema.parse(patch) as MerchantPatch)
      : (() => { throw new Error("Canonical merchant patches are invalid."); })();
    const assets = Array.isArray(data.assets) ? data.assets as RuntimeAsset[] : [];
    const sourceHash = requiredString(data.sourceHash, "Canonical source hash");
    if (!/^sha256:[a-f0-9]{64}$/.test(sourceHash)) {
      throw new Error("Canonical source hash is invalid.");
    }
    return Object.freeze({
      sourceRevision: requiredInteger(data.sourceRevision, "Canonical source revision"),
      sourceHash,
      storeDefinition: storeDefinitionSchema.parse(data.storeDefinition),
      merchantPatches: Object.freeze(patches),
      assets: Object.freeze(structuredClone(assets)),
      legacyProjection: await this.resolveLegacyProjection(data.legacySnapshot),
    });
  }

  async assertSourceRevision(
    input: Parameters<ServerCompilerGateway["assertSourceRevision"]>[0],
  ): Promise<void> {
    await callRpc(this.client, "assert_adaptive_storefront_source_revision", {
      p_store_id: input.storeId,
      p_installation_id: input.installationId,
      p_expected_source_revision: input.expectedSourceRevision,
    });
  }

  async recordShadow(input: Parameters<ServerCompilerGateway["recordShadow"]>[0]): Promise<string> {
    const data = await callRpc(this.client, "record_adaptive_compile_job_shadow", {
      p_job_id: input.jobId,
      p_structural_diff: input.structuralDiff,
      p_visual_diff: null,
      p_status: input.status,
    });
    return requiredString(data, "Shadow compilation id");
  }

  async persistCandidate(input: Parameters<ServerCompilerGateway["persistCandidate"]>[0]): Promise<void> {
    await callRpc(this.client, "persist_adaptive_storefront_compile_candidate", {
      p_job_id: input.jobId,
      p_expected_state: input.expectedState,
      p_source_revision: input.sourceRevision,
      p_artifact: input.artifact,
      p_artifact_hash: input.artifact.artifactHash,
      p_compiler_version: input.artifact.compilerVersion,
    });
  }

  async publishAtomic(input: Parameters<ServerCompilerGateway["publishAtomic"]>[0]): Promise<{
    publicationId: string;
    pointerRevision: number;
  }> {
    const data = record(await callRpc(this.client, "publish_adaptive_storefront_compile_job", {
      p_job_id: input.jobId,
      p_store_id: input.storeId,
      p_installation_id: input.installationId,
      p_source_revision: input.sourceRevision,
      p_artifact_hash: input.artifact.artifactHash,
      p_expected_pointer_revision: input.expectedPointerRevision,
    }), "Adaptive publication");
    return Object.freeze({
      publicationId: requiredString(data.publication_id, "Publication id"),
      pointerRevision: requiredInteger(data.pointer_revision, "Pointer revision"),
    });
  }

  async completeJob(input: Parameters<ServerCompilerGateway["completeJob"]>[0]): Promise<void> {
    await callRpc(this.client, "transition_adaptive_storefront_compile_job", {
      p_job_id: input.jobId,
      p_expected_state: input.expectedState,
      p_next_state: "succeeded",
      p_result: input.result,
    });
  }

  async failJob(input: Parameters<ServerCompilerGateway["failJob"]>[0]): Promise<void> {
    await callRpc(this.client, "fail_adaptive_storefront_compile_job", {
      p_job_id: input.jobId,
      p_error_code: input.errorCode,
      p_error_message: input.errorMessage,
    });
  }
}

export class SupabaseScheduledRolloutGateway implements ScheduledRolloutBatchGateway {
  constructor(private readonly client: SupabaseRpcClient) {}

  async listEligibleStoreIds(limit: number): Promise<readonly string[]> {
    const data = await callRpc(this.client, "list_adaptive_rollouts_due_for_evaluation", {
      p_limit: limit,
    });
    if (!Array.isArray(data) || data.some((value) => typeof value !== "string")) {
      throw new Error("Scheduled rollout store list is invalid.");
    }
    return Object.freeze([...data] as string[]);
  }

  async loadEvaluationInput(storeId: string, windowMinutes: number): Promise<RolloutControllerSnapshot> {
    const data = record(await callRpc(this.client, "load_adaptive_rollout_evaluation_input", {
      p_store_id: storeId,
      p_window_minutes: windowMinutes,
    }), "Rollout evaluation input");
    const currentPercentage = requiredInteger(data.currentPercentage, "Rollout percentage");
    if (!isRolloutPercentage(currentPercentage)) throw new Error("Rollout percentage is unsupported.");
    return Object.freeze({
      rolloutId: requiredString(data.rolloutId, "Rollout id"),
      publicationId: requiredString(data.publicationId, "Rollout publication id"),
      currentPercentage,
      revision: requiredInteger(data.revision, "Rollout revision"),
      killSwitch: data.killSwitch === true,
      state: record(data.state, "Rollout evaluator state") as RolloutEvaluatorState,
      config: record(data.config, "Rollout evaluator config") as RolloutEvaluatorConfigInput,
      samples: Array.isArray(data.samples) ? data.samples.map(parseRumSample) : [],
    });
  }

  async commitEvaluation(input: Parameters<RolloutControllerGateway["commitEvaluation"]>[0]): Promise<RolloutCommitResult> {
    const data = record(await callRpc(this.client, "commit_adaptive_rollout_evaluation", {
      p_store_id: input.storeId,
      p_expected_revision: input.expectedRevision,
      p_evaluation: input.evaluation,
    }), "Rollout evaluation commit");
    return Object.freeze({
      recommendation: requiredString(data.recommendation, "Committed rollout recommendation"),
      percentage: requiredInteger(data.percentage, "Committed rollout percentage") as RolloutPercentage,
      status: requiredString(data.status, "Committed rollout status"),
      revision: requiredInteger(data.revision, "Committed rollout revision"),
    });
  }
}

export type { StorefrontResourceType };
