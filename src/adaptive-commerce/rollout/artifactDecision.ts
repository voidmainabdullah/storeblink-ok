import { z } from "zod";
import { assignTenantCohort, assertOpaqueRolloutId, DEFAULT_COHORT_KEY } from "./cohort";
import {
  ROLLOUT_PERCENTAGES,
  type AdaptiveArtifactDecision,
  type AdaptiveRolloutConfig,
} from "./types";

const rolloutConfigSchema = z.object({
  percentage: z.union(ROLLOUT_PERCENTAGES.map((value) => z.literal(value)) as [
    z.ZodLiteral<0>,
    z.ZodLiteral<1>,
    z.ZodLiteral<10>,
    z.ZodLiteral<50>,
    z.ZodLiteral<100>,
  ]),
  cohortKey: z.string().trim().min(1).max(128).optional(),
}).strict();

export const parseAdaptiveRolloutConfig = (value: unknown): AdaptiveRolloutConfig | null => {
  const parsed = rolloutConfigSchema.safeParse(value);
  if (!parsed.success) return null;
  try {
    if (parsed.data.cohortKey) {
      assertOpaqueRolloutId(parsed.data.cohortKey, "Cohort key");
    }
    return Object.freeze({
      percentage: parsed.data.percentage as AdaptiveRolloutConfig["percentage"],
      ...(parsed.data.cohortKey ? { cohortKey: parsed.data.cohortKey } : {}),
    });
  } catch {
    return null;
  }
};

export const decideAdaptiveArtifact = (input: {
  storeId: string;
  config?: unknown;
  /** Independent emergency control. It is evaluated before rollout config. */
  killSwitch?: boolean;
}): AdaptiveArtifactDecision => {
  assertOpaqueRolloutId(input.storeId, "Store id");
  if (input.killSwitch === true) {
    return Object.freeze({
      artifact: "legacy",
      cohort: "legacy-control",
      reason: "kill-switch",
      assignment: null,
    });
  }
  if (input.config === undefined || input.config === null) {
    return Object.freeze({
      artifact: "legacy",
      cohort: "legacy-control",
      reason: "missing-config",
      assignment: null,
    });
  }
  const config = parseAdaptiveRolloutConfig(input.config);
  if (!config) {
    return Object.freeze({
      artifact: "legacy",
      cohort: "legacy-control",
      reason: "invalid-config",
      assignment: null,
    });
  }
  const assignment = assignTenantCohort(
    input.storeId,
    config.percentage,
    config.cohortKey ?? DEFAULT_COHORT_KEY,
  );
  return Object.freeze({
    artifact: assignment.included ? "v3" : "legacy",
    cohort: assignment.cohort,
    reason: assignment.included ? "inside-cohort" : "outside-cohort",
    assignment,
  });
};
