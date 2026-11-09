// @vitest-environment node

import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import {
  handleAdaptiveCompilerRequest,
  isAdaptiveCompilerWorkerConfigured,
  type AdaptiveCompilerWorkerEnv,
} from "../../../worker/adaptive-commerce-compiler";
import { ServerCompileJobError } from "./ServerStorefrontCompileJob";

const endpoint = "https://storeblink.com/.storeblink/internal/adaptive-compiler/compile";
const secret = "adaptive-compiler-worker-secret";
const idempotencyKey = "install-preview-0001";
const environment: AdaptiveCompilerWorkerEnv = {
  ADAPTIVE_COMPILER_WORKER_SECRET: secret,
  SUPABASE_URL: "https://test-project.supabase.co",
  SUPABASE_SERVICE_ROLE_KEY: "service-role-test-key",
};
const payload = {
  jobId: "11111111-1111-4111-8111-111111111111",
  storeId: "22222222-2222-4222-8222-222222222222",
  installationId: "33333333-3333-4333-8333-333333333333",
  idempotencyKey,
  expectedSourceRevision: 1,
  expectedPointerRevision: 0,
  intent: "shadow-only" as const,
};

const request = (
  body: unknown = payload,
  authorization = `Bearer ${secret}`,
  headerKey = idempotencyKey,
): Request => new Request(endpoint, {
  method: "POST",
  headers: {
    "Authorization": authorization,
    "Content-Type": "application/json",
    "Idempotency-Key": headerKey,
  },
  body: JSON.stringify(body),
});

const result = Object.freeze({
  jobId: payload.jobId,
  sourceRevision: 1,
  artifactHash: `sha256:${"a".repeat(64)}`,
  shadowId: "44444444-4444-4444-8444-444444444444",
  shadowStatus: "pending" as const,
  publicationId: null,
  pointerRevision: null,
  published: false,
});

describe("trusted adaptive compiler Worker", () => {
  it("runs the server-owned compiler job for an exact authenticated request", async () => {
    const runJob = vi.fn(async () => result);
    const response = await handleAdaptiveCompilerRequest(request(), environment, runJob);

    expect(response.status).toBe(202);
    await expect(response.json()).resolves.toEqual(result);
    expect(runJob).toHaveBeenCalledWith(environment, payload);
    const call = runJob.mock.calls[0] as unknown as [AdaptiveCompilerWorkerEnv, typeof payload];
    expect(Object.isFrozen(call[1])).toBe(true);
    expect(isAdaptiveCompilerWorkerConfigured(environment)).toBe(true);
  });

  it("requires the exact Bearer authority and matching idempotency header", async () => {
    const runJob = vi.fn(async () => result);
    await expect(handleAdaptiveCompilerRequest(
      request(payload, "Bearer wrong-secret"),
      environment,
      runJob,
    )).resolves.toMatchObject({ status: 401 });
    await expect(handleAdaptiveCompilerRequest(
      request(payload, `Bearer ${secret}`, "another-idempotency-key"),
      environment,
      runJob,
    )).resolves.toMatchObject({ status: 400 });
    await expect(handleAdaptiveCompilerRequest(
      request(payload, secret),
      environment,
      runJob,
    )).resolves.toMatchObject({ status: 401 });
    await expect(handleAdaptiveCompilerRequest(
      request(),
      { ...environment, ADAPTIVE_COMPILER_WORKER_SECRET: "" },
      runJob,
    )).resolves.toMatchObject({ status: 401 });
    expect(runJob).not.toHaveBeenCalled();
  });

  it("rejects browser-owned compiler output fields and non-exact JSON", async () => {
    const runJob = vi.fn(async () => result);
    for (const compilerOwned of [
      { artifact: {} },
      { artifactHash: `sha256:${"a".repeat(64)}` },
      { compilerVersion: "1.0.0" },
      { createdAt: "2030-01-02T03:04:05.000Z" },
    ]) {
      await expect(handleAdaptiveCompilerRequest(
        request({ ...payload, ...compilerOwned }),
        environment,
        runJob,
      )).resolves.toMatchObject({ status: 400 });
    }
    await expect(handleAdaptiveCompilerRequest(
      new Request(endpoint, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${secret}`,
          "Idempotency-Key": idempotencyKey,
        },
        body: JSON.stringify(payload),
      }),
      environment,
      runJob,
    )).resolves.toMatchObject({ status: 415 });
    await expect(handleAdaptiveCompilerRequest(
      request({ ...payload, padding: "x".repeat(8_192) }),
      environment,
      runJob,
    )).resolves.toMatchObject({ status: 413 });
    await expect(handleAdaptiveCompilerRequest(
      new Request(endpoint, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${secret}`,
          "Content-Type": "application/json",
          "Idempotency-Key": idempotencyKey,
        },
        body: "{",
      }),
      environment,
      runJob,
    )).resolves.toMatchObject({ status: 400 });
    expect(runJob).not.toHaveBeenCalled();
  });

  it("keeps unexpected compiler failures behind a generic unavailable response", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const runJob = vi.fn(async () => {
      throw new ServerCompileJobError("job.execution-failed", "private database detail");
    });
    const response = await handleAdaptiveCompilerRequest(request(), environment, runJob);
    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({
      error: "job.execution-failed",
      message: "Adaptive compiler unavailable",
    });
    expect(log).toHaveBeenCalledWith(
      "Adaptive compiler job execution failed",
      { code: "job.execution-failed" },
    );
    log.mockRestore();
  });

  it("connects the authenticated Edge trigger to the exact protected Worker route", () => {
    const edge = readFileSync("supabase/functions/compile-adaptive-storefront/index.ts", "utf8");
    const worker = readFileSync("worker/index.ts", "utf8");
    expect(edge).toContain("ADAPTIVE_COMPILER_WORKER_URL");
    expect(edge).toContain("ADAPTIVE_COMPILER_WORKER_SECRET");
    expect(worker).toContain('url.pathname === "/.storeblink/internal/adaptive-compiler/compile"');
    expect(worker).toContain("handleAdaptiveCompilerRequest(request, env)");
  });

  it("constructs the registry, gateway, and release gate only inside the trusted Worker", () => {
    const compilerWorker = readFileSync("worker/adaptive-commerce-compiler.ts", "utf8");
    expect(compilerWorker).toContain("new SupabaseAdaptiveReleaseGateway(client)");
    expect(compilerWorker).toContain("registryLoader: gateway");
    expect(compilerWorker).toContain("releaseGate: new ProductionArtifactReleaseGate()");
    expect(compilerWorker).not.toMatch(/input\.(?:artifact|artifactHash|compilerVersion|createdAt)/);
  });
});
