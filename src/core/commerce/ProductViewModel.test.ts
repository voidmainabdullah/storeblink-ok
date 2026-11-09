import { describe, expect, it } from "vitest";
import type { StorefrontProduct } from "@/storefront/data-resolvers";
import { createProductCardViewModel } from "./ProductViewModel";

const product = (handle: string): StorefrontProduct => ({
  id: "product-1",
  handle,
  name: "Lumen chair",
  category: "Seating",
  description: "Solid ash lounge chair",
  image_url: "https://images.example/lumen.webp",
  images: [],
  is_published: true,
  price_cents: 125000,
  original_price_cents: 149000,
  stock: 3,
  badge: "New",
  sale_tag: null,
});

describe("createProductCardViewModel", () => {
  it("normalizes catalog data without copying routing behavior into themes", () => {
    const model = createProductCardViewModel(product("lumen-chair"), "north objects");

    expect(model).toMatchObject({
      id: "product-1",
      title: "Lumen chair",
      handle: "lumen-chair",
      url: "/store/north%20objects/products/lumen-chair",
      available: true,
      quickAddSupported: true,
      badges: ["New"],
    });
    expect(model.primaryImage?.alt).toBe("Lumen chair");
    expect(model.compareAtPrice?.amount).toBe(149000);
  });

  it("re-resolves links when a product handle changes", () => {
    const first = createProductCardViewModel(product("lumen-chair"), "north");
    const renamed = createProductCardViewModel(product("lumen-lounge"), "north");

    expect(first.url).toBe("/store/north/products/lumen-chair");
    expect(renamed.url).toBe("/store/north/products/lumen-lounge");
  });
});
