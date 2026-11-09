import type {
  StoreKitInstallationActivation,
  StoreKitInstallationActivationResult,
  StoreKitInstallationStageCommit,
  StoreKitInstallationStageResult,
} from "./lifecycleContracts";
import type {
  StoreKitInstallationActivationGateway,
  StoreKitInstallationStageGateway,
} from "./StoreKitInstallationService";

export type InstallationRpcError = Readonly<{
  message: string;
  code?: string;
  details?: string;
}>;

export interface InstallationRpcClient {
  rpc(
    functionName: string,
    args?: Readonly<Record<string, unknown>>,
  ): PromiseLike<Readonly<{ data: unknown; error: InstallationRpcError | null }>>;
}

export type InstallationRevisionQueryError = Readonly<{
  message: string;
  code?: string;
}>;

export interface InstallationRevisionQueryBuilder {
  select(columns: string): InstallationRevisionQueryBuilder;
  eq(column: string, value: string): InstallationRevisionQueryBuilder;
  order(column: string, options: Readonly<{ ascending: boolean }>): InstallationRevisionQueryBuilder;
  limit(count: number): InstallationRevisionQueryBuilder;
  maybeSingle(): PromiseLike<Readonly<{
    data: Readonly<{ revision: unknown }> | null;
    error: InstallationRevisionQueryError | null;
  }>>;
}

export interface InstallationRevisionQueryClient {
  from(table: "adaptive_store_kit_installations"): InstallationRevisionQueryBuilder;
}

export interface StoreKitInstallationRevisionGateway {
  loadCurrentRevision(storeId: string): Promise<number>;
}

const call = async (
  client: InstallationRpcClient,
  name: string,
  args: Readonly<Record<string, unknown>>,
): Promise<unknown> => {
  const response = await client.rpc(name, args);
  if (!response.error) return response.data;
  const failure = new Error(`${name} failed: ${response.error.message}`);
  failure.name = response.error.code
    ? `SupabaseRpcError:${response.error.code}`
    : "SupabaseRpcError";
  throw failure;
};

/** Browser/session gateway. The SQL function repeats all catalog and source checks. */
export class SupabaseStoreKitInstallationStageGateway
implements StoreKitInstallationStageGateway {
  constructor(private readonly client: InstallationRpcClient) {}

  stageAtomic(commit: StoreKitInstallationStageCommit): Promise<StoreKitInstallationStageResult> {
    return call(this.client, "stage_adaptive_store_kit_installation", {
      p_store_id: commit.storeId,
      p_store_kit_id: commit.storeKit.id,
      p_store_kit_version: commit.storeKit.version,
      p_lockfile: commit.storeKit.lockfile,
      p_design_tokens: commit.designTokens,
      p_base_definition: commit.baseDocument,
      p_merchant_patches: commit.merchantPatches,
      p_commerce_bindings: commit.commerceBindings,
      p_expected_installation_revision: commit.expectedInstallationRevision,
      p_idempotency_key: commit.idempotencyKey,
    }) as Promise<StoreKitInstallationStageResult>;
  }
}

/**
 * Reads only the latest optimistic installation revision. Row-level security on
 * adaptive_store_kit_installations limits this query to authorized theme
 * readers; the staging RPC independently requires theme.edit.
 */
export class SupabaseStoreKitInstallationRevisionGateway
implements StoreKitInstallationRevisionGateway {
  constructor(private readonly client: InstallationRevisionQueryClient) {}

  async loadCurrentRevision(storeId: string): Promise<number> {
    const response = await this.client
      .from("adaptive_store_kit_installations")
      .select("revision")
      .eq("store_id", storeId)
      .order("revision", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (response.error) {
      const failure = new Error(
        `Adaptive installation revision load failed: ${response.error.message}`,
      );
      failure.name = response.error.code
        ? `SupabaseQueryError:${response.error.code}`
        : "SupabaseQueryError";
      throw failure;
    }
    if (response.data === null) return 0;
    const revision = response.data.revision;
    if (!Number.isSafeInteger(revision) || Number(revision) < 0) {
      throw new Error("Adaptive installation revision response is invalid.");
    }
    return Number(revision);
  }
}

/**
 * Trusted-server gateway. Supplying an ordinary browser Supabase client will
 * fail at the SQL service-role check before any state is mutated.
 */
export class SupabaseStoreKitInstallationActivationGateway
implements StoreKitInstallationActivationGateway {
  constructor(private readonly client: InstallationRpcClient) {}

  activateAtomic(
    candidate: StoreKitInstallationActivation,
  ): Promise<StoreKitInstallationActivationResult> {
    return call(this.client, "activate_adaptive_store_kit_installation", {
      p_store_id: candidate.storeId,
      p_installation_id: candidate.installationId,
      p_shadow_id: candidate.acceptedShadowId,
      p_expected_installation_revision: candidate.expectedInstallationRevision,
      p_expected_source_revision: candidate.expectedSourceRevision,
      p_expected_source_hash: candidate.expectedStageSourceHash,
      p_artifact: candidate.artifact,
      p_artifact_hash: candidate.artifact.artifactHash,
      p_compiler_version: candidate.artifact.compilerVersion,
      p_expected_pointer_revision: candidate.expectedPointerRevision,
    }) as Promise<StoreKitInstallationActivationResult>;
  }
}
