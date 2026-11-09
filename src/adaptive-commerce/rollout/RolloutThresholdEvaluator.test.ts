import { describe, expect, it } from "vitest";
import {
  AdaptiveRolloutThresholdEvaluator,
  createRolloutEvaluatorConfig,
  parseRumSample,
  type RolloutEvaluatorState,
  type RumMetric,
  type RumSample,
} from "./index";

const publicationId = "publication-1";
const observedAt = "2026-08-21T10:00:00.000Z";

const sample = (
  metric: RumMetric,
  value: number,
  index: number,
  overrides: Partial<{
    publicationId: string;
    artifact: "legacy" | "v3";
    cohort: "legacy-control" | "v3-canary";
  }> = {},
): RumSample => parseRumSample({
  storeId: `store-${index}`,
  cohort: overrides.cohort ?? "v3-canary",
  artifact: overrides.artifact ?? "v3",
  publicationId: overrides.publicationId ?? publicationId,
  metric,
  value,
  observedAt,
});

const samples = (values: Partial<Record<RumMetric, number>> = {}, count = 2): RumSample[] =>
  Array.from({ length: count }, (_, index) => [
    sample("LCP", values.LCP ?? 2_000, index),
    sample("CLS", values.CLS ?? 0.05, index),
    sample("INP", values.INP ?? 150, index),
    sample("render-error", values["render-error"] ?? 0, index),
  ]).flat();

const evaluator = () => new AdaptiveRolloutThresholdEvaluator({
  minimumSamplesPerMetric: 2,
  cooldownMs: 60_000,
  healthyWindowsForWiden: 2,
  warningWindowsForPause: 2,
  criticalWindowsForRollback: 2,
});

const evaluate = (
  runtime: AdaptiveRolloutThresholdEvaluator,
  input: Partial<{
    values: Partial<Record<RumMetric, number>>;
    state: RolloutEvaluatorState;
    percentage: 0 | 1 | 10 | 50 | 100;
    evaluatedAt: string;
    samples: RumSample[];
  }> = {},
) => runtime.evaluate({
  rolloutId: "rollout-1",
  publicationId,
  currentPercentage: input.percentage ?? 10,
  samples: input.samples ?? samples(input.values),
  state: input.state,
  evaluatedAt: input.evaluatedAt ?? observedAt,
});

describe("adaptive rollout threshold evaluator", () => {
  it("holds when any required metric is below the minimum sample size", () => {
    const result = evaluate(evaluator(), { samples: samples({}, 1) });
    expect(result).toMatchObject({
      health: "insufficient",
      recommendation: "hold",
      recommendedPercentage: 10,
      reason: "insufficient-samples",
    });
    expect(result.nextState).toMatchObject({
      consecutiveHealthyWindows: 0,
      consecutiveWarningWindows: 0,
      consecutiveCriticalWindows: 0,
    });
  });

  it("widens only after consecutive healthy windows", () => {
    const runtime = evaluator();
    const first = evaluate(runtime);
    expect(first).toMatchObject({ recommendation: "hold", reason: "healthy-hysteresis" });
    const second = evaluate(runtime, { state: first.nextState });
    expect(second).toMatchObject({
      health: "healthy",
      recommendation: "widen",
      recommendedPercentage: 50,
      reason: "healthy-widen",
    });
  });

  it("does not widen at 100 percent or during a post-change cooldown", () => {
    const healthyState: RolloutEvaluatorState = {
      consecutiveHealthyWindows: 1,
      consecutiveWarningWindows: 0,
      consecutiveCriticalWindows: 0,
    };
    expect(evaluate(evaluator(), { percentage: 100, state: healthyState })).toMatchObject({
      recommendation: "hold",
      reason: "fully-rolled-out",
    });
    expect(evaluate(evaluator(), {
      state: { ...healthyState, lastRolloutChangeAt: "2026-08-21T09:59:30.000Z" },
    })).toMatchObject({
      recommendation: "hold",
      reason: "rollout-cooldown",
      audit: { cooldownActive: true },
    });
  });

  it("pauses after warning hysteresis and resets unrelated streaks", () => {
    const runtime = evaluator();
    const first = evaluate(runtime, { values: { LCP: 3_000 } });
    expect(first).toMatchObject({ health: "warning", recommendation: "hold", reason: "warning-hysteresis" });
    const second = evaluate(runtime, { values: { LCP: 3_000 }, state: first.nextState });
    expect(second).toMatchObject({ health: "warning", recommendation: "pause", reason: "threshold-warning" });
    expect(second.nextState).toMatchObject({
      consecutiveHealthyWindows: 0,
      consecutiveWarningWindows: 2,
      consecutiveCriticalWindows: 0,
    });
  });

  it("pauses on the first critical window and rolls back after critical hysteresis", () => {
    const runtime = evaluator();
    const first = evaluate(runtime, { values: { INP: 700 } });
    expect(first).toMatchObject({
      health: "critical",
      recommendation: "pause",
      reason: "critical-hysteresis-pause",
    });
    const second = evaluate(runtime, { values: { INP: 700 }, state: first.nextState, percentage: 50 });
    expect(second).toMatchObject({
      health: "critical",
      recommendation: "rollback",
      recommendedPercentage: 10,
      reason: "threshold-critical-rollback",
    });
  });

  it("does not let cooldown suppress a safety rollback", () => {
    const result = evaluate(evaluator(), {
      values: { "render-error": 1 },
      percentage: 10,
      state: {
        consecutiveHealthyWindows: 0,
        consecutiveWarningWindows: 0,
        consecutiveCriticalWindows: 1,
        lastRolloutChangeAt: "2026-08-21T09:59:30.000Z",
      },
    });
    expect(result).toMatchObject({
      recommendation: "rollback",
      recommendedPercentage: 1,
      audit: { cooldownActive: true },
    });
  });

  it("uses p75 for web vitals, a rate for render errors, and ignores other artifacts/publications", () => {
    const matching = [
      ...[1_000, 2_000, 3_000, 5_000].map((value, index) => sample("LCP", value, index)),
      ...[0.01, 0.02, 0.03, 0.04].map((value, index) => sample("CLS", value, index)),
      ...[100, 120, 140, 160].map((value, index) => sample("INP", value, index)),
      ...[0, 0, 0, 1].map((value, index) => sample("render-error", value, index)),
    ];
    const ignored = [
      sample("LCP", 100_000, 50, { publicationId: "publication-old" }),
      sample("LCP", 100_000, 51, { artifact: "legacy", cohort: "legacy-control" }),
    ];
    const result = evaluate(new AdaptiveRolloutThresholdEvaluator({
      minimumSamplesPerMetric: 4,
      healthyWindowsForWiden: 1,
    }), { samples: [...matching, ...ignored] });
    expect(result.metricSummaries.LCP).toMatchObject({ statistic: "p75", value: 3_000, count: 4 });
    expect(result.metricSummaries["render-error"]).toMatchObject({ statistic: "rate", value: 0.25, count: 4 });
    expect(result.audit).toMatchObject({ matchingSampleCount: 16, uniqueStoreCount: 4 });
  });

  it("produces a deterministic, self-contained audit record", () => {
    const runtime = evaluator();
    const first = evaluate(runtime);
    const second = evaluate(runtime);
    expect(first.audit).toEqual(second.audit);
    expect(first.audit).toMatchObject({
      schemaVersion: 1,
      rolloutId: "rollout-1",
      publicationId,
      currentPercentage: 10,
      recommendation: "hold",
      health: "healthy",
    });
  });

  it("rejects incoherent evaluator configuration and rollout percentages", () => {
    expect(() => createRolloutEvaluatorConfig({ minimumSamplesPerMetric: 0 })).toThrow(/positive integer/);
    expect(() => createRolloutEvaluatorConfig({
      thresholds: { LCP: { pauseAbove: 4_000, rollbackAbove: 3_000 } },
    })).toThrow(/greater than/);
    expect(() => evaluator().evaluate({
      rolloutId: "rollout-1",
      publicationId,
      currentPercentage: 25 as never,
      samples: [],
    })).toThrow(/0, 1, 10, 50, or 100/);
  });
});
