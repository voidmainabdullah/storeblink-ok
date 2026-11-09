import type { AdaptiveCommercePlan } from "./planSchema";
import type { AdaptivePlannerResult } from "./AdaptiveCommercePlanner";

export type AdaptivePlannerEvalCase = Readonly<{
  id: string;
  intent: string;
  minimumPassRate: number;
  evaluate: (result: AdaptivePlannerResult) => boolean;
}>;

export type AdaptivePlannerEvalCaseResult = Readonly<{
  id: string;
  attempts: number;
  passes: number;
  passRate: number;
  minimumPassRate: number;
  passed: boolean;
}>;

export type AdaptivePlannerEvalReport = Readonly<{
  passed: boolean;
  cases: readonly AdaptivePlannerEvalCaseResult[];
}>;

export const acceptedPlan = (
  result: AdaptivePlannerResult,
): AdaptiveCommercePlan | null => result.ok ? result.plan : null;

export const runAdaptivePlannerEvals = async (
  cases: readonly AdaptivePlannerEvalCase[],
  run: (intent: string, trial: number) => Promise<AdaptivePlannerResult>,
  trialsPerCase = 5,
): Promise<AdaptivePlannerEvalReport> => {
  if (!Number.isInteger(trialsPerCase) || trialsPerCase < 1 || trialsPerCase > 20) {
    throw new Error("Planner eval trials must be an integer from 1 through 20.");
  }
  const results: AdaptivePlannerEvalCaseResult[] = [];
  for (const testCase of cases) {
    if (!testCase.id.trim() || !testCase.intent.trim()) throw new Error("Planner eval cases require an id and intent.");
    if (testCase.minimumPassRate < 0 || testCase.minimumPassRate > 1) {
      throw new Error(`Planner eval ${testCase.id} has an invalid pass-rate threshold.`);
    }
    let passes = 0;
    for (let trial = 0; trial < trialsPerCase; trial += 1) {
      if (testCase.evaluate(await run(testCase.intent, trial))) passes += 1;
    }
    const passRate = passes / trialsPerCase;
    results.push(Object.freeze({
      id: testCase.id,
      attempts: trialsPerCase,
      passes,
      passRate,
      minimumPassRate: testCase.minimumPassRate,
      passed: passRate >= testCase.minimumPassRate,
    }));
  }
  return Object.freeze({
    passed: results.every((result) => result.passed),
    cases: Object.freeze(results),
  });
};

export const ADAPTIVE_PLANNER_GOLDEN_INTENTS = Object.freeze([
  "A calm editorial fashion store with strong photography",
  "A minimal accessories shop with no product photography yet",
  "A bold monochrome watch storefront",
  "A warm handmade home-goods shop",
  "A compact high-volume catalog with clear filtering",
  "An Arabic right-to-left boutique with long product names",
  "A German store with detailed product descriptions",
  "A one-product launch store with a focused purchase flow",
  "A 500-product collection emphasizing discovery",
  "An accessible low-motion store with restrained colors",
] as const);
