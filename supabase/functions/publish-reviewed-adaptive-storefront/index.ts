import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.110.6";

const productionOrigin = "https://storeblink.com";
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const allowedKeys = new Set(["storeId", "jobId", "expectedPointerRevision"]);

const allowedOrigin = (request: Request): string => {
  const origin = request.headers.get("origin") ?? productionOrigin;
  const development = Deno.env.get("ENVIRONMENT") === "development";
  if (origin === productionOrigin) return origin;
  if (development && /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) return origin;
  return productionOrigin;
};

const headers = (request: Request) => ({
  "Access-Control-Allow-Origin": allowedOrigin(request),
  "Access-Control-Allow-Headers": "authorization, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Max-Age": "86400",
  "Vary": "Origin",
});

const json = (request: Request, body: unknown, status = 200): Response => new Response(
  JSON.stringify(body),
  {
    status,
    headers: {
      ...headers(request),
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  },
);

type ReviewedPublicationRequest = Readonly<{
  storeId: string;
  jobId: string;
  expectedPointerRevision: number;
}>;

const parseRequest = (value: unknown): ReviewedPublicationRequest | null => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const input = value as Record<string, unknown>;
  if (
    Object.keys(input).some((key) => !allowedKeys.has(key)) ||
    typeof input.storeId !== "string" || !uuid.test(input.storeId) ||
    typeof input.jobId !== "string" || !uuid.test(input.jobId) ||
    typeof input.expectedPointerRevision !== "number" ||
      !Number.isSafeInteger(input.expectedPointerRevision) || input.expectedPointerRevision < 0
  ) return null;
  return {
    storeId: input.storeId,
    jobId: input.jobId,
    expectedPointerRevision: input.expectedPointerRevision,
  };
};

const configuredWorkerUrl = (): URL | null => {
  const raw = Deno.env.get("ADAPTIVE_REVIEWED_PUBLICATION_WORKER_URL")?.trim();
  if (!raw) return null;
  try {
    const url = new URL(raw);
    return url.protocol === "https:" ? url : null;
  } catch {
    return null;
  }
};

serve(async (request) => {
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: headers(request) });
  if (request.method !== "POST") return json(request, { error: "Method not allowed" }, 405);
  const authorization = request.headers.get("authorization");
  if (!authorization?.startsWith("Bearer ")) return json(request, { error: "Sign in required" }, 401);
  const contentLength = Number(request.headers.get("content-length") ?? 0);
  if (contentLength > 4_096) return json(request, { error: "Payload too large" }, 413);

  let publication: ReviewedPublicationRequest | null = null;
  try {
    const raw = await request.text();
    if (raw.length <= 4_096) publication = parseRequest(JSON.parse(raw));
  } catch {
    // Syntax and schema failures intentionally share one bounded response.
  }
  if (!publication) return json(request, { error: "Invalid reviewed publication request" }, 400);

  const supabaseUrl = Deno.env.get("SUPABASE_URL")?.trim();
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")?.trim();
  const workerUrl = configuredWorkerUrl();
  const workerSecret = Deno.env.get("ADAPTIVE_REVIEWED_PUBLICATION_WORKER_SECRET")?.trim();
  if (!supabaseUrl || !anonKey || !workerUrl || !workerSecret) {
    return json(request, { error: "Reviewed publication is not configured" }, 503);
  }

  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const token = authorization.slice("Bearer ".length);
  const [{ data: userData, error: userError }, { data: allowed, error: capabilityError }] =
    await Promise.all([
      userClient.auth.getUser(token),
      userClient.rpc("has_store_capability", {
        p_store_id: publication.storeId,
        p_capability: "theme.publish",
      }),
    ]);
  if (userError || !userData.user) return json(request, { error: "Session is invalid" }, 401);
  if (capabilityError || allowed !== true) return json(request, { error: "Publish access required" }, 403);

  // This is the entire trusted handoff. The persisted job and accepted shadow
  // determine the artifact; browser-provided artifact identity is impossible.
  const workerResponse = await fetch(workerUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${workerSecret}`,
    },
    body: JSON.stringify(publication),
    signal: AbortSignal.timeout(30_000),
  }).catch(() => null);
  if (!workerResponse) return json(request, { error: "Reviewed publication worker unavailable" }, 503);
  const responseBody = await workerResponse.json().catch(() => ({ error: "Publication response invalid" }));
  return json(request, responseBody, workerResponse.status);
});

