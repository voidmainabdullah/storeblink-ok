import { createClient } from "@supabase/supabase-js";
import {
  ScheduledRolloutBatchController,
  type ScheduledRolloutBatchResult,
} from "../src/adaptive-commerce/server/ScheduledRolloutController";
import { SupabaseScheduledRolloutGateway } from "../src/adaptive-commerce/server/SupabaseAdaptiveReleaseGateway";

export type AdaptiveRolloutWorkerEnv = Readonly<{
  ADAPTIVE_ROLLOUT_WORKER_SECRET?: string;
  SUPABASE_URL?: string;
  SUPABASE_SERVICE_ROLE_KEY?: string;
  ADAPTIVE_ROLLOUT_WINDOW_MINUTES?: string;
  ADAPTIVE_ROLLOUT_BATCH_LIMIT?: string;
}>;

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const constantTimeEqual = (left: string, right: string): boolean => {
  if (!left || left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) {
    difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return difference === 0;
};

const boundedInteger = (
  value: string | undefined,
  fallback: number,
  minimum: number,
  maximum: number,
  label: string,
): number => {
  const result = value === undefined ? fallback : Number(value);
  if (!Number.isInteger(result) || result < minimum || result > maximum) {
    throw new Error(`${label} must be between ${minimum} and ${maximum}.`);
  }
  return result;
};

const required = (value: string | undefined, label: string): string => {
  const normalized = value?.trim() ?? "";
  if (!normalized) throw new Error(`${label} is not configured.`);
  return normalized;
};

export const runAdaptiveRolloutBatch = async (
  env: AdaptiveRolloutWorkerEnv,
  evaluatedAt = new Date().toISOString(),
): Promise<ScheduledRolloutBatchResult> => {
  const supabaseUrl = required(env.SUPABASE_URL, "SUPABASE_URL");
  const serviceRoleKey = required(env.SUPABASE_SERVICE_ROLE_KEY, "SUPABASE_SERVICE_ROLE_KEY");
  const windowMinutes = boundedInteger(
    env.ADAPTIVE_ROLLOUT_WINDOW_MINUTES,
    15,
    1,
    1_440,
    "Adaptive rollout window",
  );
  const batchLimit = boundedInteger(
    env.ADAPTIVE_ROLLOUT_BATCH_LIMIT,
    100,
    1,
    500,
    "Adaptive rollout batch limit",
  );
  const client = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const gateway = new SupabaseScheduledRolloutGateway(client);
  return new ScheduledRolloutBatchController(gateway, windowMinutes, batchLimit).run(evaluatedAt);
};

type BatchRunner = typeof runAdaptiveRolloutBatch;

export const handleAdaptiveRolloutEvaluation = async (
  request: Request,
  env: AdaptiveRolloutWorkerEnv,
  runBatch: BatchRunner = runAdaptiveRolloutBatch,
): Promise<Response> => {
  if (request.method !== "POST") return new Response("Method not allowed", { status: 405 });
  const expected = env.ADAPTIVE_ROLLOUT_WORKER_SECRET?.trim() ?? "";
  const supplied = (request.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!constantTimeEqual(expected, supplied)) return new Response("Unauthorized", { status: 401 });

  let evaluatedAt = "";
  try {
    const input = await request.json() as Record<string, unknown>;
    if (
      !input || Array.isArray(input) ||
      Object.keys(input).some((key) => key !== "evaluationId" && key !== "evaluatedAt") ||
      typeof input.evaluationId !== "string" || !uuid.test(input.evaluationId) ||
      typeof input.evaluatedAt !== "string" || !Number.isFinite(Date.parse(input.evaluatedAt))
    ) throw new Error("invalid");
    evaluatedAt = new Date(input.evaluatedAt).toISOString();
  } catch {
    return new Response("Invalid rollout evaluation request", { status: 400 });
  }

  try {
    const result = await runBatch(env, evaluatedAt);
    if (result.failed.length) {
      console.error("Adaptive rollout batch completed with failures", {
        evaluated: result.evaluated,
        succeeded: result.succeeded.length,
        failed: result.failed.length,
      });
    }
    return new Response(JSON.stringify({
      evaluated: result.evaluated,
      succeeded: result.succeeded.length,
      failed: result.failed.length,
    }), {
      status: result.failed.length ? 503 : 202,
      headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
    });
  } catch (error) {
    console.error("Adaptive rollout batch failed", {
      message: error instanceof Error ? error.message : "Unknown rollout error",
    });
    return new Response("Adaptive rollout evaluator unavailable", {
      status: 503,
      headers: { "Cache-Control": "no-store" },
    });
  }
};

export const isAdaptiveRolloutWorkerConfigured = (env: AdaptiveRolloutWorkerEnv): boolean =>
  Boolean(
    env.ADAPTIVE_ROLLOUT_WORKER_SECRET?.trim() &&
    env.SUPABASE_URL?.trim() &&
    env.SUPABASE_SERVICE_ROLE_KEY?.trim(),
  );
