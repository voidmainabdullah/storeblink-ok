import type {
  AdaptiveCommerceRegistry,
  BlueprintSectionReference,
  CommerceBinding,
  GlobalRegionReference,
  JsonValue,
  MerchantPatch,
  ResolvedStoreKit,
  RuntimeArtifact,
  SemanticStorefrontDocument,
  StoreDefinition,
  StorefrontResourceType,
} from "@/adaptive-commerce";
import type { CompilerDiagnostic, StorefrontCompilerStage } from "./diagnostics";

export const STOREFRONT_COMPILER_VERSION = "1.0.0" as const;

export type RuntimeAsset = RuntimeArtifact["assets"][number];

export type StorefrontCompilerRegistry = Pick<
  AdaptiveCommerceRegistry,
  "getStoreKit" | "getDesignPack" | "resolveInstallable"
>;

export type StorefrontCompilerInput = Readonly<{
  registry: StorefrontCompilerRegistry;
  storeDefinition: StoreDefinition;
  merchantPatches?: readonly MerchantPatch[];
  assets?: readonly RuntimeAsset[];
  artifactId?: string;
  /** Injected by the publication job; the compiler never reads the clock. */
  createdAt: string;
}>;

export type StorefrontCompilerResult = Readonly<{
  artifact: RuntimeArtifact;
  completedStages: readonly StorefrontCompilerStage[];
}>;

export type ResolvedComponentReference = Readonly<{
  path: string;
  regionSlot?: string;
  componentId: string;
  componentVersion: string;
  variantId: string;
  properties: Readonly<Record<string, JsonValue>>;
  slots: readonly Readonly<{ slotId: string; value: JsonValue }>[];
  bindingIds: readonly string[];
  responsivePolicy: string;
  accessibility: JsonValue;
}>;

export type ResolvedRouteReferences = Readonly<{
  sections: readonly ResolvedComponentReference[];
  globalRegions: readonly ResolvedComponentReference[];
}>;

export type CompilerInputSnapshot = Readonly<{
  registry: StorefrontCompilerRegistry;
  storeDefinition: StoreDefinition;
  merchantPatches: readonly MerchantPatch[];
  assets: readonly RuntimeAsset[];
  artifactId?: string;
  createdAt: string;
}>;

export type StorefrontCompilerContext = Readonly<{
  input: CompilerInputSnapshot;
  storeDefinition?: StoreDefinition;
  effectiveDocument?: SemanticStorefrontDocument;
  resolvedStoreKit?: ResolvedStoreKit;
  resolvedTokens?: Readonly<Record<string, JsonValue>>;
  resolvedReferences?: Readonly<Record<StorefrontResourceType, ResolvedRouteReferences>>;
  routes?: RuntimeArtifact["routes"];
  globals?: RuntimeArtifact["globals"];
  componentVersions?: RuntimeArtifact["componentVersions"];
  bindingPlans?: readonly CommerceBinding[];
  assets?: readonly RuntimeAsset[];
  diagnostics: readonly CompilerDiagnostic[];
  appliedPatchIds: readonly string[];
}>;

export type AnyBlueprintReference = BlueprintSectionReference | GlobalRegionReference;
