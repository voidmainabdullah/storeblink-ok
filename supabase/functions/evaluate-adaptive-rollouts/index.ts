import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

const productionRolloutWorkerUrl =
  "https://storeblink.com/.storeblink/internal/adaptive-rollouts/evaluate";

const json = (body: unknown, status = 200): Response => new Response(JSON.stringify(body), {
  status,
  headers: {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
  },
});

const constantTimeEqual = (left: string, right: string): boolean => {
  if (!left || left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) {
    difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return difference === 0;
};

const rolloutWorkerEndpoint = (): URL | null => {
  try {
    const endpoint = new URL(
      Deno.env.get("ADAPTIVE_ROLLOUT_WORKER_URL")?.trim() || productionRolloutWorkerUrl,
    );
    if (
      endpoint.origin !== "https://storeblink.com" ||
      endpoint.pathname !== "/.storeblink/internal/adaptive-rollouts/evaluate" ||
      endpoint.username || endpoint.password || endpoint.search || endpoint.hash
    ) return null;
    return endpoint;
  } catch {
    return null;
  }
};

serve(async (request) => {
  if (request.method !== "POST") return json({ error: "Method not allowed" }, 405);
  const expectedCronSecret = Deno.env.get("ADAPTIVE_ROLLOUT_CRON_SECRET")?.trim() ?? "";
  const suppliedCronSecret = request.headers.get("x-storeblink-cron-secret") ?? "";
  if (!constantTimeEqual(expectedCronSecret, suppliedCronSecret)) {
    return json({ error: "Not authorized" }, 401);
  }
  const workerUrl = rolloutWorkerEndpoint();
  const workerSecret = Deno.env.get("ADAPTIVE_ROLLOUT_WORKER_SECRET")?.trim();
  if (!workerUrl || !workerSecret) return json({ error: "Rollout evaluator is not configured" }, 503);

  // Store enumeration, bounded RUM loading, evaluator policy, and commits all
  // stay in the trusted worker. The scheduler supplies no tenant decision data.
  const response = await fetch(workerUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${workerSecret}`,
    },
    body: JSON.stringify({
      evaluationId: crypto.randomUUID(),
      evaluatedAt: new Date().toISOString(),
    }),
    signal: AbortSignal.timeout(55_000),
  }).catch(() => null);
  if (!response) return json({ error: "Rollout evaluator unavailable" }, 503);
  const body = await response.json().catch(() => ({ error: "Rollout evaluator response invalid" }));
  return json(body, response.ok ? 202 : response.status);
});
