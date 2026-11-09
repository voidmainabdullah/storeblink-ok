import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.110.6";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Max-Age": "86400",
};

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: {
    ...corsHeaders,
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
  },
});

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const opaque = /^[A-Za-z0-9:_-]{1,128}$/;
const hash = /^sha256:[a-f0-9]{64}$/;
const handle = /^[a-z0-9](?:[a-z0-9-]{0,118}[a-z0-9])?$/;
const errorCode = /^[A-Z0-9_.-]{1,80}$/;
const metrics = new Set(["LCP", "CLS", "INP", "render-error"]);
const routes = new Set(["home", "product", "collection", "page", "blog", "cart", "search", "404"]);
const runtimes = new Set(["legacy", "adaptive"]);
const allowedKeys = new Set([
  "eventId", "handle", "metric", "value", "routeType", "runtime",
  "cohortBucket", "artifactHash", "publicationId", "errorCode",
]);

type RumRequest = {
  eventId: string;
  handle: string;
  metric: string;
  value: number;
  routeType: string;
  runtime: string;
  cohortBucket: number;
  artifactHash: string | null;
  publicationId: string;
  errorCode: string | null;
};

const parseRequest = (value: unknown): RumRequest | null => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  if (Object.keys(record).some((key) => !allowedKeys.has(key))) return null;
  const parsed: RumRequest = {
    eventId: typeof record.eventId === "string" ? record.eventId : "",
    handle: typeof record.handle === "string" ? record.handle.trim().toLowerCase() : "",
    metric: typeof record.metric === "string" ? record.metric : "",
    value: typeof record.value === "number" ? record.value : Number.NaN,
    routeType: typeof record.routeType === "string" ? record.routeType : "",
    runtime: typeof record.runtime === "string" ? record.runtime : "",
    cohortBucket: typeof record.cohortBucket === "number" ? record.cohortBucket : -1,
    artifactHash: typeof record.artifactHash === "string" ? record.artifactHash : null,
    publicationId: typeof record.publicationId === "string" ? record.publicationId : "",
    errorCode: typeof record.errorCode === "string" ? record.errorCode : null,
  };
  if (!uuid.test(parsed.eventId) || !handle.test(parsed.handle)) return null;
  if (!metrics.has(parsed.metric) || !routes.has(parsed.routeType) || !runtimes.has(parsed.runtime)) return null;
  if (!Number.isFinite(parsed.value) || parsed.value < 0) return null;
  if (!Number.isInteger(parsed.cohortBucket) || parsed.cohortBucket < 0 || parsed.cohortBucket > 9999) return null;
  if (!opaque.test(parsed.publicationId)) return null;
  if (parsed.runtime === "adaptive" && (!parsed.artifactHash || !hash.test(parsed.artifactHash))) return null;
  if (parsed.runtime === "legacy" && parsed.artifactHash !== null) return null;
  if (parsed.errorCode !== null && !errorCode.test(parsed.errorCode)) return null;
  if ((parsed.metric === "LCP" || parsed.metric === "INP") && parsed.value > 120_000) return null;
  if (parsed.metric === "CLS" && parsed.value > 10) return null;
  if (parsed.metric === "render-error" && parsed.value !== 0 && parsed.value !== 1) return null;
  return parsed;
};

serve(async (request) => {
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders });
  if (request.method !== "POST") return json({ error: "Method not allowed" }, 405);
  const contentLength = Number(request.headers.get("content-length") ?? 0);
  if (contentLength > 4_096) return json({ error: "Payload too large" }, 413);

  let body: unknown;
  try {
    const raw = await request.text();
    if (raw.length > 4_096) return json({ error: "Payload too large" }, 413);
    body = JSON.parse(raw);
  } catch {
    return json({ error: "Invalid JSON" }, 400);
  }
  const sample = parseRequest(body);
  if (!sample) return json({ error: "Invalid RUM sample" }, 400);

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const publicKey = Deno.env.get("SUPABASE_ANON_KEY");
  if (!supabaseUrl || !publicKey) return json({ error: "Ingestion unavailable" }, 503);
  const client = createClient(supabaseUrl, publicKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data, error } = await client.rpc("ingest_adaptive_storefront_rum", {
    p_event_id: sample.eventId,
    p_handle: sample.handle,
    p_metric: sample.metric,
    p_value: sample.value,
    p_route_type: sample.routeType,
    p_runtime: sample.runtime,
    p_cohort_bucket: sample.cohortBucket,
    p_artifact_hash: sample.artifactHash,
    p_publication_id: sample.publicationId,
    p_error_code: sample.errorCode,
  });
  if (error) {
    console.error("Adaptive storefront RUM RPC failed", { code: error.code });
    return json({ error: "Ingestion unavailable" }, 503);
  }
  // Rejections are intentionally indistinguishable from accepted observations.
  // This keeps the endpoint from becoming a store/runtime probing oracle.
  return json({ queued: data === true }, 202);
});
