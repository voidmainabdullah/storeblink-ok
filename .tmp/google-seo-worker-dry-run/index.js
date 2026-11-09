const PLATFORM_HOSTS = /* @__PURE__ */ new Set([
  "storeblink.com",
  "www.storeblink.com",
  "origin.storeblink.com",
  "domains.storeblink.com"
]);
const normalizeHostname = (value) => value.trim().toLowerCase().replace(/:\d+$/, "").replace(/\.$/, "");
const isCustomStorefrontHost = (hostname) => Boolean(hostname) && !PLATFORM_HOSTS.has(hostname);
const escapeHtml = (value) => value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
const requireSeoEndpoint = (env) => {
  let endpoint;
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
const fetchSeoResource = async (request, env, resource) => {
  const requestUrl = new URL(request.url);
  const endpoint = requireSeoEndpoint(env);
  endpoint.searchParams.set("resource", resource);
  if (resource === "head") endpoint.searchParams.set("path", requestUrl.pathname);
  const headers = new Headers({
    "x-forwarded-host": requestUrl.hostname,
    "x-storeblink-edge": "storefront-worker"
  });
  const response = await fetch(endpoint, {
    method: request.method === "HEAD" ? "HEAD" : "GET",
    headers,
    redirect: "manual"
  });
  return response;
};
const stripBaseSeo = (html) => html.replace(/<title(?:\s[^>]*)?>[\s\S]*?<\/title>/gi, "").replace(/<meta\s+[^>]*name=["'](?:description|robots|google-site-verification)["'][^>]*>/gi, "").replace(/<meta\s+[^>]*property=["']og:(?:title|description|type|url|image)["'][^>]*>/gi, "").replace(/<meta\s+[^>]*name=["']twitter:(?:card|title|description|image)["'][^>]*>/gi, "").replace(/<link\s+[^>]*rel=["']canonical["'][^>]*>/gi, "").replace(/<script\s+[^>]*data-storeblink-edge-seo[^>]*>[\s\S]*?<\/script>/gi, "");
const injectStorefrontHead = (html, head) => {
  const cleanHtml = stripBaseSeo(html);
  const imageTags = head.image ? [
    `<meta property="og:image" content="${escapeHtml(head.image)}">`,
    `<meta name="twitter:image" content="${escapeHtml(head.image)}">`
  ] : [];
  const verificationTag = head.googleSiteVerification ? `<meta name="google-site-verification" content="${escapeHtml(head.googleSiteVerification)}">` : "";
  const structuredData = JSON.stringify(head.structuredData).replace(/</g, "\\u003c");
  const tags = [
    `<title>${escapeHtml(head.title)}</title>`,
    `<meta name="description" content="${escapeHtml(head.description)}">`,
    `<meta name="robots" content="${escapeHtml(head.robots)}">`,
    `<link rel="canonical" href="${escapeHtml(head.canonicalUrl)}">`,
    `<meta property="og:type" content="website">`,
    `<meta property="og:title" content="${escapeHtml(head.title)}">`,
    `<meta property="og:description" content="${escapeHtml(head.description)}">`,
    `<meta property="og:url" content="${escapeHtml(head.canonicalUrl)}">`,
    `<meta name="twitter:card" content="summary_large_image">`,
    `<meta name="twitter:title" content="${escapeHtml(head.title)}">`,
    `<meta name="twitter:description" content="${escapeHtml(head.description)}">`,
    ...imageTags,
    verificationTag,
    `<script type="application/ld+json" data-storeblink-edge-seo>${structuredData}<\/script>`
  ].filter(Boolean).join("\n    ");
  return cleanHtml.replace(/<\/head>/i, `    ${tags}
  </head>`);
};
const isStorefrontHead = (value) => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const record = value;
  return typeof record.title === "string" && typeof record.description === "string" && typeof record.canonicalUrl === "string" && typeof record.robots === "string" && (record.image === null || typeof record.image === "string") && (record.googleSiteVerification === null || typeof record.googleSiteVerification === "string") && Boolean(record.structuredData) && typeof record.structuredData === "object";
};
const storefrontWorker = {
  async fetch(request, env) {
    const url = new URL(request.url);
    const hostname = normalizeHostname(url.hostname);
    if (!isCustomStorefrontHost(hostname)) return env.ASSETS.fetch(request);
    if (url.pathname === "/robots.txt" || url.pathname === "/sitemap.xml") {
      try {
        return await fetchSeoResource(
          request,
          env,
          url.pathname === "/robots.txt" ? "robots" : "sitemap"
        );
      } catch {
        return new Response("SEO resource temporarily unavailable", {
          status: 503,
          headers: {
            "Content-Type": "text/plain; charset=utf-8",
            "Retry-After": "60"
          }
        });
      }
    }
    const assetPromise = env.ASSETS.fetch(request);
    if (request.method !== "GET") return assetPromise;
    const acceptsHtml = (request.headers.get("accept") ?? "").includes("text/html") || request.headers.get("sec-fetch-dest") === "document";
    if (!acceptsHtml) return assetPromise;
    const [assetResponse, headResponse] = await Promise.all([
      assetPromise,
      fetchSeoResource(request, env, "head").catch(() => null)
    ]);
    if (headResponse && headResponse.status >= 300 && headResponse.status < 400) {
      return headResponse;
    }
    const contentType = assetResponse.headers.get("content-type") ?? "";
    if (!headResponse?.ok || !contentType.includes("text/html")) return assetResponse;
    let head;
    try {
      head = await headResponse.json();
    } catch {
      return assetResponse;
    }
    if (!isStorefrontHead(head)) return assetResponse;
    const body = injectStorefrontHead(await assetResponse.text(), head);
    const headers = new Headers(assetResponse.headers);
    headers.delete("Content-Length");
    headers.delete("ETag");
    headers.set("X-StoreBlink-SEO", "edge");
    return new Response(body, {
      status: assetResponse.status,
      statusText: assetResponse.statusText,
      headers
    });
  }
};
const workerEntry = storefrontWorker ?? {};
export {
  workerEntry as default,
  storefrontWorker
};
