import {
  assertOpaqueRolloutId,
  isRolloutPercentage,
  stableRolloutHash,
} from "./cohort";
import {
  RUM_METRICS,
  type RolloutAuditRecord,
  type RolloutEvaluation,
  type RolloutEvaluatorConfig,
  type RolloutEvaluatorConfigInput,
  type RolloutEvaluatorState,
  type RolloutHealth,
  type RolloutMetricSummary,
  type RolloutPercentage,
  type RolloutRecommendation,
  type RumMetric,
  type RumSample,
} from "./types";

export const DEFAULT_ROLLOUT_EVALUATOR_CONFIG: RolloutEvaluatorConfig = Object.freeze({
  minimumSamplesPerMetric: 50,
  cooldownMs: 30 * 60 * 1_000,
  healthyWindowsForWiden: 3,
  warningWindowsForPause: 2,
  criticalWindowsForRollback: 2,
  thresholds: Object.freeze({
    LCP: Object.freeze({ pauseAbove: 2_500, rollbackAbove: 4_000 }),
    CLS: Object.freeze({ pauseAbove: 0.1, rollbackAbove: 0.25 }),
    INP: Object.freeze({ pauseAbove: 200, rollbackAbove: 500 }),
    "render-error": Object.freeze({ pauseAbove: 0.01, rollbackAbove: 0.05 }),
  }),
});

const positiveInteger = (value: number, label: string): number => {
  if (!Number.isInteger(value) || value < 1) throw new Error(`${label} must be a positive integer.`);
  return value;
};

const nonNegativeFinite = (value: number, label: string): number => {
  if (!Number.isFinite(value) || value < 0) throw new Error(`${label} must be a non-negative number.`);
  return value;
};

export const createRolloutEvaluatorConfig = (
  input: RolloutEvaluatorConfigInput = {},
): RolloutEvaluatorConfig => {
  const thresholds = Object.fromEntries(
    RUM_METRICS.map((metric) => {
      const defaults = DEFAULT_ROLLOUT_EVALUATOR_CONFIG.thresholds[metric];
      const override = input.thresholds?.[metric];
      const pauseAbove = nonNegativeFinite(
        override?.pauseAbove ?? defaults.pauseAbove,
        `${metric} pause threshold`,
      );
      const rollbackAbove = nonNegativeFinite(
        override?.rollbackAbove ?? defaults.rollbackAbove,
        `${metric} rollback threshold`,
      );
      if (rollbackAbove <= pauseAbove) {
        throw new Error(`${metric} rollback threshold must be greater than its pause threshold.`);
      }
      return [metric, Object.freeze({ pauseAbove, rollbackAbove })];
    }),
  ) as Record<RumMetric, { pauseAbove: number; rollbackAbove: number }>;

  return Object.freeze({
    minimumSamplesPerMetric: positiveInteger(
      input.minimumSamplesPerMetric ?? DEFAULT_ROLLOUT_EVALUATOR_CONFIG.minimumSamplesPerMetric,
      "Minimum samples per metric",
    ),
    cooldownMs: nonNegativeFinite(
      input.cooldownMs ?? DEFAULT_ROLLOUT_EVALUATOR_CONFIG.cooldownMs,
      "Cooldown",
    ),
    healthyWindowsForWiden: positiveInteger(
      input.healthyWindowsForWiden ?? DEFAULT_ROLLOUT_EVALUATOR_CONFIG.healthyWindowsForWiden,
      "Healthy-window hysteresis",
    ),
    warningWindowsForPause: positiveInteger(
      input.warningWindowsForPause ?? DEFAULT_ROLLOUT_EVALUATOR_CONFIG.warningWindowsForPause,
      "Warning-window hysteresis",
    ),
    criticalWindowsForRollback: positiveInteger(
      input.criticalWindowsForRollback ?? DEFAULT_ROLLOUT_EVALUATOR_CONFIG.criticalWindowsForRollback,
      "Critical-window hysteresis",
    ),
    thresholds: Object.freeze(thresholds),
  });
};

const EMPTY_STATE: RolloutEvaluatorState = Object.freeze({
  consecutiveHealthyWindows: 0,
  consecutiveWarningWindows: 0,
  consecutiveCriticalWindows: 0,
});

const normalizeDate = (value: string, label: string): { iso: string; timestamp: number } => {
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) throw new Error(`${label} must be an ISO date.`);
  return { iso: new Date(timestamp).toISOString(), timestamp };
};

const normalizeState = (state?: RolloutEvaluatorState): RolloutEvaluatorState => {
  if (!state) return EMPTY_STATE;
  const result: RolloutEvaluatorState = {
    consecutiveHealthyWindows: Math.max(0, Math.floor(state.consecutiveHealthyWindows)),
    consecutiveWarningWindows: Math.max(0, Math.floor(state.consecutiveWarningWindows)),
    consecutiveCriticalWindows: Math.max(0, Math.floor(state.consecutiveCriticalWindows)),
    ...(state.lastRolloutChangeAt
      ? { lastRolloutChangeAt: normalizeDate(state.lastRolloutChangeAt, "Last rollout change").iso }
      : {}),
  };
  return Object.freeze(result);
};

const nextPercentage = (percentage: RolloutPercentage): RolloutPercentage => ({
  0: 1,
  1: 10,
  10: 50,
  50: 100,
  100: 100,
})[percentage] as RolloutPercentage;

const previousPercentage = (percentage: RolloutPercentage): RolloutPercentage => ({
  0: 0,
  1: 0,
  10: 1,
  50: 10,
  100: 50,
})[percentage] as RolloutPercentage;

const percentile75 = (values: readonly number[]): number => {
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.max(0, Math.ceil(sorted.length * 0.75) - 1)] ?? 0;
};

const metricHealth = (
  value: number,
  pauseAbove: number,
  rollbackAbove: number,
): Exclude<RolloutHealth, "insufficient"> => {
  if (value > rollbackAbove) return "critical";
  if (value > pauseAbove) return "warning";
  return "healthy";
};

const overallHealth = (
  summaries: Readonly<Record<RumMetric, RolloutMetricSummary>>,
): RolloutHealth => {
  const values = Object.values(summaries);
  if (values.some((summary) => summary.health === "insufficient")) return "insufficient";
  if (values.some((summary) => summary.health === "critical")) return "critical";
  if (values.some((summary) => summary.health === "warning")) return "warning";
  return "healthy";
};

const advanceState = (
  previous: RolloutEvaluatorState,
  health: RolloutHealth,
): RolloutEvaluatorState => Object.freeze({
  consecutiveHealthyWindows:
    health === "healthy" ? previous.consecutiveHealthyWindows + 1 : 0,
  consecutiveWarningWindows:
    health === "warning" ? previous.consecutiveWarningWindows + 1 : 0,
  consecutiveCriticalWindows:
    health === "critical" ? previous.consecutiveCriticalWindows + 1 : 0,
  ...(previous.lastRolloutChangeAt
    ? { lastRolloutChangeAt: previous.lastRolloutChangeAt }
    : {}),
});

const auditId = (parts: readonly string[]): string =>
  `rollout-${stableRolloutHash(parts.join(":" )).toString(16).padStart(8, "0")}`;

export type RolloutEvaluationInput = Readonly<{
  rolloutId: string;
  publicationId: string;
  currentPercentage: RolloutPercentage;
  samples: readonly RumSample[];
  state?: RolloutEvaluatorState;
  evaluatedAt?: string;
}>;

export class AdaptiveRolloutThresholdEvaluator {
  readonly config: RolloutEvaluatorConfig;

  constructor(config: RolloutEvaluatorConfigInput = {}) {
    this.config = createRolloutEvaluatorConfig(config);
  }

  evaluate(input: RolloutEvaluationInput): RolloutEvaluation {
    const rolloutId = assertOpaqueRolloutId(input.rolloutId, "Rollout id");
    const publicationId = assertOpaqueRolloutId(input.publicationId, "Publication id");
    if (!isRolloutPercentage(input.currentPercentage)) {
      throw new Error("Current rollout percentage must be one of 0, 1, 10, 50, or 100.");
    }
    const evaluated = normalizeDate(input.evaluatedAt ?? new Date().toISOString(), "Evaluation time");
    const previousState = normalizeState(input.state);
    const matching = input.samples.filter((sample) =>
      sample.artifact === "v3" &&
      sample.cohort === "v3-canary" &&
      sample.publicationId === publicationId,
    );
    const grouped = Object.fromEntries(
      RUM_METRICS.map((metric) => [
        metric,
        matching.filter((sample) => sample.metric === metric).map((sample) => sample.value),
      ]),
    ) as Record<RumMetric, number[]>;
    const metricSummaries = Object.freeze(Object.fromEntries(
      RUM_METRICS.map((metric) => {
        const values = grouped[metric];
        const threshold = this.config.thresholds[metric];
        const value = values.length
          ? metric === "render-error"
            ? values.reduce((sum, entry) => sum + entry, 0) / values.length
            : percentile75(values)
          : null;
        const health: RolloutHealth = values.length < this.config.minimumSamplesPerMetric || value === null
          ? "insufficient"
          : metricHealth(value, threshold.pauseAbove, threshold.rollbackAbove);
        return [metric, Object.freeze({
          metric,
          count: values.length,
          statistic: metric === "render-error" ? "rate" as const : "p75" as const,
          value,
          health,
          pauseAbove: threshold.pauseAbove,
          rollbackAbove: threshold.rollbackAbove,
        })];
      }),
    )) as Readonly<Record<RumMetric, RolloutMetricSummary>>;

    const health = overallHealth(metricSummaries);
    const nextState = advanceState(previousState, health);
    const lastChange = previousState.lastRolloutChangeAt
      ? normalizeDate(previousState.lastRolloutChangeAt, "Last rollout change").timestamp
      : null;
    const cooldownActive = lastChange !== null &&
      evaluated.timestamp >= lastChange &&
      evaluated.timestamp - lastChange < this.config.cooldownMs;

    let recommendation: RolloutRecommendation = "hold";
    let recommendedPercentage = input.currentPercentage;
    let reason = "insufficient-samples";
    if (health === "healthy") {
      if (nextState.consecutiveHealthyWindows < this.config.healthyWindowsForWiden) {
        reason = "healthy-hysteresis";
      } else if (input.currentPercentage === 100) {
        reason = "fully-rolled-out";
      } else if (cooldownActive) {
        reason = "rollout-cooldown";
      } else {
        recommendation = "widen";
        recommendedPercentage = nextPercentage(input.currentPercentage);
        reason = "healthy-widen";
      }
    } else if (health === "warning") {
      if (nextState.consecutiveWarningWindows < this.config.warningWindowsForPause) {
        reason = "warning-hysteresis";
      } else {
        recommendation = "pause";
        reason = "threshold-warning";
      }
    } else if (health === "critical") {
      if (
        nextState.consecutiveCriticalWindows >= this.config.criticalWindowsForRollback &&
        input.currentPercentage > 0
      ) {
        recommendation = "rollback";
        recommendedPercentage = previousPercentage(input.currentPercentage);
        reason = "threshold-critical-rollback";
      } else {
        recommendation = "pause";
        reason = input.currentPercentage === 0
          ? "critical-at-zero"
          : "critical-hysteresis-pause";
      }
    }

    const uniqueStoreCount = new Set(matching.map((sample) => sample.storeId)).size;
    const audit: RolloutAuditRecord = Object.freeze({
      schemaVersion: 1,
      id: auditId([
        rolloutId,
        publicationId,
        evaluated.iso,
        String(input.currentPercentage),
        health,
        recommendation,
      ]),
      rolloutId,
      publicationId,
      evaluatedAt: evaluated.iso,
      currentPercentage: input.currentPercentage,
      recommendedPercentage,
      recommendation,
      health,
      reason,
      cooldownActive,
      matchingSampleCount: matching.length,
      uniqueStoreCount,
      metricSummaries,
      previousState,
      nextState,
    });
    return Object.freeze({
      recommendation,
      recommendedPercentage,
      health,
      reason,
      metricSummaries,
      nextState,
      audit,
    });
  }
}

export const evaluateAdaptiveRollout = (
  input: RolloutEvaluationInput,
  config: RolloutEvaluatorConfigInput = {},
): RolloutEvaluation => new AdaptiveRolloutThresholdEvaluator(config).evaluate(input);
