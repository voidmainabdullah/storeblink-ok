export const ROLLOUT_PERCENTAGES = [0, 1, 10, 50, 100] as const;

export type RolloutPercentage = (typeof ROLLOUT_PERCENTAGES)[number];
export type AdaptiveArtifact = "legacy" | "v3";
export type AdaptiveCohort = "legacy-control" | "v3-canary";

export type TenantCohortAssignment = Readonly<{
  storeId: string;
  cohortKey: string;
  percentage: RolloutPercentage;
  bucket: number;
  included: boolean;
  cohort: AdaptiveCohort;
}>;

export type AdaptiveRolloutConfig = Readonly<{
  percentage: RolloutPercentage;
  cohortKey?: string;
}>;

export type ArtifactDecisionReason =
  | "kill-switch"
  | "missing-config"
  | "invalid-config"
  | "inside-cohort"
  | "outside-cohort";

export type AdaptiveArtifactDecision = Readonly<{
  artifact: AdaptiveArtifact;
  cohort: AdaptiveCohort;
  reason: ArtifactDecisionReason;
  assignment: TenantCohortAssignment | null;
}>;

export const RUM_METRICS = ["LCP", "CLS", "INP", "render-error"] as const;
export type RumMetric = (typeof RUM_METRICS)[number];

export type SafeRumContextValue = string | number | boolean | null;
export type SafeRumContext = Readonly<Record<string, SafeRumContextValue>>;

export type RumSample = Readonly<{
  schemaVersion: 1;
  storeId: string;
  cohort: AdaptiveCohort;
  artifact: AdaptiveArtifact;
  publicationId: string;
  metric: RumMetric;
  value: number;
  observedAt: string;
  context: SafeRumContext;
}>;

export type RumValidationResult =
  | { ok: true; sample: RumSample }
  | { ok: false; issues: readonly string[] };

export type RolloutMetricThreshold = Readonly<{
  pauseAbove: number;
  rollbackAbove: number;
}>;

export type RolloutEvaluatorConfig = Readonly<{
  minimumSamplesPerMetric: number;
  cooldownMs: number;
  healthyWindowsForWiden: number;
  warningWindowsForPause: number;
  criticalWindowsForRollback: number;
  thresholds: Readonly<Record<RumMetric, RolloutMetricThreshold>>;
}>;

export type RolloutEvaluatorConfigInput = Partial<
  Omit<RolloutEvaluatorConfig, "thresholds">
> & {
  thresholds?: Partial<Record<RumMetric, Partial<RolloutMetricThreshold>>>;
};

export type RolloutHealth = "insufficient" | "healthy" | "warning" | "critical";
export type RolloutRecommendation = "hold" | "pause" | "widen" | "rollback";

export type RolloutEvaluatorState = Readonly<{
  consecutiveHealthyWindows: number;
  consecutiveWarningWindows: number;
  consecutiveCriticalWindows: number;
  /** Set by the rollout controller only after it actually changes the rollout. */
  lastRolloutChangeAt?: string;
}>;

export type RolloutMetricSummary = Readonly<{
  metric: RumMetric;
  count: number;
  statistic: "p75" | "rate";
  value: number | null;
  health: RolloutHealth;
  pauseAbove: number;
  rollbackAbove: number;
}>;

export type RolloutAuditRecord = Readonly<{
  schemaVersion: 1;
  id: string;
  rolloutId: string;
  publicationId: string;
  evaluatedAt: string;
  currentPercentage: RolloutPercentage;
  recommendedPercentage: RolloutPercentage;
  recommendation: RolloutRecommendation;
  health: RolloutHealth;
  reason: string;
  cooldownActive: boolean;
  matchingSampleCount: number;
  uniqueStoreCount: number;
  metricSummaries: Readonly<Record<RumMetric, RolloutMetricSummary>>;
  previousState: RolloutEvaluatorState;
  nextState: RolloutEvaluatorState;
}>;

export type RolloutEvaluation = Readonly<{
  recommendation: RolloutRecommendation;
  recommendedPercentage: RolloutPercentage;
  health: RolloutHealth;
  reason: string;
  metricSummaries: Readonly<Record<RumMetric, RolloutMetricSummary>>;
  nextState: RolloutEvaluatorState;
  audit: RolloutAuditRecord;
}>;
