import type { VersionedPackageRef } from "@/adaptive-commerce/contracts";

export type PlannerCatalogStoreKit = Readonly<{
  storeKit: Required<VersionedPackageRef>;
  presetIds: readonly string[];
  componentVariants: Readonly<Record<string, readonly string[]>>;
}>;

export type PlannerCatalog = Readonly<{
  storeKits: readonly PlannerCatalogStoreKit[];
}>;

export type AdaptivePlanRejection = Readonly<{
  code: string;
  path: string | null;
  message: string;
}>;

export type AdaptivePlannerRequest = Readonly<{
  intent: string;
  catalog: PlannerCatalog;
  attempt: number;
  priorRejections: readonly AdaptivePlanRejection[];
}>;

export interface AdaptivePlannerProvider {
  generate(request: AdaptivePlannerRequest): Promise<unknown>;
}

export type AdaptivePlanValidation = Readonly<{
  valid: boolean;
  rejections: readonly AdaptivePlanRejection[];
}>;

export type AdaptivePlanAttempt = Readonly<{
  attempt: number;
  candidate: unknown;
  rejections: readonly AdaptivePlanRejection[];
}>;

export type AdaptivePlanAudit = Readonly<{
  schemaVersion: 1;
  intentHash: string;
  outcome: "accepted" | "exhausted";
  attempts: readonly AdaptivePlanAttempt[];
}>;
