import {
  STOREFRONT_RESOURCE_TYPES,
  semanticPath,
  semanticStorefrontDocumentSchema,
  type StoreKit,
} from "@/adaptive-commerce/contracts";
import { artifactHashFor } from "@/adaptive-commerce/compiler";
import {
  createBuiltInStoreDefinition,
  type BuiltInAdaptiveCommerceCatalog,
} from "@/adaptive-commerce/fixtures";
import type { AdaptiveCommerceRegistry } from "@/adaptive-commerce/registry";
import type { StoreKitInstallationStageGateway } from "./StoreKitInstallationService";
import { StoreKitInstallationService } from "./StoreKitInstallationService";
import type { StoreKitInstallationRevisionGateway } from "./SupabaseStoreKitInstallationGateway";
import type {
  StoreKitInstallationStageRequest,
  StoreKitInstallationStageResult,
} from "./lifecycleContracts";

export type LegacyAdaptiveMerchantProfile = Readonly<{
  storeId: string;
  storeName: string;
  storeHandle: string;
  locale: string;
  currency: string;
  businessName: string | null;
}>;

export type ReleasedStoreKitUpgradeOption = Readonly<{
  id: string;
  version: string;
  name: string;
  description: string;
  presetId: string | null;
  routeCount: 8;
}>;

export type LegacyAdaptiveStoreKitStageInput = Readonly<{
  merchant: LegacyAdaptiveMerchantProfile;
  storeKitId: string;
  idempotencyKey: string;
  requestedAt?: string;
}>;

export interface LegacyAdaptiveStoreKitUpgradeController {
  listReleasedOptions(): readonly ReleasedStoreKitUpgradeOption[];
  stage(input: LegacyAdaptiveStoreKitStageInput): Promise<StoreKitInstallationStageResult>;
}

const assertCompleteStoreKit = (storeKit: StoreKit): void => {
  const routes = Object.keys(storeKit.lockfile.blueprints);
  if (
    routes.length !== STOREFRONT_RESOURCE_TYPES.length
    || STOREFRONT_RESOURCE_TYPES.some((route) => !routes.includes(route))
  ) {
    throw new Error(
      `${storeKit.name} is not a complete eight-route StoreKit and cannot be staged.`,
    );
  }
};

const createMerchantBaseDocument = (
  storeKit: StoreKit,
  merchant: LegacyAdaptiveMerchantProfile,
) => {
  const definition = createBuiltInStoreDefinition(storeKit, merchant.storeId);
  const businessName = merchant.businessName?.trim();
  const unsigned = {
    schemaVersion: definition.base.schemaVersion,
    revisionId: `legacy-upgrade-${storeKit.id}-v1`,
    values: {
      ...definition.base.values,
      [semanticPath("global.store-name")]: merchant.storeName,
      [semanticPath("global.store-handle")]: merchant.storeHandle,
      [semanticPath("home.hero.heading")]: `Welcome to ${merchant.storeName}`,
      [semanticPath("home.hero.description")]: businessName
        ? `Discover products from ${businessName}.`
        : "Discover products selected with care.",
    },
    collections: definition.base.collections,
  };
  return semanticStorefrontDocumentSchema.parse({
    ...unsigned,
    baseHash: artifactHashFor(unsigned),
  });
};

export const createLegacyAdaptiveStoreKitStageRequest = (
  storeKit: StoreKit,
  input: LegacyAdaptiveStoreKitStageInput,
  expectedInstallationRevision: number,
): StoreKitInstallationStageRequest => {
  assertCompleteStoreKit(storeKit);
  return {
    storeId: input.merchant.storeId,
    storeKitId: storeKit.id,
    storeKitVersion: storeKit.version,
    presetId: storeKit.defaultPresetId,
    tokenOverrides: [],
    expectedInstallationRevision,
    idempotencyKey: input.idempotencyKey,
    baseDocument: createMerchantBaseDocument(storeKit, input.merchant),
    merchantPatches: [],
    commerceBindings: [],
    requestedAt: input.requestedAt ?? new Date().toISOString(),
  };
};

export type LegacyAdaptiveStoreKitUpgradeDependencies = Readonly<{
  registry: AdaptiveCommerceRegistry;
  releasedStoreKits: readonly StoreKit[];
  stageGateway: StoreKitInstallationStageGateway;
  revisionGateway: StoreKitInstallationRevisionGateway;
}>;

/**
 * Browser-authorized legacy-to-Adaptive staging coordinator. It creates only a
 * canonical staged source. Compile, shadow acceptance, activation and publish
 * APIs are deliberately absent from this surface.
 */
export class DefaultLegacyAdaptiveStoreKitUpgradeController
implements LegacyAdaptiveStoreKitUpgradeController {
  private readonly installationService: StoreKitInstallationService;
  private readonly options: readonly ReleasedStoreKitUpgradeOption[];

  constructor(private readonly dependencies: LegacyAdaptiveStoreKitUpgradeDependencies) {
    this.installationService = new StoreKitInstallationService({
      registry: dependencies.registry,
      gateway: dependencies.stageGateway,
    });
    this.options = dependencies.releasedStoreKits.map((storeKit) => {
      dependencies.registry.resolveInstallable(storeKit.id, storeKit.version);
      assertCompleteStoreKit(storeKit);
      return {
        id: storeKit.id,
        version: storeKit.version,
        name: storeKit.name,
        description: storeKit.description,
        presetId: storeKit.defaultPresetId,
        routeCount: 8,
      };
    });
  }

  listReleasedOptions(): readonly ReleasedStoreKitUpgradeOption[] {
    return this.options.map((option) => ({ ...option }));
  }

  async stage(input: LegacyAdaptiveStoreKitStageInput): Promise<StoreKitInstallationStageResult> {
    const option = this.options.find((candidate) => candidate.id === input.storeKitId);
    if (!option) throw new Error(`Released StoreKit ${input.storeKitId} is unavailable.`);
    const resolved = this.dependencies.registry.resolveInstallable(option.id, option.version);
    const expectedRevision = await this.dependencies.revisionGateway.loadCurrentRevision(
      input.merchant.storeId,
    );
    return this.installationService.stage(
      createLegacyAdaptiveStoreKitStageRequest(
        resolved.storeKit,
        input,
        expectedRevision,
      ),
    );
  }
}

export const createBuiltInLegacyAdaptiveUpgradeController = (
  catalog: BuiltInAdaptiveCommerceCatalog,
  stageGateway: StoreKitInstallationStageGateway,
  revisionGateway: StoreKitInstallationRevisionGateway,
): LegacyAdaptiveStoreKitUpgradeController =>
  new DefaultLegacyAdaptiveStoreKitUpgradeController({
    registry: catalog.registry,
    releasedStoreKits: catalog.storeKits,
    stageGateway,
    revisionGateway,
  });
