import * as Sentry from "@sentry/cloudflare";
import {
  compileClaimedSitemaps,
  isSeoFilePath,
  loadSeoRouteManifest,
  reportOverdueSitemaps,
  rollbackCompiledSitemap,
  serveCompiledSeoArtifact,
  type SeoRuntimeEnv,
} from "./seo-runtime";
import {
  handleAdaptiveRolloutEvaluation,
  type AdaptiveRolloutWorkerEnv,
} from "./adaptive-commerce-runtime";
import {
  handleAdaptiveCompilerRequest,
  type AdaptiveCompilerWorkerEnv,
} from "./adaptive-commerce-compiler";
import {
  handleAdaptiveReviewedPublicationRequest,
  type AdaptiveReviewedPublicationWorkerEnv,
} from "./adaptive-commerce-reviewed-publication";

type AssetBinding = {
  fetch(request: Request): Promise<Response>;
};

export type StoreBlinkWorkerEnv = SeoRuntimeEnv & AdaptiveRolloutWorkerEnv & AdaptiveCompilerWorkerEnv &
  AdaptiveReviewedPublicationWorkerEnv & {
  ASSETS: AssetBinding;
  STOREFRONT_SEO_ENDPOINT: string;
  SEO_RATE_LIMITER?: RateLimitBinding;
  SENTRY_DSN?: string;
  SENTRY_ENVIRONMENT?: string;
};

type WorkerExecutionContext = {
  waitUntil(promise: Promise<unknown>): void;
};

type RateLimitBinding = {
  limit(input: { key: string }): Promise<{ success: boolean }>;
};

type StorefrontHead = {
  httpStatus: 200 | 404;
  title: string;
  description: string;
  canonicalUrl: string;
  robots: string;
  image: string | null;
  socialTitle: string;
  socialDescription: string;
  socialImage: string | null;
  customMetaTags: Array<{
    attribute: "name" | "property";
    key: string;
    content: string;
  }>;
  alternates: Array<{ locale: string; url: string }>;
  googleSiteVerification: string | null;
  structuredData: Record<string, unknown>;
};

const PLATFORM_HOSTS = new Set([
  "storeblink.com",
  "www.storeblink.com",
  "origin.storeblink.com",
  "domains.storeblink.com",
]);

const normalizeHostname = (value: string): string =>
  value.trim().toLowerCase().replace(/:\d+$/, "").replace(/\.$/, "");

const safeMetaNames = new Set([
  "author", "keywords", "application-name", "theme-color", "color-scheme",
]);
const safeMetaProperty = /^(?:product|article|profile):[a-z0-9:_-]+$/;
const safeHreflang = /^[A-Za-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$/;

const isAbsoluteHttpsUrl = (value: unknown): value is string => {
  if (typeof value !== "string") return false;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password && !url.hash;
  } catch {
    return false;
  }
};

const isSafeHeadMetaTag = (value: unknown): boolean => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const tag = value as Record<string, unknown>;
  if (
    (tag.attribute !== "name" && tag.attribute !== "property") ||
    typeof tag.key !== "string" || typeof tag.content !== "string" ||
    !tag.content.trim() || tag.content.length > 500
  ) return false;
  const key = tag.key.trim().toLowerCase();
  return tag.attribute === "name" ? safeMetaNames.has(key) : safeMetaProperty.test(key);
};

const isSafeAlternate = (value: unknown): boolean => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const alternate = value as Record<string, unknown>;
  if (typeof alternate.locale !== "string" || typeof alternate.url !== "string") return false;
  try {
    const url = new URL(alternate.url);
    return safeHreflang.test(alternate.locale) && url.protocol === "https:" &&
      !url.username && !url.password && !url.hash;
  } catch {
    return false;
  }
};

const isCustomStorefrontHost = (hostname: string): boolean =>
  Boolean(hostname) && !PLATFORM_HOSTS.has(hostname);

const constantTimeEqual = (left: string, right: string): boolean => {
  if (!left || left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) {
    difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return difference === 0;
};

const internalSeoRollback = async (
  request: Request,
  env: StoreBlinkWorkerEnv,
): Promise<Response> => {
  const supplied = request.headers.get("x-storeblink-cron-secret") ?? "";
  if (!env.DOMAIN_CRON_SECRET || !constantTimeEqual(env.DOMAIN_CRON_SECRET, supplied)) {
    return new Response("Unauthorized", { status: 401 });
  }
  let body: Record<string, unknown>;
  try {
    const parsed = await request.json();
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error();
    body = parsed as Record<string, unknown>;
  } catch {
    return new Response("Invalid rollback request", { status: 400 });
  }
  const storeId = typeof body.storeId === "string" ? body.storeId : "";
  const generationId = typeof body.generationId === "string" ? body.generationId : "";
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  if (!uuid.test(storeId) || !uuid.test(generationId)) {
    return new Response("Invalid rollback identifiers", { status: 400 });
  }
  try {
    const manifest = await rollbackCompiledSitemap(env, storeId, generationId);
    return new Response(JSON.stringify({ data: manifest }), {
      headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
    });
  } catch (error) {
    console.error("Sitemap rollback failed", {
      storeId,
      generationId,
      message: error instanceof Error ? error.message : "Unknown rollback error",
    });
    return new Response("Sitemap rollback failed", {
      status: 500,
      headers: { "Cache-Control": "no-store" },
    });
  }
};

const escapeHtml = (value: string): string =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

const requireSeoEndpoint = (env: StoreBlinkWorkerEnv): URL => {
  let endpoint: URL;
  try {
    endpoint = new URL(env.STOREFRONT_SEO_ENDPOINT);
  } catch {
    throw new Error("STOREFRONT_SEO_ENDPOINT is invalid");
  }
  if (endpoint.protocol !== "https:" || !endpoint.hostname.endsWith(".supabase.co")) {
    throw new Error("STOREFRONT_SEO_ENDPOINT must be a Supabase HTTPS endpoint");
  }
  return endpoint;
};

const fetchSeoResource = async (
  request: Request,
  env: StoreBlinkWorkerEnv,
  resource: "head" | "robots" | "sitemap",
  options: Readonly<{ path?: string; storeHandle?: string }> = {},
): Promise<Response> => {
  const requestUrl = new URL(request.url);
  const endpoint = requireSeoEndpoint(env);
  endpoint.searchParams.set("resource", resource);
  if (resource === "head") endpoint.searchParams.set("path", options.path ?? requestUrl.pathname);
  if (options.storeHandle) endpoint.searchParams.set("storeHandle", options.storeHandle);
  const headers = new Headers({
    "x-storeblink-host": requestUrl.hostname,
    "x-forwarded-host": requestUrl.hostname,
    "x-storeblink-edge": "storefront-worker",
  });
  const response = await fetch(endpoint, {
    method: request.method === "HEAD" ? "HEAD" : "GET",
    headers,
    redirect: "manual",
  });
  if (resource !== "head") {
    const headers = new Headers(response.headers);
    headers.set(
      "Content-Type",
      resource === "sitemap" ? "application/xml; charset=utf-8" : "text/plain; charset=utf-8",
    );
    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers,
    });
  }
  return response;
};

const stripBaseSeo = (html: string): string => html
  .replace(/<title(?:\s[^>]*)?>[\s\S]*?<\/title>/gi, "")
  .replace(/<meta\s+[^>]*name=["'](?:description|robots|google-site-verification)["'][^>]*>/gi, "")
  .replace(/<meta\s+[^>]*property=["']og:(?:title|description|type|url|image)["'][^>]*>/gi, "")
  .replace(/<meta\s+[^>]*name=["']twitter:(?:card|title|description|image)["'][^>]*>/gi, "")
  .replace(/<link\s+[^>]*rel=["']canonical["'][^>]*>/gi, "")
  .replace(/<link\s+[^>]*data-storeblink-edge-alternate[^>]*>/gi, "")
  .replace(/<meta\s+[^>]*data-storeblink-edge-custom[^>]*>/gi, "")
  .replace(/<script\s+[^>]*data-storeblink-edge-seo[^>]*>[\s\S]*?<\/script>/gi, "");

const injectStorefrontHead = (html: string, head: StorefrontHead, servedPath: string): string => {
  const cleanHtml = stripBaseSeo(html);
  const socialImageCandidate = head.socialImage ?? head.image;
  const socialImage = isAbsoluteHttpsUrl(socialImageCandidate) ? socialImageCandidate : null;
  const imageTags = socialImage
    ? [
        `<meta data-storeblink-edge-seo="og-image" property="og:image" content="${escapeHtml(socialImage)}">`,
        `<meta data-storeblink-edge-seo="twitter-image" name="twitter:image" content="${escapeHtml(socialImage)}">`,
      ]
    : [];
  const verificationTag = head.googleSiteVerification
    ? `<meta data-storeblink-edge-seo="google-site-verification" name="google-site-verification" content="${escapeHtml(head.googleSiteVerification)}">`
    : "";
  const structuredData = JSON.stringify(head.structuredData).replace(/</g, "\\u003c");
  const customMetaTags = head.customMetaTags.map((tag) => (
    `<meta data-storeblink-edge-seo="custom" data-storeblink-edge-custom ${tag.attribute}="${escapeHtml(tag.key)}" content="${escapeHtml(tag.content)}">`
  ));
  const alternateTags = head.alternates.map((alternate) => (
    `<link data-storeblink-edge-seo="alternate" data-storeblink-edge-alternate rel="alternate" hreflang="${escapeHtml(alternate.locale)}" href="${escapeHtml(alternate.url)}">`
  ));
  const tags = [
    `<meta data-storeblink-edge-seo="route" name="storeblink:edge-route" content="${escapeHtml(servedPath)}">`,
    `<title data-storeblink-edge-seo="title">${escapeHtml(head.title)}</title>`,
    `<meta data-storeblink-edge-seo="description" name="description" content="${escapeHtml(head.description)}">`,
    `<meta data-storeblink-edge-seo="robots" name="robots" content="${escapeHtml(head.robots)}">`,
    `<link data-storeblink-edge-seo="canonical" rel="canonical" href="${escapeHtml(head.canonicalUrl)}">`,
    `<meta data-storeblink-edge-seo="og-type" property="og:type" content="website">`,
    `<meta data-storeblink-edge-seo="og-title" property="og:title" content="${escapeHtml(head.socialTitle)}">`,
    `<meta data-storeblink-edge-seo="og-description" property="og:description" content="${escapeHtml(head.socialDescription)}">`,
    `<meta data-storeblink-edge-seo="og-url" property="og:url" content="${escapeHtml(head.canonicalUrl)}">`,
    `<meta data-storeblink-edge-seo="twitter-card" name="twitter:card" content="summary_large_image">`,
    `<meta data-storeblink-edge-seo="twitter-title" name="twitter:title" content="${escapeHtml(head.socialTitle)}">`,
    `<meta data-storeblink-edge-seo="twitter-description" name="twitter:description" content="${escapeHtml(head.socialDescription)}">`,
    ...imageTags,
    ...customMetaTags,
    ...alternateTags,
    verificationTag,
    `<script type="application/ld+json" data-storeblink-edge-seo="structured-data">${structuredData}</script>`,
  ].filter(Boolean).join("\n    ");
  return cleanHtml.replace(/<\/head>/i, `    ${tags}\n  </head>`);
};

const isStorefrontHead = (value: unknown): value is StorefrontHead => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  const customMetaTags = Array.isArray(record.customMetaTags) ? record.customMetaTags : null;
  const alternates = Array.isArray(record.alternates) ? record.alternates : null;
  return (
    (record.httpStatus === 200 || record.httpStatus === 404) &&
    typeof record.title === "string" &&
    typeof record.description === "string" &&
    isAbsoluteHttpsUrl(record.canonicalUrl) &&
    typeof record.robots === "string" &&
    (record.image === null || isAbsoluteHttpsUrl(record.image)) &&
    typeof record.socialTitle === "string" &&
    typeof record.socialDescription === "string" &&
    (record.socialImage === null || isAbsoluteHttpsUrl(record.socialImage)) &&
    customMetaTags !== null && customMetaTags.length <= 20 && customMetaTags.every(isSafeHeadMetaTag) &&
    alternates !== null && alternates.length <= 50 && alternates.every(isSafeAlternate) &&
    (record.googleSiteVerification === null || typeof record.googleSiteVerification === "string") &&
    Boolean(record.structuredData) &&
    typeof record.structuredData === "object"
  );
};

const enforceSeoRateLimit = async (
  request: Request,
  env: StoreBlinkWorkerEnv,
  hostname: string,
): Promise<Response | null> => {
  if (!env.SEO_RATE_LIMITER) return null;
  const client = request.headers.get("CF-Connecting-IP") ?? "unknown";
  const result = await env.SEO_RATE_LIMITER.limit({ key: `${hostname}:${client}` });
  if (result.success) return null;
  return new Response("Too many SEO resource requests", {
    status: 429,
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-store",
      "Retry-After": "60",
    },
  });
};

const resolveMissingManifestSeoRoute = async (
  request: Request,
  env: StoreBlinkWorkerEnv,
  seoPath: string,
): Promise<Response | null> => {
  const resource = seoPath === "/robots.txt" ? "robots" : "sitemap";
  const response = await fetchSeoResource(request, env, resource).catch(() => null);
  if (!response) return null;
  if (response.status === 404) {
    return new Response("Store not found", {
      status: 404,
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  }
  if (response.status < 300 || response.status >= 400) return null;
  const location = response.headers.get("Location");
  if (!location) return null;
  try {
    const primary = new URL(location);
    if (primary.protocol !== "https:") return null;
    return new Response(null, {
      status: 301,
      headers: {
        Location: `${primary.origin}${seoPath}`,
        "Cache-Control": "public, max-age=300, s-maxage=3600",
      },
    });
  } catch {
    return null;
  }
};

const serveStorefrontHtml = async (
  request: Request,
  env: StoreBlinkWorkerEnv,
  headOptions: Readonly<{ path?: string; storeHandle?: string }> = {},
): Promise<Response> => {
  const url = new URL(request.url);
  const assetPromise = env.ASSETS.fetch(request);
  if (request.method !== "GET") return assetPromise;
  const acceptsHtml = (request.headers.get("accept") ?? "").includes("text/html") ||
    request.headers.get("sec-fetch-dest") === "document" ||
    !/\/[^/]+\.[a-z0-9]{1,12}$/i.test(url.pathname);
  if (!acceptsHtml) return assetPromise;

  const [assetResponse, headResponse] = await Promise.all([
    assetPromise,
    fetchSeoResource(request, env, "head", headOptions).catch(() => null),
  ]);
  if (headResponse && headResponse.status >= 300 && headResponse.status < 400) {
    return headResponse;
  }
  const contentType = assetResponse.headers.get("content-type") ?? "";
  if (!headResponse?.ok || !contentType.includes("text/html")) return assetResponse;
  let head: unknown;
  try {
    head = await headResponse.json();
  } catch {
    return assetResponse;
  }
  if (!isStorefrontHead(head)) return assetResponse;

  const body = injectStorefrontHead(await assetResponse.text(), head, url.pathname);
  const headers = new Headers(assetResponse.headers);
  headers.delete("Content-Length");
  headers.delete("ETag");
  headers.set("X-StoreBlink-SEO", "edge");
  return new Response(body, {
    status: assetResponse.ok ? head.httpStatus : assetResponse.status,
    statusText: assetResponse.statusText,
    headers,
  });
};

export const storefrontWorker = {
  async fetch(request: Request, env: StoreBlinkWorkerEnv): Promise<Response> {
    const url = new URL(request.url);
    const hostname = normalizeHostname(url.hostname);
    if (url.pathname === "/.storeblink/internal/seo/rollback") {
      if (request.method !== "POST") return new Response("Method not allowed", { status: 405 });
      return internalSeoRollback(request, env);
    }
    if (url.pathname === "/.storeblink/internal/adaptive-rollouts/evaluate") {
      return handleAdaptiveRolloutEvaluation(request, env);
    }
    if (url.pathname === "/.storeblink/internal/adaptive-compiler/compile") {
      return handleAdaptiveCompilerRequest(request, env);
    }
    if (url.pathname === "/.storeblink/internal/adaptive-publication/publish-reviewed") {
      return handleAdaptiveReviewedPublicationRequest(request, env);
    }
    const platformSeoMatch = PLATFORM_HOSTS.has(hostname)
      ? url.pathname.match(/^\/store\/([^/]+)(\/(?:robots\.txt|sitemap\.xml|[a-f0-9]{32}\.txt|sitemap_(?:pages|products|collections|blogs)_\d+\.xml))$/)
      : null;
    const seoPath = platformSeoMatch?.[2] ?? (isSeoFilePath(url.pathname) ? url.pathname : null);
    if (seoPath && (request.method === "GET" || request.method === "HEAD")) {
      const rateLimited = await enforceSeoRateLimit(request, env, hostname);
      if (rateLimited) return rateLimited;
      const manifestKey = platformSeoMatch
        ? `store:${safeDecodeURIComponent(platformSeoMatch[1])}`
        : `host:${hostname}`;
      const manifest = await loadSeoRouteManifest(env, manifestKey);
      if (manifest) {
        const requestedBase = platformSeoMatch
          ? `https://${hostname}/store/${safeDecodeURIComponent(platformSeoMatch[1])}`
          : `https://${hostname}`;
        if (manifest.canonicalOrigin !== requestedBase) {
          return new Response(null, {
            status: 301,
            headers: {
              Location: `${manifest.canonicalOrigin}${seoPath}`,
              "Cache-Control": "public, max-age=300, s-maxage=3600",
            },
          });
        }
        const compiled = await serveCompiledSeoArtifact(request, env, manifest, seoPath);
        if (compiled) return compiled;
        return new Response("SEO resource not found", {
          status: 404,
          headers: { "Content-Type": "text/plain; charset=utf-8" },
        });
      }
      if (!platformSeoMatch) {
        const resolved = await resolveMissingManifestSeoRoute(request, env, seoPath);
        if (resolved) return resolved;
      }
      return new Response("SEO resource is being prepared", {
        status: 503,
        headers: {
          "Content-Type": "text/plain; charset=utf-8",
          "Cache-Control": "no-store",
          "Retry-After": "300",
        },
      });
    }
    if (!isCustomStorefrontHost(hostname)) {
      const match = url.pathname.match(/^\/store\/([^/]+)(\/.*)?$/);
      if (!match) return env.ASSETS.fetch(request);
      const storeHandle = safeDecodeURIComponent(match[1]);
      if (!/^[a-z0-9][a-z0-9-]{0,62}$/.test(storeHandle)) return env.ASSETS.fetch(request);
      const path = !match[2] || match[2] === "/home" ? "/" : match[2];
      return serveStorefrontHtml(request, env, { storeHandle, path });
    }

    return serveStorefrontHtml(request, env);
  },

  async scheduled(
    _controller: unknown,
    env: StoreBlinkWorkerEnv,
    context: WorkerExecutionContext,
  ): Promise<void> {
    context.waitUntil(
      (async () => {
        const result = await compileClaimedSitemaps(env);
        console.log("Sitemap compiler sweep completed", result);
        const incidents = await reportOverdueSitemaps(env);
        if (incidents.length) {
          const incidentContext = {
            count: incidents.length,
            storeIds: incidents.map((incident) => incident.storeId),
            oldestAgeHours: Math.max(...incidents.map((incident) => incident.ageHours)),
          };
          console.error("SEO_SITEMAP_STALE", incidentContext);
          Sentry.captureMessage("SEO sitemap regeneration is overdue", {
            level: "error",
            contexts: { sitemap: incidentContext },
          });
        }
      })(),
    );
  },
};

const safeDecodeURIComponent = (value: string): string => {
  try {
    return decodeURIComponent(value);
  } catch {
    return "";
  }
};

export default Sentry.withSentry(
  (env: StoreBlinkWorkerEnv) => ({
    dsn: env.SENTRY_DSN,
    enabled: Boolean(env.SENTRY_DSN),
    environment: env.SENTRY_ENVIRONMENT ?? "production",
    sendDefaultPii: false,
    tracesSampleRate: 0,
  }),
  storefrontWorker,
);
