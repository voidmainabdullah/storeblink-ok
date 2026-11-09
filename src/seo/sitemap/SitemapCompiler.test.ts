import { describe, expect, it } from "vitest";
import { SitemapCompiler } from "./SitemapCompiler";
import { SitemapValidator } from "./SitemapValidator";
import type { SeoCompileResource, SeoCompileSnapshot } from "../types";

const resource = (index: number, type: SeoCompileResource["resourceType"] = "product"): SeoCompileResource => ({
  resourceType: type,
  resourceId: String(index),
  route: type === "product" ? `/products/item-${index}` : index === 0 ? "/" : `/pages/page-${index}`,
  title: `Item ${index}`,
  status: "published",
  private: false,
  redirecting: false,
  publicContentUpdatedAt: "2026-08-13T10:00:00.000Z",
  indexing: "index_follow",
  canonicalMode: "automatic",
  customCanonicalUrl: null,
  customMetaTags: [],
  alternates: [],
});

const snapshot = (resources: readonly SeoCompileResource[]): SeoCompileSnapshot => ({
  store: {
    id: "store-1",
    name: "Store & Co",
    handle: "store",
    status: "published",
    primaryHostname: "shop.example.com",
    canonicalOrigin: "https://shop.example.com",
  },
  resources,
  activeGenerationId: null,
  dirtyVersion: 1,
});

describe("SitemapCompiler", () => {
  it("compiles escaped XML and a valid sitemap index", async () => {
    const compiled = await new SitemapCompiler().compile(snapshot([
      { ...resource(0, "system_page"), title: "Home & More" },
      resource(1),
    ]), { storagePrefix: "stores/store-1/generations/1" });

    expect(compiled.urlCount).toBe(2);
    expect(compiled.sitemapXml).toContain("sitemap_pages_1.xml");
    expect(compiled.sitemapXml).toContain("sitemap_products_1.xml");
    expect(compiled.segments.find((segment) => segment.type === "pages")?.xml)
      .toContain("https://shop.example.com</loc>");
    expect(new SitemapValidator().validate(compiled)).toEqual({ valid: true, issues: [] });
  });

  it("segments a synthetic 50,001-product catalog at the 25,000 URL boundary", async () => {
    const resources = Array.from({ length: 50_001 }, (_, index) => resource(index));
    const compiled = await new SitemapCompiler().compile(snapshot(resources), {
      storagePrefix: "stores/store-1/generations/2",
    });
    expect(compiled.segments.map((segment) => segment.urlCount)).toEqual([25_000, 25_000, 1]);
    expect(compiled.urlCount).toBe(50_001);
    expect(new SitemapValidator().validate(compiled).valid).toBe(true);
  }, 30_000);

  it("uses the platform store base path when no custom domain is active", async () => {
    const platformSnapshot: SeoCompileSnapshot = {
      ...snapshot([resource(0, "system_page"), resource(1)]),
      store: {
        ...snapshot([]).store,
        primaryHostname: "storeblink.com",
        canonicalOrigin: "https://storeblink.com/store/my-shop",
      },
    };
    const compiled = await new SitemapCompiler().compile(platformSnapshot, {
      storagePrefix: "stores/store-1/generations/3",
    });
    expect(compiled.eligibleUrls).toContain("https://storeblink.com/store/my-shop/products/item-1");
    expect(compiled.segments[0]?.publicUrl).toContain("/store/my-shop/sitemap_");
  });

  it("rejects structurally invalid XML before activation", async () => {
    const compiled = await new SitemapCompiler().compile(snapshot([resource(0, "system_page")]), {
      storagePrefix: "stores/store-1/generations/invalid",
    });
    const invalid = {
      ...compiled,
      segments: compiled.segments.map((segment, index) => index === 0
        ? { ...segment, xml: segment.xml.replace("</urlset>", "</urlset-broken>") }
        : segment),
    };

    expect(new SitemapValidator().validate(invalid).issues).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: "INVALID_XML" })]),
    );
  });
});
