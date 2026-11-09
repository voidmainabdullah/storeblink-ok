// @vitest-environment node

import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import {
  handleAdaptiveRolloutEvaluation,
  isAdaptiveRolloutWorkerConfigured,
  type AdaptiveRolloutWorkerEnv,
} from "../../../worker/adaptive-commerce-runtime";

const endpoint = "https://storeblink.com/.storeblink/internal/adaptive-rollouts/evaluate";
const secret = "adaptive-rollout-worker-secret";
const environment: AdaptiveRolloutWorkerEnv = {
  ADAPTIVE_ROLLOUT_WORKER_SECRET: secret,
  SUPABASE_URL: "https://test-project.supabase.co",
  SUPABASE_SERVICE_ROLE_KEY: "service-role-test-key",
};

const request = (
  authorization = `Bearer ${secret}`,
  body: unknown = {
    evaluationId: "01234567-89ab-4def-8abc-0123456789ab",
    evaluatedAt: "2030-01-02T03:04:05.000Z",
  },
): Request => new Request(endpoint, {
  method: "POST",
  headers: {
    "Authorization": authorization,
    "Content-Type": "application/json",
  },
  body: JSON.stringify(body),
});

describe("trusted adaptive rollout worker", () => {
  it("connects the scheduled request to the bounded batch controller", async () => {
    const runBatch = vi.fn(async () => ({
      evaluated: 2,
      succeeded: Object.freeze([]),
      failed: Object.freeze([]),
    }));

    const response = await handleAdaptiveRolloutEvaluation(
      request(),
      environment,
      runBatch,
    );

    expect(response.status).toBe(202);
    await expect(response.json()).resolves.toEqual({ evaluated: 2, succeeded: 0, failed: 0 });
    expect(runBatch).toHaveBeenCalledOnce();
    expect(runBatch).toHaveBeenCalledWith(environment, "2030-01-02T03:04:05.000Z");
    expect(isAdaptiveRolloutWorkerConfigured(environment)).toBe(true);
  });

  it("rejects missing authority and malformed scheduler input before enumeration", async () => {
    const runBatch = vi.fn(async () => ({
      evaluated: 0,
      succeeded: Object.freeze([]),
      failed: Object.freeze([]),
    }));

    await expect(handleAdaptiveRolloutEvaluation(
      request("Bearer wrong-secret"),
      environment,
      runBatch,
    )).resolves.toMatchObject({ status: 401 });
    await expect(handleAdaptiveRolloutEvaluation(
      request(`Bearer ${secret}`, { evaluatedAt: "not-a-date" }),
      environment,
      runBatch,
    )).resolves.toMatchObject({ status: 400 });
    expect(runBatch).not.toHaveBeenCalled();
  });

  it("links the Edge tick to the exact protected Worker handler", () => {
    const edge = readFileSync("supabase/functions/evaluate-adaptive-rollouts/index.ts", "utf8");
    const worker = readFileSync("worker/index.ts", "utf8");
    expect(edge).toContain(endpoint);
    expect(edge).toContain("rolloutWorkerEndpoint");
    expect(worker).toContain('url.pathname === "/.storeblink/internal/adaptive-rollouts/evaluate"');
    expect(worker).toContain("handleAdaptiveRolloutEvaluation(request, env)");
    expect(worker).not.toContain("runAdaptiveRolloutBatch(env)");
  });
});
