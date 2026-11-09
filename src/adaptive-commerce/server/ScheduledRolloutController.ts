import {
  AdaptiveRolloutThresholdEvaluator,
  type RolloutEvaluation,
  type RolloutEvaluatorConfigInput,
  type RolloutEvaluatorState,
  type RolloutPercentage,
  type RumSample,
} from "../rollout";

export type RolloutControllerSnapshot = Readonly<{
  rolloutId: string;
  publicationId: string;
  currentPercentage: RolloutPercentage;
  revision: number;
  killSwitch: boolean;
  state: RolloutEvaluatorState;
  config: RolloutEvaluatorConfigInput;
  samples: readonly RumSample[];
}>;

export type RolloutCommitResult = Readonly<{
  recommendation: string;
  percentage: RolloutPercentage;
  status: string;
  revision: number;
}>;

export interface RolloutControllerGateway {
  loadEvaluationInput(storeId: string, windowMinutes: number): Promise<RolloutControllerSnapshot>;
  commitEvaluation(input: Readonly<{
    storeId: string;
    expectedRevision: number;
    evaluation: RolloutEvaluation;
  }>): Promise<RolloutCommitResult>;
}

export interface ScheduledRolloutBatchGateway extends RolloutControllerGateway {
  listEligibleStoreIds(limit: number): Promise<readonly string[]>;
}

export type ScheduledRolloutControllerResult = Readonly<{
  evaluation: RolloutEvaluation;
  committed: RolloutCommitResult;
}>;

const withCommittedChangeTime = (
  evaluation: RolloutEvaluation,
  evaluatedAt: string,
): RolloutEvaluation => {
  if (evaluation.recommendation === "hold") return evaluation;
  const nextState = Object.freeze({
    ...evaluation.nextState,
    lastRolloutChangeAt: evaluatedAt,
  });
  return Object.freeze({
    ...evaluation,
    nextState,
    audit: Object.freeze({ ...evaluation.audit, nextState }),
  });
};

const forceKillSwitch = (
  evaluation: RolloutEvaluation,
  evaluatedAt: string,
): RolloutEvaluation => {
  const nextState = Object.freeze({
    ...evaluation.nextState,
    lastRolloutChangeAt: evaluatedAt,
  });
  return Object.freeze({
    ...evaluation,
    recommendation: "rollback" as const,
    recommendedPercentage: 0 as const,
    reason: "kill-switch",
    nextState,
    audit: Object.freeze({
      ...evaluation.audit,
      recommendation: "rollback" as const,
      recommendedPercentage: 0 as const,
      reason: "kill-switch",
      nextState,
    }),
  });
};

/**
 * Trusted scheduled controller. It evaluates tagged server-side RUM and passes
 * one decision to the atomic commit RPC; it never rewrites a publication.
 */
export class ScheduledRolloutController {
  constructor(
    private readonly gateway: RolloutControllerGateway,
    private readonly windowMinutes = 15,
  ) {
    if (!Number.isInteger(windowMinutes) || windowMinutes < 1 || windowMinutes > 1_440) {
      throw new Error("Rollout evaluation window must be between 1 and 1440 minutes.");
    }
  }

  async run(storeId: string, evaluatedAt = new Date().toISOString()): Promise<ScheduledRolloutControllerResult> {
    const snapshot = await this.gateway.loadEvaluationInput(storeId, this.windowMinutes);
    const evaluator = new AdaptiveRolloutThresholdEvaluator(snapshot.config);
    const evaluated = evaluator.evaluate({
      rolloutId: snapshot.rolloutId,
      publicationId: snapshot.publicationId,
      currentPercentage: snapshot.currentPercentage,
      samples: snapshot.samples,
      state: snapshot.state,
      evaluatedAt,
    });
    // The database repeats this precedence while holding the rollout row lock.
    // Explicitly reflecting it here keeps the audit truthful before transport.
    const evaluation = snapshot.killSwitch
      ? forceKillSwitch(evaluated, evaluatedAt)
      : withCommittedChangeTime(evaluated, evaluatedAt);
    const committed = await this.gateway.commitEvaluation({
      storeId,
      expectedRevision: snapshot.revision,
      evaluation,
    });
    return Object.freeze({ evaluation, committed });
  }
}

export type ScheduledRolloutBatchResult = Readonly<{
  evaluated: number;
  succeeded: readonly ScheduledRolloutControllerResult[];
  failed: readonly Readonly<{ storeId: string; message: string }>[];
}>;

export class ScheduledRolloutBatchController {
  constructor(
    private readonly gateway: ScheduledRolloutBatchGateway,
    private readonly windowMinutes = 15,
    private readonly limit = 100,
  ) {
    if (!Number.isInteger(limit) || limit < 1 || limit > 500) {
      throw new Error("Scheduled rollout batch limit must be between 1 and 500.");
    }
  }

  async run(evaluatedAt = new Date().toISOString()): Promise<ScheduledRolloutBatchResult> {
    const storeIds = [...new Set(await this.gateway.listEligibleStoreIds(this.limit))];
    const controller = new ScheduledRolloutController(this.gateway, this.windowMinutes);
    const succeeded: ScheduledRolloutControllerResult[] = [];
    const failed: Array<{ storeId: string; message: string }> = [];
    // Sequential commits keep store-level load bounded; one tenant failure does
    // not suppress a critical rollback recommendation for another tenant.
    for (const storeId of storeIds) {
      try {
        succeeded.push(await controller.run(storeId, evaluatedAt));
      } catch (error) {
        failed.push({
          storeId,
          message: error instanceof Error ? error.message : "Rollout evaluation failed.",
        });
      }
    }
    return Object.freeze({
      evaluated: storeIds.length,
      succeeded: Object.freeze(succeeded),
      failed: Object.freeze(failed),
    });
  }
}
