import type { ReviewedShadowPublicationService } from "./ShadowReviewLifecycle";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const constantTimeEqual = (left: string, right: string): boolean => {
  const length = Math.max(left.length, right.length);
  let mismatch = left.length ^ right.length;
  for (let index = 0; index < length; index += 1) {
    mismatch |= (left.charCodeAt(index) || 0) ^ (right.charCodeAt(index) || 0);
  }
  return mismatch === 0;
};

const response = (body: unknown, status = 200): Response => new Response(JSON.stringify(body), {
  status,
  headers: {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
  },
});

type ReviewedPublishRequest = Readonly<{
  storeId: string;
  jobId: string;
  expectedPointerRevision: number;
}>;

const parse = (value: unknown): ReviewedPublishRequest | null => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const input = value as Record<string, unknown>;
  if (
    Object.keys(input).some((key) => !["storeId", "jobId", "expectedPointerRevision"].includes(key)) ||
    typeof input.storeId !== "string" || !UUID.test(input.storeId) ||
    typeof input.jobId !== "string" || !UUID.test(input.jobId) ||
    typeof input.expectedPointerRevision !== "number" ||
    !Number.isSafeInteger(input.expectedPointerRevision) || input.expectedPointerRevision < 0
  ) return null;
  return {
    storeId: input.storeId,
    jobId: input.jobId,
    expectedPointerRevision: input.expectedPointerRevision,
  };
};

/**
 * Framework-neutral trusted Worker boundary. The caller can identify a
 * persisted job, but there is intentionally no artifact/hash/compiler field.
 */
export const createReviewedPublicationWorkerHandler = (dependencies: Readonly<{
  secret: string;
  service: ReviewedShadowPublicationService;
}>): ((request: Request) => Promise<Response>) => {
  if (dependencies.secret.length < 32) throw new Error("Reviewed publication worker secret is too short.");
  return async (request: Request): Promise<Response> => {
    if (request.method !== "POST") return response({ error: "Method not allowed" }, 405);
    const bearer = request.headers.get("authorization") ?? "";
    if (!bearer.startsWith("Bearer ") || !constantTimeEqual(bearer.slice(7), dependencies.secret)) {
      return response({ error: "Unauthorized" }, 401);
    }
    const contentLength = Number(request.headers.get("content-length") ?? 0);
    if (contentLength > 4_096) return response({ error: "Payload too large" }, 413);
    let input: ReviewedPublishRequest | null = null;
    try {
      const raw = await request.text();
      if (raw.length <= 4_096) input = parse(JSON.parse(raw));
    } catch {
      // Return the same bounded error for syntax and schema failures.
    }
    if (!input) return response({ error: "Invalid reviewed publication request" }, 400);
    try {
      const result = await dependencies.service.publish(input);
      return response(result);
    } catch {
      return response({ error: "Reviewed publication failed" }, 409);
    }
  };
};
