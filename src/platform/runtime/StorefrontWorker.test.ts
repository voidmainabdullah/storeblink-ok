import { afterEach, describe, expect, it, vi } from "vitest";
import { storefrontWorker, type StoreBlinkWorkerEnv } from "../../../worker/index";
import type { R2ObjectLike } from "../../../worker/seo-runtime";

const storefrontHead = {
  httpStatus: 200 as const,
  title: "Product | Acme",
  description: "A product description.",
  canonicalUrl: "https://shop.example.com/products/watch",
  robots: "index,follow,max-image-preview:large",
  image: "https://cdn.example.com/watch.jpg",
  socialTitle: "Acme Watch",
  socialDescription: "The social product description.",
  socialImage: "https://cdn.example.com/watch-social.jpg",
  customMetaTags: [{ attribute: "name", key: "author", content: "Acme" }],
  alternates: [{ locale: "en-GB", url: "https://shop.example.com/products/watch" }],
  googleSiteVerification: "verification-token",
  structuredData: { "@context": "https://schema.org", "@type": "Product", name: "Watch" },
};

const stream = (value: string) => new Response(value).body!;

const memoryR2 = (objects: Record<string, string>) => ({
  get: vi.fn(async (key: string): Promise<R2ObjectLike | null> => {
    const value = objects[key];
    return value === undefined ? null : {
      body: stream(value),
      text: async () => value,
      httpEtag: `"${key}"`,
    };
  }),
  put: vi.fn(async () => undefined),
  delete: vi.fn(async () => undefined),
});

const routeKey = (key: string) => `routes/${encodeURIComponent(key)}.json`;

const env = (
  asset: Response,
  options: Partial<StoreBlinkWorkerEnv> = {},
): StoreBlinkWorkerEnv => ({
  ASSETS: { fetch: vi.fn(async () => asset.clone()) },
  STOREFRONT_SEO_ENDPOINT: "https://project.supabase.co/functions/v1/storefront-seo",
  ...options,
});

describe("storefront Worker SEO routing", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("passes non-store platform traffic directly to static assets", async () => {
    const providerFetch = vi.fn();
    vi.stubGlobal("fetch", providerFetch);
    const response = await storefrontWorker.fetch(
      new Request("https://storeblink.com/dashboard"),
      env(new Response("platform")),
    );

    expect(await response.text()).toBe("platform");
    expect(providerFetch).not.toHaveBeenCalled();
  });

  it("serves robots and sitemap files from the active immutable R2 manifest", async () => {
    const indexNowPath = "/0123456789abcdef0123456789abcdef.txt";
    const manifest = {
      version: 1,
      storeId: "00000000-0000-4000-8000-000000000001",
      storeHandle: "acme",
      generationId: "00000000-0000-4000-8000-000000000002",
      canonicalOrigin: "https://shop.example.com",
      hostname: "shop.example.com",
      files: {
        "/sitemap.xml": "stores/acme/g1/sitemap.xml",
        [indexNowPath]: "stores/acme/g1/indexnow-key.txt",
      },
      activatedAt: "2026-08-13T00:00:00.000Z",
    };
    const r2 = memoryR2({
      [routeKey("host:shop.example.com")]: JSON.stringify(manifest),
      "stores/acme/g1/sitemap.xml": "<?xml version=\"1.0\"?><sitemapindex />",
      "stores/acme/g1/indexnow-key.txt": "0123456789abcdef0123456789abcdef",
    });
    vi.stubGlobal("fetch", vi.fn());

    const sitemap = await storefrontWorker.fetch(
      new Request("https://shop.example.com/sitemap.xml"),
      env(new Response("asset"), { SEO_ARTIFACTS: r2 }),
    );
    const robots = await storefrontWorker.fetch(
      new Request("https://shop.example.com/robots.txt"),
      env(new Response("asset"), { SEO_ARTIFACTS: r2 }),
    );
    const indexNowKey = await storefrontWorker.fetch(
      new Request(`https://shop.example.com${indexNowPath}`),
      env(new Response("asset"), { SEO_ARTIFACTS: r2 }),
    );

    expect(await sitemap.text()).toContain("<sitemapindex");
    expect(sitemap.headers.get("Content-Type")).toContain("application/xml");
    expect(sitemap.headers.get("X-StoreBlink-Sitemap-Generation")).toBe(manifest.generationId);
    expect(await robots.text()).toContain("Sitemap: https://shop.example.com/sitemap.xml");
    expect(await indexNowKey.text()).toBe("0123456789abcdef0123456789abcdef");
    expect(indexNowKey.headers.get("Content-Type")).toContain("text/plain");
    expect(fetch).not.toHaveBeenCalled();
  });

  it("returns retryable unavailable instead of dynamically generating XML", async () => {
    const providerFetch = vi.fn(async () => new Response(
      "Compiled sitemap artifacts are served by the StoreBlink storefront edge.",
      { status: 503 },
    ));
    vi.stubGlobal("fetch", providerFetch);
    const response = await storefrontWorker.fetch(
      new Request("https://shop.example.com/sitemap.xml"),
      env(new Response("asset")),
    );

    expect(response.status).toBe(503);
    expect(response.headers.get("Retry-After")).toBe("300");
    expect(providerFetch).toHaveBeenCalledTimes(1);
  });

  it("redirects a secondary-domain SEO route to the primary hostname", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(null, {
      status: 301,
      headers: { Location: "https://primary.example.com/sitemap.xml" },
    })));
    const response = await storefrontWorker.fetch(
      new Request("https://secondary.example.com/sitemap_products_2.xml"),
      env(new Response("asset")),
    );

    expect(response.status).toBe(301);
    expect(response.headers.get("Location")).toBe(
      "https://primary.example.com/sitemap_products_2.xml",
    );
  });

  it("injects registry metadata and only sanitized custom tags", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify(storefrontHead), {
      headers: { "Content-Type": "application/json" },
    })));
    const asset = new Response(
      '<!doctype html><html><head><title>Platform</title><meta name="description" content="platform"></head><body><div id="root"></div></body></html>',
      { headers: { "Content-Type": "text/html; charset=utf-8", ETag: "old" } },
    );
    const response = await storefrontWorker.fetch(
      new Request("https://shop.example.com/products/watch"),
      env(asset),
    );
    const html = await response.text();

    expect(html).toContain('<title data-storeblink-edge-seo="title">Product | Acme</title>');
    expect(html).toContain('name="storeblink:edge-route" content="/products/watch"');
    expect(html).toContain('property="og:title" content="Acme Watch"');
    expect(html).toContain('data-storeblink-edge-custom name="author" content="Acme"');
    expect(html).toContain('rel="alternate" hreflang="en-GB"');
    expect(html).toContain('name="google-site-verification" content="verification-token"');
    expect(html.match(/name="description"/g)).toHaveLength(1);
    expect(response.headers.get("X-StoreBlink-SEO")).toBe("edge");
    expect(response.headers.has("ETag")).toBe(false);
  });

  it("preserves a not-found status while serving the storefront shell", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({
      ...storefrontHead,
      httpStatus: 404,
      title: "Page not found | Acme",
      robots: "noindex,nofollow",
    })));
    const response = await storefrontWorker.fetch(
      new Request("https://shop.example.com/missing"),
      env(new Response("<html><head></head><body></body></html>", {
        headers: { "Content-Type": "text/html" },
      })),
    );

    expect(response.status).toBe(404);
    expect(await response.text()).toContain("noindex,nofollow");
  });

  it("injects the same metadata path for platform /store/:handle pages", async () => {
    const providerFetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(String(input));
      expect(url.searchParams.get("storeHandle")).toBe("acme");
      expect(url.searchParams.get("path")).toBe("/products/watch");
      return new Response(JSON.stringify({
        ...storefrontHead,
        canonicalUrl: "https://storeblink.com/store/acme/products/watch",
      }), { headers: { "Content-Type": "application/json" } });
    });
    vi.stubGlobal("fetch", providerFetch);
    const response = await storefrontWorker.fetch(
      new Request("https://storeblink.com/store/acme/products/watch"),
      env(new Response("<html><head></head><body></body></html>", {
        headers: { "Content-Type": "text/html" },
      })),
    );

    expect(await response.text()).toContain("https://storeblink.com/store/acme/products/watch");
  });

  it("rejects an unsafe canonical returned by the metadata provider", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({
      ...storefrontHead,
      canonicalUrl: "javascript:alert(1)",
    })));
    const baseHtml = "<html><head><title>Safe shell</title></head><body></body></html>";
    const response = await storefrontWorker.fetch(
      new Request("https://shop.example.com/products/watch"),
      env(new Response(baseHtml, { headers: { "Content-Type": "text/html" } })),
    );

    expect(await response.text()).toBe(baseHtml);
    expect(response.headers.get("X-StoreBlink-SEO")).toBeNull();
  });

  it("rate limits public SEO resources by host and client", async () => {
    const limiter = { limit: vi.fn(async () => ({ success: false })) };
    const response = await storefrontWorker.fetch(
      new Request("https://shop.example.com/sitemap.xml", {
        headers: { "CF-Connecting-IP": "203.0.113.10" },
      }),
      env(new Response("asset"), { SEO_RATE_LIMITER: limiter }),
    );

    expect(response.status).toBe(429);
    expect(limiter.limit).toHaveBeenCalledWith({ key: "shop.example.com:203.0.113.10" });
  });

  it("does not request SEO metadata for file-like static assets", async () => {
    const providerFetch = vi.fn();
    vi.stubGlobal("fetch", providerFetch);
    const response = await storefrontWorker.fetch(
      new Request("https://shop.example.com/assets/storefront.js"),
      env(new Response("asset", { headers: { "Content-Type": "text/javascript" } })),
    );

    expect(await response.text()).toBe("asset");
    expect(providerFetch).not.toHaveBeenCalled();
  });
});
