import { afterEach, describe, expect, it, vi } from "vitest";
import {
  compileClaimedSitemaps,
  reportOverdueSitemaps,
  rollbackCompiledSitemap,
  type R2BucketLike,
  type SeoRuntimeEnv,
} from "../../../worker/seo-runtime";

const storeId = "11111111-1111-4111-8111-111111111111";
const generationId = "22222222-2222-4222-8222-222222222222";

const snapshot = {
  store: {
    id: storeId,
    name: "Acme",
    handle: "acme",
    status: "published",
    primaryHostname: "shop.example.com",
    canonicalOrigin: "https://shop.example.com",
  },
  resources: [{
    resourceType: "system_page",
    resourceId: "home",
    route: "/",
    title: "Home",
    status: "published",
    private: false,
    redirecting: false,
    publicContentUpdatedAt: "2026-08-13T00:00:00.000Z",
    indexing: "index_follow",
    canonicalMode: "automatic",
    customCanonicalUrl: null,
    alternates: [],
  }],
  activeGenerationId: null,
  dirtyVersion: 1,
  indexNow: { key: "indexnowkey1", keyLocationPath: "/indexnow-key.txt", enabled: false },
};

const memoryR2 = () => {
  const objects = new Map<string, string>();
  const bucket: R2BucketLike = {
    async get(key) {
      const value = objects.get(key);
      return value === undefined ? null : {
        body: new Response(value).body!,
        text: async () => value,
      };
    },
    async put(key, value) { objects.set(key, value); },
    async delete(key) { objects.delete(key); },
  };
  return { bucket, objects };
};

const runtimeEnv = (bucket: R2BucketLike): SeoRuntimeEnv => ({
  SEO_ARTIFACTS: bucket,
  SEO_ORCHESTRATOR_ENDPOINT: "https://project.supabase.co/functions/v1/domain-orchestrator",
  DOMAIN_CRON_SECRET: "compiler-secret",
});

describe("SEO Worker generation runtime", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("compiles immutable artifacts and switches the route manifest only after validation", async () => {
    const { bucket, objects } = memoryR2();
    const actions: string[] = [];
    vi.stubGlobal("fetch", vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
      const action = String(body.action);
      actions.push(action);
      if (action === "seo-compiler-claim") {
        return Response.json({ data: [{
          storeId,
          generationId,
          storagePrefix: `stores/${storeId}/generations/1`,
          snapshot,
        }] });
      }
      return Response.json({ data: { ok: true } });
    }));

    const result = await compileClaimedSitemaps(runtimeEnv(bucket), 1);

    expect(result).toEqual({ claimed: 1, completed: 1, failed: 0 });
    expect(actions).toContain("seo-compiler-activate");
    expect(objects.get(`stores/${storeId}/generations/1/sitemap.xml`)).toContain("<sitemapindex");
    const manifest = JSON.parse(objects.get("routes/host%3Ashop.example.com.json")!) as {
      generationId: string;
    };
    expect(manifest.generationId).toBe(generationId);
  });

  it("reports malformed claimed snapshots instead of leaving the compile lease stuck", async () => {
    const { bucket } = memoryR2();
    const actions: string[] = [];
    vi.stubGlobal("fetch", vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
      const action = String(body.action);
      actions.push(action);
      if (action === "seo-compiler-claim") {
        return Response.json({ data: [{
          storeId,
          generationId,
          storagePrefix: `stores/${storeId}/generations/2`,
          snapshot: { invalid: true },
        }] });
      }
      return Response.json({ data: { failed: true } });
    }));

    const result = await compileClaimedSitemaps(runtimeEnv(bucket), 1);

    expect(result).toEqual({ claimed: 1, completed: 0, failed: 1 });
    expect(actions).toEqual(["seo-compiler-claim", "seo-compiler-fail"]);
  });

  it("restores the previous public manifest when a rollback commit fails", async () => {
    const { bucket, objects } = memoryR2();
    const routeKey = "routes/host%3Ashop.example.com.json";
    const targetSitemap = `stores/${storeId}/generations/1/sitemap.xml`;
    objects.set(routeKey, JSON.stringify({ version: 1, generationId: "new-generation" }));
    objects.set(targetSitemap, "<?xml version=\"1.0\"?><sitemapindex></sitemapindex>");
    vi.stubGlobal("fetch", vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
      if (body.action === "seo-compiler-rollback-prepare") {
        return Response.json({ data: {
          storeId,
          storeHandle: "acme",
          generationId,
          canonicalOrigin: "https://shop.example.com",
          hostname: "shop.example.com",
          files: { "/sitemap.xml": targetSitemap },
        } });
      }
      return Response.json({ error: { message: "commit failed" } }, { status: 500 });
    }));

    await expect(rollbackCompiledSitemap(runtimeEnv(bucket), storeId, generationId))
      .rejects.toThrow("commit failed");
    expect(JSON.parse(objects.get(routeKey)!).generationId).toBe("new-generation");
  });

  it("loads overdue sitemap incidents through the authenticated compiler channel", async () => {
    const { bucket } = memoryR2();
    vi.stubGlobal("fetch", vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
      expect(body.action).toBe("seo-health-check");
      return Response.json({ data: [{
        storeId,
        dirtySince: "2026-08-11T00:00:00.000Z",
        dirtyVersion: 4,
        dirtySegments: ["products"],
        ageHours: 48,
        lastCompiledAt: "2026-08-10T00:00:00.000Z",
        lastFailureAt: null,
        lastFailureCode: null,
        lastFailureMessage: null,
      }] });
    }));

    await expect(reportOverdueSitemaps(runtimeEnv(bucket))).resolves.toMatchObject([
      { storeId, ageHours: 48, dirtySegments: ["products"] },
    ]);
  });

  it("submits only changed resource URLs to IndexNow for an incremental generation", async () => {
    const { bucket } = memoryR2();
    const submitted: string[][] = [];
    const incrementalSnapshot = {
      ...snapshot,
      resources: [
        ...snapshot.resources,
        {
          ...snapshot.resources[0],
          resourceType: "product",
          resourceId: "watch",
          route: "/products/watch",
          title: "Watch",
        },
      ],
      indexNow: {
        key: "indexnowkey1",
        keyLocationPath: "/indexnow-key.txt",
        enabled: true,
        fullRefresh: false,
        resourceKeys: ["product:watch"],
      },
    };
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(String(input));
      const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
      if (url.hostname === "api.indexnow.org") {
        submitted.push(body.urlList as string[]);
        return new Response(null, { status: 202 });
      }
      if (body.action === "seo-compiler-claim") {
        return Response.json({ data: [{
          storeId,
          generationId,
          storagePrefix: `stores/${storeId}/generations/3`,
          snapshot: incrementalSnapshot,
        }] });
      }
      return Response.json({ data: { ok: true } });
    }));

    await expect(compileClaimedSitemaps(runtimeEnv(bucket), 1)).resolves.toMatchObject({
      completed: 1,
      failed: 0,
    });
    expect(submitted).toEqual([["https://shop.example.com/products/watch"]]);
  });

  it("removes the obsolete primary-host route during an atomic domain switch", async () => {
    const { bucket, objects } = memoryR2();
    const oldManifest = {
      version: 1,
      storeId,
      storeHandle: "acme",
      generationId: "00000000-0000-4000-8000-000000000099",
      canonicalOrigin: "https://old.example.com",
      hostname: "old.example.com",
      files: { "/sitemap.xml": "stores/old/sitemap.xml" },
      activatedAt: "2026-08-12T00:00:00.000Z",
    };
    objects.set("routes/store%3Aacme.json", JSON.stringify(oldManifest));
    objects.set("routes/host%3Aold.example.com.json", JSON.stringify(oldManifest));
    vi.stubGlobal("fetch", vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
      if (body.action === "seo-compiler-claim") {
        return Response.json({ data: [{
          storeId,
          generationId,
          storagePrefix: `stores/${storeId}/generations/4`,
          snapshot,
        }] });
      }
      return Response.json({ data: { ok: true } });
    }));

    await compileClaimedSitemaps(runtimeEnv(bucket), 1);

    expect(objects.has("routes/host%3Aold.example.com.json")).toBe(false);
    expect(objects.has("routes/host%3Ashop.example.com.json")).toBe(true);
  });
});
