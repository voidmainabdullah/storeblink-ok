import { afterEach, describe, expect, it, vi } from "vitest";
import {
  compileClaimedSitemaps,
  loadSeoRouteManifest,
  rollbackCompiledSitemap,
  type R2ObjectLike,
  type SeoRuntimeEnv,
} from "../../../worker/seo-runtime";

class MemoryR2 {
  readonly objects = new Map<string, string>();

  async get(key: string): Promise<R2ObjectLike | null> {
    const value = this.objects.get(key);
    if (value === undefined) return null;
    return {
      body: new Response(value).body!,
      text: async () => value,
      httpMetadata: { contentType: key.endsWith(".xml") ? "application/xml" : "application/json" },
    };
  }

  async put(key: string, value: string): Promise<void> {
    this.objects.set(key, value);
  }

  async delete(key: string): Promise<void> {
    this.objects.delete(key);
  }
}

const storeId = "00000000-0000-4000-8000-000000000001";
const generationId = "00000000-0000-4000-8000-000000000002";
const previousGenerationId = "00000000-0000-4000-8000-000000000003";

const snapshot = {
  dirtyVersion: 1,
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
  activeGenerationId: previousGenerationId,
  indexNow: null,
};

const envFor = (r2: MemoryR2): SeoRuntimeEnv => ({
  SEO_ARTIFACTS: r2,
  SEO_ORCHESTRATOR_ENDPOINT: "https://project.supabase.co/functions/v1/domain-orchestrator",
  DOMAIN_CRON_SECRET: "test-cron-secret",
});

const actionFrom = (init?: RequestInit): string => {
  const body = JSON.parse(String(init?.body ?? "{}")) as { action?: string };
  return body.action ?? "";
};

describe("SEO Worker generation runtime", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("compiles immutable artifacts and switches the public route after activation", async () => {
    const r2 = new MemoryR2();
    const actions: string[] = [];
    vi.stubGlobal("fetch", vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      const action = actionFrom(init);
      actions.push(action);
      if (action === "seo-compiler-claim") {
        return Response.json({ data: [{
          storeId,
          generationId,
          storagePrefix: `stores/${storeId}/generations/1`,
          snapshot,
        }] });
      }
      if (action === "seo-compiler-activate") return Response.json({ data: { active: true } });
      if (action === "seo-compiler-fail") return Response.json({ data: { failed: true } });
      return new Response("unexpected", { status: 500 });
    }));

    const result = await compileClaimedSitemaps(envFor(r2), 1);
    const manifest = await loadSeoRouteManifest(envFor(r2), "host:shop.example.com");

    expect(result).toEqual({ claimed: 1, completed: 1, failed: 0 });
    expect(actions).toEqual(["seo-compiler-claim", "seo-compiler-activate"]);
    expect(manifest?.generationId).toBe(generationId);
    expect(r2.objects.get(manifest!.files["/sitemap.xml"])).toContain("<sitemapindex");
  });

  it("restores the prior route manifest if database activation fails", async () => {
    const r2 = new MemoryR2();
    const routeKey = `routes/${encodeURIComponent("host:shop.example.com")}.json`;
    r2.objects.set(routeKey, JSON.stringify({ version: 1, generationId: previousGenerationId }));
    const actions: string[] = [];
    vi.stubGlobal("fetch", vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      const action = actionFrom(init);
      actions.push(action);
      if (action === "seo-compiler-claim") {
        return Response.json({ data: [{
          storeId,
          generationId,
          storagePrefix: `stores/${storeId}/generations/2`,
          snapshot,
        }] });
      }
      if (action === "seo-compiler-activate") {
        return Response.json({ error: { message: "forced activation failure" } }, { status: 500 });
      }
      if (action === "seo-compiler-fail") return Response.json({ data: { failed: true } });
      return new Response("unexpected", { status: 500 });
    }));

    const result = await compileClaimedSitemaps(envFor(r2), 1);
    const restored = JSON.parse(r2.objects.get(routeKey)!) as { generationId: string };

    expect(result).toEqual({ claimed: 1, completed: 0, failed: 1 });
    expect(restored.generationId).toBe(previousGenerationId);
    expect(actions).toEqual(["seo-compiler-claim", "seo-compiler-activate", "seo-compiler-fail"]);
  });

  it("verifies every rollback artifact before changing the route manifest", async () => {
    const r2 = new MemoryR2();
    const sitemapKey = `stores/${storeId}/generations/1/sitemap.xml`;
    const segmentKey = `stores/${storeId}/generations/1/sitemap_pages_1.xml`;
    r2.objects.set(sitemapKey, "<sitemapindex />");
    r2.objects.set(segmentKey, "<urlset />");
    const actions: string[] = [];
    vi.stubGlobal("fetch", vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      const action = actionFrom(init);
      actions.push(action);
      if (action === "seo-compiler-rollback-prepare") {
        return Response.json({ data: {
          storeId,
          storeHandle: "acme",
          generationId,
          canonicalOrigin: "https://shop.example.com",
          hostname: "shop.example.com",
          files: {
            "/sitemap.xml": sitemapKey,
            "/sitemap_pages_1.xml": segmentKey,
          },
        } });
      }
      if (action === "seo-compiler-rollback-commit") return Response.json({ data: { active: true } });
      return new Response("unexpected", { status: 500 });
    }));

    const manifest = await rollbackCompiledSitemap(envFor(r2), storeId, generationId);
    expect(manifest.generationId).toBe(generationId);
    expect(actions).toEqual(["seo-compiler-rollback-prepare", "seo-compiler-rollback-commit"]);

    r2.objects.delete(segmentKey);
    actions.length = 0;
    await expect(rollbackCompiledSitemap(envFor(r2), storeId, generationId))
      .rejects.toThrow("Rollback artifact is missing");
    expect(actions).toEqual(["seo-compiler-rollback-prepare"]);
  });
});
