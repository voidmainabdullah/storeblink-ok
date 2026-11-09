const supabaseUrl = (
  process.env.VITE_SUPABASE_URL ||
  "https://shflnrznleodviqphvfg.supabase.co"
).replace(/\/$/, "");
const endpoint = `${supabaseUrl}/functions/v1/domain-orchestrator`;
const merchantActions = [
  "seo-dashboard",
  "seo-metadata-update",
  "seo-regenerate",
  "seo-redirect-upsert",
  "seo-redirect-delete",
  "seo-rollback",
];

const verifyAction = async (action) => {
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Origin: "https://storeblink.com",
    },
    body: JSON.stringify({
      action,
      storeId: "00000000-0000-4000-8000-000000000001",
    }),
    signal: AbortSignal.timeout(15_000),
  });
  const payload = await response.json().catch(() => null);
  const code = payload?.error?.code;
  if (code === "UNKNOWN_ACTION") {
    throw new Error(`Deployed domain-orchestrator does not support ${action}.`);
  }
  if (code !== "AUTH_REQUIRED") {
    throw new Error(
      `Unexpected unauthenticated response for ${action}: HTTP ${response.status}, ${code ?? "invalid payload"}.`,
    );
  }
  if (response.headers.get("access-control-allow-origin") !== "https://storeblink.com") {
    throw new Error(`Production CORS is missing for ${action}.`);
  }
};

await Promise.all(merchantActions.map(verifyAction));
process.stdout.write(
  `SEO backend compatibility verified for ${merchantActions.length} merchant actions.\n`,
);
