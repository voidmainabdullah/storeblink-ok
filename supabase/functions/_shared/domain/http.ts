import { DomainApiError, safeError } from "./errors.ts";

const productionOrigins = new Set(["https://storeblink.com"]);

const configuredOrigins = () =>
  new Set(
    (Deno.env.get("APP_ALLOWED_ORIGINS") ?? "")
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean),
  );

const responseOrigin = (request: Request): string | null => {
  const origin = request.headers.get("origin");
  if (!origin) return null;
  if (productionOrigins.has(origin) || configuredOrigins().has(origin)) return origin;
  return null;
};

export const corsHeaders = (request: Request): HeadersInit => {
  const origin = responseOrigin(request);
  return {
    ...(origin ? { "Access-Control-Allow-Origin": origin } : {}),
    "Access-Control-Allow-Headers":
      "authorization, apikey, content-type, x-client-info, x-storeblink-cron-secret",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };
};

export const jsonResponse = (
  request: Request,
  body: unknown,
  status = 200,
): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders(request),
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });

export const errorResponse = (request: Request, error: unknown): Response => {
  const normalized = safeError(error);
  return jsonResponse(
    request,
    {
      error: {
        code: normalized.code,
        message: normalized.message,
        ...(normalized.action ? { action: normalized.action } : {}),
      },
    },
    normalized.status,
  );
};

export const readJsonObject = async (request: Request): Promise<Record<string, unknown>> => {
  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().includes("application/json")) {
    throw new DomainApiError("INVALID_CONTENT_TYPE", "A JSON request body is required.", 415);
  }
  let value: unknown;
  try {
    value = await request.json();
  } catch {
    throw new DomainApiError("INVALID_JSON", "The request body is not valid JSON.", 400);
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new DomainApiError("INVALID_REQUEST", "The request body must be an object.", 400);
  }
  return value as Record<string, unknown>;
};
