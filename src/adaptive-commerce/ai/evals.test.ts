import { runAdaptivePlannerEvals } from "./evals";
import type { AdaptivePlannerResult } from "./AdaptiveCommercePlanner";

const accepted = {
  ok: true,
  plan: {},
  audit: {},
} as unknown as AdaptivePlannerResult;
const rejected = {
  ok: false,
  rejections: [],
  audit: {},
} as unknown as AdaptivePlannerResult;

describe("Adaptive planner eval suite", () => {
  it("enforces per-intent pass-rate thresholds over bounded trials", async () => {
    const report = await runAdaptivePlannerEvals([{
      id: "bounded-nondeterminism",
      intent: "Build a certified editorial store",
      minimumPassRate: 0.8,
      evaluate: (result) => result.ok,
    }], async (_intent, trial) => trial < 4 ? accepted : rejected, 5);
    expect(report.passed).toBe(true);
    expect(report.cases[0]).toMatchObject({ passes: 4, passRate: 0.8, passed: true });
  });

  it("fails the release report when any golden intent misses its threshold", async () => {
    const report = await runAdaptivePlannerEvals([
      { id: "healthy", intent: "A", minimumPassRate: 0.5, evaluate: (result) => result.ok },
      { id: "unsafe", intent: "B", minimumPassRate: 1, evaluate: (result) => result.ok },
    ], async (intent) => intent === "A" ? accepted : rejected, 2);
    expect(report.passed).toBe(false);
    expect(report.cases[1].passed).toBe(false);
  });

  it("rejects unbounded or malformed eval configuration", async () => {
    await expect(runAdaptivePlannerEvals([], async () => accepted, 21)).rejects.toThrow("1 through 20");
    await expect(runAdaptivePlannerEvals([{
      id: "bad",
      intent: "test",
      minimumPassRate: 1.2,
      evaluate: () => true,
    }], async () => accepted)).rejects.toThrow("invalid pass-rate");
  });
});
