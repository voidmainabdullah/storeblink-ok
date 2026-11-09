import type { RuntimeArtifact, StorefrontResourceType } from "@/adaptive-commerce/contracts";

export type ShadowComparableProjection = Readonly<{
  routes: RuntimeArtifact["routes"];
  globals: RuntimeArtifact["globals"];
  resolvedTokens: RuntimeArtifact["resolvedTokens"];
  componentVersions: RuntimeArtifact["componentVersions"];
  bindingPlans: RuntimeArtifact["bindingPlans"];
  assets: RuntimeArtifact["assets"];
}>;

export type LegacyShadowProjection = Readonly<{
  projection: ShadowComparableProjection | null;
  uncomparableRoutes: readonly StorefrontResourceType[];
  reason?: string;
}>;

export type StructuralDiffChange = Readonly<{
  kind: "added" | "removed" | "changed" | "reordered";
  path: string;
  beforeHash: string | null;
  afterHash: string | null;
}>;

export type StructuralArtifactDiff = Readonly<{
  status: "equal" | "different" | "uncomparable";
  legacyHash: string | null;
  adaptiveHash: string;
  uncomparableRoutes: readonly StorefrontResourceType[];
  changes: readonly StructuralDiffChange[];
  reason: string | null;
}>;

