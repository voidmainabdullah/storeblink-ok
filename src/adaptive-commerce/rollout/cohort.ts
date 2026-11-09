import {
  ROLLOUT_PERCENTAGES,
  type AdaptiveCohort,
  type RolloutPercentage,
  type TenantCohortAssignment,
} from "./types";

export const ROLLOUT_BUCKET_COUNT = 10_000;
export const DEFAULT_COHORT_KEY = "adaptive-commerce-v3";

const opaqueId = /^[A-Za-z0-9][A-Za-z0-9:_-]{0,127}$/;

export const assertOpaqueRolloutId = (value: string, label: string): string => {
  const normalized = value.trim();
  if (!opaqueId.test(normalized)) {
    throw new Error(`${label} must be an opaque identifier containing only letters, numbers, :, _, or -.`);
  }
  return normalized;
};

export const isRolloutPercentage = (value: unknown): value is RolloutPercentage =>
  ROLLOUT_PERCENTAGES.includes(value as RolloutPercentage);

/**
 * Stable FNV-1a hash. The input contract is ASCII-only so its output is stable
 * across browser, Worker, and Node runtimes.
 */
export const stableRolloutHash = (value: string): number => {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
};

export const assignTenantCohort = (
  storeId: string,
  percentage: RolloutPercentage,
  cohortKey = DEFAULT_COHORT_KEY,
): TenantCohortAssignment => {
  const normalizedStoreId = assertOpaqueRolloutId(storeId, "Store id");
  const normalizedCohortKey = assertOpaqueRolloutId(cohortKey, "Cohort key");
  if (!isRolloutPercentage(percentage)) {
    throw new Error("Rollout percentage must be one of 0, 1, 10, 50, or 100.");
  }
  const bucket = stableRolloutHash(`${normalizedCohortKey}:${normalizedStoreId}`) % ROLLOUT_BUCKET_COUNT;
  const included = bucket < percentage * 100;
  const cohort: AdaptiveCohort = included ? "v3-canary" : "legacy-control";
  return Object.freeze({
    storeId: normalizedStoreId,
    cohortKey: normalizedCohortKey,
    percentage,
    bucket,
    included,
    cohort,
  });
};
