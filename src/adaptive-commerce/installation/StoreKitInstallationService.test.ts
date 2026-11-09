import { describe, expect, it, vi } from "vitest";
import {
  STOREFRONT_RESOURCE_TYPES,
  routeSectionOrderSemanticPath,
  sectionControlSemanticPath,
  semanticPath,
  type RuntimeArtifact,
} from "@/adaptive-commerce/contracts";
import {
  createInstallationRequest,
  createRegistry,
  createStoreKit,
} from "@/adaptive-commerce/testing/fixtures";
import {
  StoreKitInstallationActivationService,
  StoreKitInstallationCommitContractError,
  StoreKitInstallationPreflightError,
  StoreKitInstallationService,
  type StoreKitInstallationActivationGateway,
  type StoreKitInstallationStageGateway,
} from "./StoreKitInstallationService";
import type {
  StoreKitInstallationActivation,
  StoreKitInstallationActivationResult,
  StoreKitInstallationStageCommit,
  StoreKitInstallationStageRequest,
  StoreKitInstallationStageResult,
} from "./lifecycleContracts";

const HASH_A = `sha256:${"a".repeat(64)}`;
const HASH_B = `sha256:${"b".repeat(64)}`;

const stageRequest = (): StoreKitInstallationStageRequest => {
  const old = createInstallationRequest();
  return {
    storeId: old.storeId,
    storeKitId: old.storeKitId,
    storeKitVersion: old.storeKitVersion,
    presetId: old.presetId,
    tokenOverrides: [],
    expectedInstallationRevision: old.expectedInstallationRevision,
    idempotencyKey: old.idempotencyKey,
    baseDocument: old.baseDocument,
    merchantPatches: old.merchantPatches,
    commerceBindings: old.commerceBindings,
    requestedAt: old.requestedAt,
  };
};

const stageResult = (
  outcome: StoreKitInstallationStageResult["outcome"] = "staged",
): StoreKitInstallationStageResult => ({
  kind: "store-kit-installation-stage-result",
  outcome,
  idempotencyKey: "install-store-one-v1",
  installation: {
    kind: "staged-store-kit-installation",
    id: "installation-one",
    storeId: "store-one",
    storeKitId: "professional-store",
    storeKitVersion: "1.0.0",
    resolvedLockfile: createStoreKit().lockfile,
    presetId: "warm",
    baseRevisionId: "8ed226fc-f408-42b8-847b-fd44cf135a8f",
    baseDocumentRevisionId: "base-v1",
    sourceRevision: 2,
    sourceHash: HASH_A,
    status: "staged",
    revision: 4,
    installedAt: "2026-08-21T10:06:00.000Z",
    updatedAt: "2026-08-21T10:06:00.000Z",
  },
});

const serviceWith = (
  implementation: (
    commit: StoreKitInstallationStageCommit,
  ) => Promise<StoreKitInstallationStageResult>,
) => {
  const stageAtomic = vi.fn(implementation);
  const gateway: StoreKitInstallationStageGateway = { stageAtomic };
  return {
    stageAtomic,
    service: new StoreKitInstallationService({ registry: createRegistry(), gateway }),
  };
};

const artifact = (): RuntimeArtifact => {
  const kit = createStoreKit();
  const routes = Object.fromEntries(STOREFRONT_RESOURCE_TYPES.map((resourceType) => [
    resourceType,
    {
      resourceType,
      blueprint: kit.lockfile.blueprints[resourceType],
      document: {},
    },
  ])) as RuntimeArtifact["routes"];
  return {
    kind: "runtime-artifact",
    artifactVersion: 1,
    id: "artifact-one",
    storeId: "store-one",
    installationId: "installation-one",
    storeKit: { id: kit.id, version: kit.version, integrity: kit.integrity },
    schemaVersion: 1,
    compilerVersion: "1.0.0",
    sourceHash: HASH_B,
    artifactHash: HASH_A,
    createdAt: "2026-08-21T10:07:00.000Z",
    routes,
    globals: {},
    resolvedTokens: {},
    componentVersions: {},
    bindingPlans: [],
    assets: [],
    diagnostics: [],
    extensions: {},
  };
};

const activation = (): StoreKitInstallationActivation => ({
  storeId: "store-one",
  installationId: "installation-one",
  acceptedShadowId: "shadow-one",
  expectedInstallationRevision: 4,
  expectedSourceRevision: 2,
  expectedStageSourceHash: HASH_A,
  expectedPointerRevision: 6,
  artifact: artifact(),
});

const activationResult = (): StoreKitInstallationActivationResult => ({
  kind: "store-kit-installation-activation-result",
  installationId: "installation-one",
  previousInstallationId: "installation-zero",
  installationRevision: 4,
  sourceRevision: 2,
  sourceHash: HASH_A,
  artifactId: "artifact-row-one",
  artifactHash: HASH_A,
  publicationId: "publication-one",
  publicationRevision: 7,
  pointerRevision: 7,
  status: "active",
});

describe("StoreKitInstallationService", () => {
  it("stages canonical source without accepting browser artifact identity", async () => {
    const { service, stageAtomic } = serviceWith(async () => stageResult());
    const result = await service.stage(stageRequest());
    expect(result.installation.status).toBe("staged");
    expect(stageAtomic).toHaveBeenCalledTimes(1);
    expect(stageAtomic.mock.calls[0][0]).toMatchObject({
      kind: "store-kit-installation-stage",
      expectedInstallationRevision: 3,
      idempotencyKey: "install-store-one-v1",
      designTokens: { presetId: "warm", overrides: [] },
    });
    const persistedBase = stageAtomic.mock.calls[0][0].baseDocument;
    const homeSectionPath = semanticPath("home.main");
    expect(persistedBase.values[sectionControlSemanticPath(homeSectionPath, "variant")])
      .toBe("default");
    expect(persistedBase.values[sectionControlSemanticPath(homeSectionPath, "visible")])
      .toBe(true);
    expect(persistedBase.collections[routeSectionOrderSemanticPath("home")].order)
      .toEqual([homeSectionPath]);
    expect(stageAtomic.mock.calls[0][0]).not.toHaveProperty("runtimeArtifact");
  });

  it("passes idempotency through and accepts an exact staging replay", async () => {
    const { service, stageAtomic } = serviceWith(async () => stageResult("replayed"));
    const result = await service.stage(stageRequest());
    expect(result.outcome).toBe("replayed");
    expect(stageAtomic).toHaveBeenCalledTimes(1);
  });

  it("does not call persistence when semantic preflight fails", async () => {
    const { service, stageAtomic } = serviceWith(async () => stageResult());
    const request = stageRequest();
    request.commerceBindings[0].target.path = semanticPath("home.unmapped");
    await expect(service.stage(request)).rejects.toThrow(StoreKitInstallationPreflightError);
    expect(stageAtomic).not.toHaveBeenCalled();
  });

  it("does not retry or mask a failed staging transaction", async () => {
    const failure = new Error("transaction rolled back");
    const stageAtomic = vi.fn(async () => { throw failure; });
    const service = new StoreKitInstallationService({
      registry: createRegistry(), gateway: { stageAtomic },
    });
    await expect(service.stage(stageRequest())).rejects.toBe(failure);
    expect(stageAtomic).toHaveBeenCalledTimes(1);
  });

  it("enforces the optimistic staging revision", async () => {
    const bad = stageResult();
    bad.installation.revision = 5;
    const { service } = serviceWith(async () => bad);
    await expect(service.stage(stageRequest()))
      .rejects.toThrow(StoreKitInstallationCommitContractError);
  });
});

describe("StoreKitInstallationActivationService", () => {
  it("crosses one trusted activation boundary with the accepted candidate", async () => {
    const activateAtomic = vi.fn(async () => activationResult());
    const gateway: StoreKitInstallationActivationGateway = { activateAtomic };
    const service = new StoreKitInstallationActivationService(gateway);
    const result = await service.activate(activation());
    expect(result.status).toBe("active");
    expect(activateAtomic).toHaveBeenCalledTimes(1);
  });

  it("rejects an artifact for another installation before persistence", async () => {
    const activateAtomic = vi.fn(async () => activationResult());
    const service = new StoreKitInstallationActivationService({ activateAtomic });
    const candidate = activation();
    candidate.artifact.installationId = "another-installation";
    await expect(service.activate(candidate)).rejects.toThrow(StoreKitInstallationPreflightError);
    expect(activateAtomic).not.toHaveBeenCalled();
  });

  it("rejects a gateway result that does not reflect one pointer increment", async () => {
    const bad = activationResult();
    bad.pointerRevision = 8;
    const service = new StoreKitInstallationActivationService({
      activateAtomic: async () => bad,
    });
    await expect(service.activate(activation()))
      .rejects.toThrow(StoreKitInstallationCommitContractError);
  });
});
