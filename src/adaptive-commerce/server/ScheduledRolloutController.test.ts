import { describe, expect, it, vi } from "vitest";
import type { RumMetric, RumSample } from "../rollout";
import {
  ScheduledRolloutBatchController,
  ScheduledRolloutController,
  type ScheduledRolloutBatchGateway,
} from "./ScheduledRolloutController";

const metrics: RumMetric[] = ["LCP", "CLS", "INP", "render-error"];
const criticalValues: Record<RumMetric, number> = {
  LCP: 5_000,
  CLS: 0.5,
  INP: 700,
  "render-error": 1,
};
const sample = (metric: RumMetric): RumSample => ({
  schemaVersion: 1,
  storeId: "store-1",
  cohort: "v3-canary",
  artifact: "v3",
  publicationId: "publication-1",
  metric,
  value: criticalValues[metric],
  observedAt: "2030-01-02T03:00:00.000Z",
  context: {},
});

const createGateway = (killSwitch = false): ScheduledRolloutBatchGateway & {
  commitEvaluation: ReturnType<typeof vi.fn>;
} => ({
  listEligibleStoreIds: vi.fn(async () => ["store-1"]),
  loadEvaluationInput: vi.fn(async () => ({
    rolloutId: "rollout-1",
    publicationId: "publication-1",
    currentPercentage: 50 as const,
    revision: 7,
    killSwitch,
    state: {
      consecutiveHealthyWindows: 0,
      consecutiveWarningWindows: 0,
      consecutiveCriticalWindows: 0,
    },
    config: {
      minimumSamplesPerMetric: 1,
      criticalWindowsForRollback: 1,
      warningWindowsForPause: 1,
      healthyWindowsForWiden: 1,
      cooldownMs: 0,
    },
    samples: metrics.map(sample),
  })),
  commitEvaluation: vi.fn(async ({ evaluation }) => ({
    recommendation: evaluation.recommendation,
    percentage: evaluation.recommendedPercentage,
    status: evaluation.recommendation === "rollback" ? "rolled_back" : "paused",
    revision: 8,
  })),
});

describe("ScheduledRolloutController", () => {
  it("commits a critical policy rollback through exactly one atomic gateway call", async () => {
    const gateway = createGateway();
    const result = await new ScheduledRolloutController(gateway).run(
      "store-1",
      "2030-01-02T03:04:05.000Z",
    );
    expect(result.evaluation).toMatchObject({
      health: "critical",
      recommendation: "rollback",
      recommendedPercentage: 10,
      nextState: { lastRolloutChangeAt: "2030-01-02T03:04:05.000Z" },
    });
    expect(gateway.commitEvaluation).toHaveBeenCalledTimes(1);
    expect(gateway.commitEvaluation).toHaveBeenCalledWith(expect.objectContaining({ expectedRevision: 7 }));
  });

  it("lets the kill switch override the evaluator recommendation and force legacy rollback", async () => {
    const gateway = createGateway(true);
    const result = await new ScheduledRolloutController(gateway).run(
      "store-1",
      "2030-01-02T03:04:05.000Z",
    );
    expect(result.evaluation).toMatchObject({
      recommendation: "rollback",
      recommendedPercentage: 0,
      reason: "kill-switch",
    });
    expect(gateway.commitEvaluation).toHaveBeenCalledWith(expect.objectContaining({
      evaluation: expect.objectContaining({ reason: "kill-switch" }),
    }));
  });

  it("enumerates a bounded scheduled batch without one tenant failure hiding another", async () => {
    const gateway = createGateway();
    vi.mocked(gateway.listEligibleStoreIds).mockResolvedValue(["store-fails", "store-1"]);
    vi.mocked(gateway.loadEvaluationInput).mockImplementation(async (storeId) => {
      if (storeId === "store-fails") throw new Error("RUM unavailable");
      return createGateway().loadEvaluationInput(storeId, 15);
    });
    const result = await new ScheduledRolloutBatchController(gateway, 15, 2).run(
      "2030-01-02T03:04:05.000Z",
    );
    expect(result).toMatchObject({ evaluated: 2 });
    expect(result.succeeded).toHaveLength(1);
    expect(result.failed).toEqual([{ storeId: "store-fails", message: "RUM unavailable" }]);
  });
});
