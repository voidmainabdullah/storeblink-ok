import {
  semanticPathStartsWith,
  type SemanticStorefrontDocument,
} from "@/adaptive-commerce/contracts";
import type { AdaptiveCommerceRegistry } from "@/adaptive-commerce/registry";
import type { MerchantPatchSystem } from "@/adaptive-commerce/patches";
import { merchantPatchSystem } from "@/adaptive-commerce/patches";
import { seedStorefrontSectionControls } from "@/adaptive-commerce/compiler";
import {
  storeKitInstallationActivationResultSchema,
  storeKitInstallationActivationSchema,
  storeKitInstallationStageCommitSchema,
  storeKitInstallationStageRequestSchema,
  storeKitInstallationStageResultSchema,
  type StoreKitInstallationActivation,
  type StoreKitInstallationActivationResult,
  type StoreKitInstallationStageCommit,
  type StoreKitInstallationStageRequest,
  type StoreKitInstallationStageResult,
} from "./lifecycleContracts";

export interface StoreKitInstallationStageGateway {
  stageAtomic(
    commit: StoreKitInstallationStageCommit,
  ): Promise<StoreKitInstallationStageResult>;
}

/** This gateway must be backed by a service-role-only RPC. */
export interface StoreKitInstallationActivationGateway {
  activateAtomic(
    candidate: StoreKitInstallationActivation,
  ): Promise<StoreKitInstallationActivationResult>;
}

export type StoreKitInstallationServiceDependencies = Readonly<{
  registry: AdaptiveCommerceRegistry;
  gateway: StoreKitInstallationStageGateway;
  patchSystem?: MerchantPatchSystem;
}>;

const clone = <T>(value: T): T => structuredClone(value);

const hasSemanticTarget = (
  document: SemanticStorefrontDocument,
  target: string,
): boolean => [
  ...Object.keys(document.values),
  ...Object.keys(document.collections),
].some((path) => semanticPathStartsWith(path, target));

const assertUnique = (
  values: readonly string[],
  label: string,
): void => {
  const seen = new Set<string>();
  values.forEach((value) => {
    if (seen.has(value)) {
      throw new StoreKitInstallationPreflightError(`Duplicate ${label} ${value}.`);
    }
    seen.add(value);
  });
};

export class StoreKitInstallationPreflightError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "StoreKitInstallationPreflightError";
  }
}

export class StoreKitInstallationCommitContractError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "StoreKitInstallationCommitContractError";
  }
}

/**
 * Performs deterministic checks before crossing the staging boundary. Staging
 * persists source only; it never archives the active installation and never
 * changes the active publication pointer.
 */
export class StoreKitInstallationService {
  private readonly patchSystem: MerchantPatchSystem;

  constructor(private readonly dependencies: StoreKitInstallationServiceDependencies) {
    this.patchSystem = dependencies.patchSystem ?? merchantPatchSystem;
  }

  preflight(rawRequest: StoreKitInstallationStageRequest): StoreKitInstallationStageCommit {
    const request = storeKitInstallationStageRequestSchema.parse(rawRequest);
    const resolved = this.dependencies.registry.resolveInstallable(
      request.storeKitId,
      request.storeKitVersion,
    );
    const baseDocument = seedStorefrontSectionControls(
      request.baseDocument,
      resolved.blueprints,
    );
    const effectivePresetId = request.presetId ?? resolved.storeKit.defaultPresetId;
    if (
      effectivePresetId !== null &&
      !resolved.designPack.presets.some((preset) => preset.id === effectivePresetId)
    ) {
      throw new StoreKitInstallationPreflightError(
        `Preset ${effectivePresetId} is not declared by ${resolved.designPack.id}@${resolved.designPack.version}.`,
      );
    }

    assertUnique(request.merchantPatches.map((patch) => patch.id), "merchant patch id");
    request.merchantPatches.forEach((patch) => {
      if (patch.storeId !== request.storeId) {
        throw new StoreKitInstallationPreflightError(
          `Patch ${patch.id} belongs to store ${patch.storeId}, not ${request.storeId}.`,
        );
      }
      if (patch.baseRevisionId !== baseDocument.revisionId) {
        throw new StoreKitInstallationPreflightError(
          `Patch ${patch.id} targets base ${patch.baseRevisionId}, not ${baseDocument.revisionId}.`,
        );
      }
      if (patch.status !== "active") {
        throw new StoreKitInstallationPreflightError(
          `Patch ${patch.id} is ${patch.status}; installation accepts active patches only.`,
        );
      }
    });

    assertUnique(request.commerceBindings.map((binding) => binding.id), "commerce binding id");
    request.commerceBindings.forEach((binding) => {
      if (!hasSemanticTarget(baseDocument, binding.target.path)) {
        throw new StoreKitInstallationPreflightError(
          `Commerce binding ${binding.id} targets unmapped semantic path ${binding.target.path}.`,
        );
      }
    });

    // Applying the patches here proves the staged patch stream is valid against
    // the exact base. The database still persists the base and operations
    // separately so future three-way merges retain their semantic ownership.
    this.patchSystem.apply(
      baseDocument,
      request.merchantPatches,
    );
    return storeKitInstallationStageCommitSchema.parse({
      kind: "store-kit-installation-stage",
      storeId: request.storeId,
      storeKit: resolved.storeKit,
      designTokens: {
        presetId: effectivePresetId,
        overrides: request.tokenOverrides,
      },
      expectedInstallationRevision: request.expectedInstallationRevision,
      idempotencyKey: request.idempotencyKey,
      baseDocument,
      merchantPatches: request.merchantPatches,
      commerceBindings: request.commerceBindings,
      requestedAt: request.requestedAt,
    });
  }

  async stage(
    rawRequest: StoreKitInstallationStageRequest,
  ): Promise<StoreKitInstallationStageResult> {
    const commit = this.preflight(rawRequest);
    const result = storeKitInstallationStageResultSchema.parse(
      await this.dependencies.gateway.stageAtomic(clone(commit)),
    );
    const installation = result.installation;
    const expectedRevision = commit.expectedInstallationRevision + 1;
    if (installation.revision !== expectedRevision) {
      throw new StoreKitInstallationCommitContractError(
        `Atomic gateway returned revision ${installation.revision}; expected ${expectedRevision}.`,
      );
    }
    if (
      installation.status !== "staged" ||
      installation.storeId !== commit.storeId ||
      installation.storeKitId !== commit.storeKit.id ||
      installation.storeKitVersion !== commit.storeKit.version ||
      installation.presetId !== commit.designTokens.presetId ||
      installation.baseDocumentRevisionId !== commit.baseDocument.revisionId ||
      result.idempotencyKey !== commit.idempotencyKey ||
      JSON.stringify(installation.resolvedLockfile) !== JSON.stringify(commit.storeKit.lockfile)
    ) {
      throw new StoreKitInstallationCommitContractError(
        "Atomic gateway returned an installation that does not match the preflight commit.",
      );
    }
    return clone(result);
  }
}

export class StoreKitInstallationActivationService {
  constructor(private readonly gateway: StoreKitInstallationActivationGateway) {}

  async activate(
    rawCandidate: StoreKitInstallationActivation,
  ): Promise<StoreKitInstallationActivationResult> {
    const candidate = storeKitInstallationActivationSchema.parse(rawCandidate);
    if (
      candidate.artifact.storeId !== candidate.storeId ||
      candidate.artifact.installationId !== candidate.installationId
    ) {
      throw new StoreKitInstallationPreflightError(
        "Compiled artifact identity does not match the staged installation.",
      );
    }
    const result = storeKitInstallationActivationResultSchema.parse(
      await this.gateway.activateAtomic(clone(candidate)),
    );
    if (
      result.installationId !== candidate.installationId ||
      result.installationRevision !== candidate.expectedInstallationRevision ||
      result.sourceRevision !== candidate.expectedSourceRevision ||
      result.sourceHash !== candidate.expectedStageSourceHash ||
      result.artifactHash !== candidate.artifact.artifactHash ||
      result.pointerRevision !== candidate.expectedPointerRevision + 1
    ) {
      throw new StoreKitInstallationCommitContractError(
        "Activation gateway returned an identity that does not match the accepted candidate.",
      );
    }
    return clone(result);
  }
}

/** @deprecated Use StoreKitInstallationStageGateway. Installation is now two-phase. */
export type StoreKitInstallationAtomicGateway = StoreKitInstallationStageGateway;
