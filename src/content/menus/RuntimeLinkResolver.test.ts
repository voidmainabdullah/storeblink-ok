import { describe, expect, it } from "vitest";
import { legacyNavigationTarget, resolveMenuTarget } from "./RuntimeLinkResolver";

const context = {
  storeSlug: "demo-store",
  pages: new Map([
    ["about", { id: "about", handle: "our-story", status: "published" as const }],
    ["deleted", { id: "deleted", handle: "gone", status: "hidden" as const }],
  ]),
  products: new Map([
    ["product-1", { id: "product-1", handle: "black-shirt", status: "active" as const }],
  ]),
};

describe("RuntimeLinkResolver", () => {
  it("resolves entity IDs through their current handles", () => {
    expect(resolveMenuTarget({ type: "page", entityId: "about" }, context).href)
      .toBe("/store/demo-store/pages/our-story");
    expect(resolveMenuTarget({ type: "product", entityId: "product-1" }, context).href)
      .toBe("/store/demo-store/products/black-shirt");
  });

  it("hides broken destinations instead of emitting dead links", () => {
    const result = resolveMenuTarget({ type: "page", entityId: "deleted" }, context);
    expect(result).toMatchObject({ href: null, broken: true, hidden: true });
  });

  it("rejects unsafe external protocols", () => {
    expect(resolveMenuTarget({ type: "external", value: "javascript:alert(1)" }, context))
      .toMatchObject({ href: null, broken: true, hidden: true });
  });

  it("adapts legacy scene navigation values", () => {
    expect(legacyNavigationTarget("products")).toEqual({
      type: "route",
      routeKey: "products",
    });
    expect(legacyNavigationTarget("/pages/lookbook")).toEqual({ type: "page", entityId: "lookbook" });
  });
});
