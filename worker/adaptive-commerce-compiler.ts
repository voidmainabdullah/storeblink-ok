import { createClient } from "@supabase/supabase-js";
import { ProductionArtifactReleaseGate } from "../src/adaptive-commerce/server/ProductionArtifactReleaseGate";
import {
  ServerCompileJobError,
  ServerStorefrontCompileJob,
} from "../src/adaptive-commerce/server/ServerStorefrontCompileJob";
import { SupabaseAdaptiveReleaseGateway } from "../src/adaptive-commerce/server/SupabaseAdaptiveReleaseGateway";
import type {
  ServerCompileJobRequest,
  ServerCompileJobResult,
} from "../src/adaptive-commerce/server/types";

export type AdaptiveCompilerWorkerEnv = Readonly<{
  ADAPTIVE_COMPILER_WORKER_SECRET?: string;
  SUPABASE_URL?: string;
  SUPABASE_SERVICE_ROLE_KEY?: string;
}>;

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_REQUEST_BYTES = 8_192;
const allowedKeys = new Set([
  "jobId",
  "idempotencyKey",
  "storeId",
  "installationId",
  "expectedSourceRevision",
  "expectedPointerRevision",
  "intent",
]);

const constantTimeEqual = (left: string, right: string): boolean => {
  if (!left || left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) {
    difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return difference === 0;
};

const required = (value: string | undefined, label: string): string => {
  const normalized = value?.trim() ?? "";
  if (!normalized) throw new Error(`${label} is not configured.`);
  return normalized;
};

const bearerToken = (authorization: string | null): string => {
  const match = /^Bearer[ \t]+([^\s]+)$/i.exec(authorization ?? "");
  return match?.[1] ?? "";
};

type BodyReadResult =
  | Readonly<{ status: "ok"; value: unknown }>
  | Readonly<{ status: "invalid" | "too-large" }>;

const readBoundedJsonBody = async (request: Request): Promise<BodyReadResult> => {
  if (!request.body) return { status: "invalid" };
  const reader = request.body.getReader();
  const decoder = new TextDecoder("utf-8", { fatal: true });
  let bytes = 0;
  let raw = "";
  try {
    while (true) {
      const part = await reader.read();
      if (part.done) break;
      bytes += part.value.byteLength;
      if (bytes > MAX_REQUEST_BYTES) {
        await reader.cancel();
        return { status: "too-large" };
      }
      raw += decoder.decode(part.value, { stream: true });
    }
    raw += decoder.decode();
    return { status: "ok", value: JSON.parse(raw) };
  } catch {
    return { status: "invalid" };
  } finally {
    reader.releaseLock();
  }
};

const parseRequest = (value: unknown): ServerCompileJobRequest | null => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const input = value as Record<string, unknown>;
  if (
    Object.keys(input).some((key) => !allowedKeys.has(key)) ||
    typeof input.jobId !== "string" || !uuid.test(input.jobId) ||
    typeof input.storeId !== "string" || !uuid.test(input.storeId) ||
    typeof input.installationId !== "string" || !uuid.test(input.installationId) ||
    typeof input.idempotencyKey !== "string" ||
      input.idempotencyKey.trim().length < 8 || input.idempotencyKey.length > 160 ||
    typeof input.expectedSourceRevision !== "number" ||
      !Number.isSafeInteger(input.expectedSourceRevision) || input.expectedSourceRevision < 1 ||
    typeof input.expectedPointerRevision !== "number" ||
      !Number.isSafeInteger(input.expectedPointerRevision) || input.expectedPointerRevision < 0 ||
    (input.intent !== "shadow-only" && input.intent !== "publish")
  ) return null;
  return Object.freeze({
    jobId: input.jobId,
    idempotencyKey: input.idempotencyKey.trim(),
    storeId: input.storeId,
    installationId: input.installationId,
    expectedSourceRevision: input.expectedSourceRevision,
    expectedPointerRevision: input.expectedPointerRevision,
    intent: input.intent,
  });
};

export const runAdaptiveCompilerJob = async (
  env: AdaptiveCompilerWorkerEnv,
  request: ServerCompileJobRequest,
): Promise<ServerCompileJobResult> => {
  const supabaseUrl = required(env.SUPABASE_URL, "SUPABASE_URL");
  const serviceRoleKey = required(env.SUPABASE_SERVICE_ROLE_KEY, "SUPABASE_SERVICE_ROLE_KEY");
  const client = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const gateway = new SupabaseAdaptiveReleaseGateway(client);
  return new ServerStorefrontCompileJob({
    gateway,
    registryLoader: gateway,
    releaseGate: new ProductionArtifactReleaseGate(),
  }).run(request);
};

type CompilerRunner = typeof runAdaptiveCompilerJob;

const json = (
  body: unknown,
  status: number,
  extraHeaders: Readonly<Record<string, string>> = {},
): Response => new Response(JSON.stringify(body), {
  status,
  headers: {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
    ...extraHeaders,
  },
});

const compilerErrorStatus = (code: string): number => {
  if (code === "job.invalid-request") return 400;
  if (
    code === "job.in-progress" ||
    code === "job.previously-failed" ||
    code === "source.revision-conflict"
  ) return 409;
  if (code === "job.execution-failed") return 503;
  return 422;
};

export const handleAdaptiveCompilerRequest = async (
  request: Request,
  env: AdaptiveCompilerWorkerEnv,
  runJob: CompilerRunner = runAdaptiveCompilerJob,
): Promise<Response> => {
  if (request.method !== "POST") {
    return json({ error: "Method not allowed" }, 405, { Allow: "POST" });
  }
  const expectedSecret = env.ADAPTIVE_COMPILER_WORKER_SECRET?.trim() ?? "";
  const suppliedSecret = bearerToken(request.headers.get("authorization"));
  if (!constantTimeEqual(expectedSecret, suppliedSecret)) {
    return json({ error: "Unauthorized" }, 401);
  }

  const mediaType = request.headers.get("content-type")?.split(";", 1)[0]?.trim().toLowerCase();
  if (mediaType !== "application/json") {
    return json({ error: "JSON request required" }, 415);
  }

  const declaredLengthHeader = request.headers.get("content-length");
  if (declaredLengthHeader !== null) {
    const normalizedLength = declaredLengthHeader.trim();
    if (!/^\d+$/.test(normalizedLength)) {
      return json({ error: "Invalid Content-Length" }, 400);
    }
    if (Number(normalizedLength) > MAX_REQUEST_BYTES) {
      return json({ error: "Payload too large" }, 413);
    }
  }

  const body = await readBoundedJsonBody(request);
  if (body.status === "too-large") return json({ error: "Payload too large" }, 413);
  const compilerRequest = body.status === "ok" ? parseRequest(body.value) : null;
  if (!compilerRequest) return json({ error: "Invalid compiler request" }, 400);

  const idempotencyHeader = request.headers.get("idempotency-key")?.trim() ?? "";
  if (!constantTimeEqual(idempotencyHeader, compilerRequest.idempotencyKey)) {
    return json({ error: "Idempotency key mismatch" }, 400);
  }

  try {
    return json(await runJob(env, compilerRequest), 202);
  } catch (error) {
    if (error instanceof ServerCompileJobError) {
      if (error.code === "job.execution-failed") {
        console.error("Adaptive compiler job execution failed", { code: error.code });
      }
      return json({
        error: error.code,
        message: error.code === "job.execution-failed"
          ? "Adaptive compiler unavailable"
          : error.message,
      }, compilerErrorStatus(error.code));
    }
    console.error("Adaptive compiler worker failed", {
      message: error instanceof Error ? error.message : "Unknown compiler error",
    });
    return json({ error: "Adaptive compiler unavailable" }, 503);
  }
};

export const isAdaptiveCompilerWorkerConfigured = (env: AdaptiveCompilerWorkerEnv): boolean =>
  Boolean(
    env.ADAPTIVE_COMPILER_WORKER_SECRET?.trim() &&
    env.SUPABASE_URL?.trim() &&
    env.SUPABASE_SERVICE_ROLE_KEY?.trim(),
  );
