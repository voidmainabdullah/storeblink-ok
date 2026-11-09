import { describe, expect, it } from "vitest";
import { SitemapEligibilityService } from "./SitemapEligibility";
import type { SeoCompileResource } from "../types";

const service = new SitemapEligibilityService();
const base: SeoCompileResource = {
  resourceType: "product",
  resourceId: "watch",
  route: "/products/watch",
  title: "Watch",
  status: "published",
  private: false,
  redirecting: false,
  publicContentUpdatedAt: "2026-08-13T00:00:00.000Z",
  indexing: "index_follow",
  canonicalMode: "automatic",
  customCanonicalUrl: null,
  customMetaTags: [],
  alternates: [],
};

const evaluate = (resource: Partial<SeoCompileResource> = {}, storeStatus = "published") =>
  service.evaluate({ ...base, ...resource }, {
    storeStatus,
    canonicalOrigin: "https://shop.example.com",
  });

describe("SitemapEligibilityService", () => {
  it.each([
    [{}, "draft", "store_draft"],
    [{ status: "draft" }, "published", "resource_draft"],
    [{ status: "archived" }, "published", "resource_archived"],
    [{ indexing: "noindex_follow" }, "published", "noindex"],
    [{ redirecting: true }, "published", "redirect"],
    [{ private: true }, "published", "private"],
    [{ canonicalMode: "custom", customCanonicalUrl: "https://other.example.com/watch" }, "published", "wrong_domain"],
    [{ canonicalMode: "custom", customCanonicalUrl: "https://shop.example.com/products/other" }, "published", "canonical_mismatch"],
    [{ route: "products/watch" }, "published", "invalid_route"],
    [{ publicContentUpdatedAt: "not-a-date" }, "published", "invalid_lastmod"],
  ] as const)("excludes resources for %j", (resource, storeStatus, reason) => {
    expect(evaluate(resource, storeStatus)).toEqual({ included: false, reason });
  });

  it("includes a self-canonical published primary-domain URL", () => {
    expect(evaluate()).toMatchObject({
      included: true,
      entry: { location: "https://shop.example.com/products/watch" },
    });
  });

  it("normalizes a trailing slash on a custom self-canonical homepage", () => {
    expect(evaluate({
      resourceType: "system_page",
      resourceId: "home",
      route: "/",
      canonicalMode: "custom",
      customCanonicalUrl: "https://shop.example.com/",
    })).toMatchObject({
      included: true,
      entry: { location: "https://shop.example.com" },
    });
  });

  it("resolves a new primary domain without modifying the resource", () => {
    const moved = service.evaluate(base, {
      storeStatus: "published",
      canonicalOrigin: "https://new.example.com",
    });
    expect(moved).toMatchObject({
      included: true,
      entry: { location: "https://new.example.com/products/watch" },
    });
  });
});
