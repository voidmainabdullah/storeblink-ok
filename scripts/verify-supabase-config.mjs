import { lookup } from "node:dns/promises";
import { loadEnv } from "vite";

const env = {
  ...loadEnv(process.env.NODE_ENV === "production" ? "production" : "development", process.cwd(), ""),
  ...process.env,
};

const projectId = env.VITE_SUPABASE_PROJECT_ID?.trim();
const publishableKey = env.VITE_SUPABASE_PUBLISHABLE_KEY?.trim();
let url;
try {
  url = new URL(env.VITE_SUPABASE_URL?.trim() ?? "");
} catch {
  throw new Error("VITE_SUPABASE_URL is missing or invalid.");
}

if (url.protocol !== "https:") throw new Error("VITE_SUPABASE_URL must use HTTPS.");
if (!publishableKey || publishableKey.startsWith("sb_secret_")) {
  throw new Error("VITE_SUPABASE_PUBLISHABLE_KEY must be a browser-safe publishable key.");
}
if (projectId && url.hostname !== `${projectId}.supabase.co`) {
  throw new Error("VITE_SUPABASE_PROJECT_ID does not match VITE_SUPABASE_URL.");
}

try {
  await lookup(url.hostname);
} catch {
  throw new Error(
    `Supabase project host ${url.hostname} does not resolve. Resume or restore the project, then update .env with its current URL and publishable key.`,
  );
}

const controller = new AbortController();
const timeout = setTimeout(() => controller.abort(), 8_000);
try {
  const response = await fetch(new URL("/auth/v1/health", url), {
    headers: { apikey: publishableKey },
    signal: controller.signal,
  });
  if (!response.ok) {
    throw new Error(`Supabase Auth health check returned HTTP ${response.status}.`);
  }
} finally {
  clearTimeout(timeout);
}

console.log(`Supabase Auth is reachable at ${url.hostname}.`);
