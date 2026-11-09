import type {
  BlueprintSectionReference,
  CommerceBinding,
  GlobalRegionReference,
  JsonValue,
  StorefrontResourceType,
  TemplateBlueprint,
} from "@/adaptive-commerce";
import { semanticPathSchema } from "../contracts/identifiers";
import { templateBlueprintSchema } from "../contracts/templateBlueprint";
import { artifactHashFor } from "../compiler/sha256";

const value = (kind: string, extra: Record<string, JsonValue> = {}): JsonValue => ({
  kind,
  ...extra,
});

const section = (
  path: string,
  componentId: string,
  variantId: string,
  properties: Record<string, JsonValue>,
  slots: Record<string, JsonValue>,
  bindingIds: string[] = [],
): BlueprintSectionReference => ({
  path: semanticPathSchema.parse(path),
  componentId,
  variantId,
  properties,
  slots: Object.entries(slots).map(([slotId, slotValue]) => ({
    slotId,
    value: slotValue,
  })),
  bindingIds,
});

const binding = (
  id: string,
  source: CommerceBinding["source"],
  field: string,
  path: string,
  property: CommerceBinding["target"]["property"],
  required = false,
  fallback?: JsonValue,
): CommerceBinding => ({
  id,
  source,
  field,
  target: { path: semanticPathSchema.parse(path), property },
  required,
  ...(fallback === undefined ? {} : { fallback }),
});

const globalBindings = (): CommerceBinding[] => [
  binding("store-name", { kind: "store" }, "name", "global.header", "text", true),
  binding("primary-navigation", { kind: "store" }, "navigation.primary", "global.header", "items", true, []),
  binding("cart-count", { kind: "cart" }, "count", "global.header", "label", false, "0"),
  binding("footer-store-name", { kind: "store" }, "name", "global.footer", "text", true),
  binding("footer-navigation", { kind: "store" }, "navigation.footer", "global.footer", "items", false, []),
];

const globalRegions = (): GlobalRegionReference[] => [
  {
    slot: "header",
    path: semanticPathSchema.parse("global.header"),
    componentId: "site-header",
    variantId: "standard",
    properties: {
      "navigation-label": "Primary navigation",
      sticky: true,
    },
    slots: [
      { slotId: "logo", value: value("store-logo", { alt: "Store logo" }) },
      { slotId: "navigation", value: value("menu", { id: "primary" }) },
      { slotId: "actions", value: value("commerce-actions") },
    ],
    bindingIds: ["store-name", "primary-navigation", "cart-count"],
  },
  {
    slot: "footer",
    path: semanticPathSchema.parse("global.footer"),
    componentId: "site-footer",
    variantId: "columns",
    properties: { "navigation-label": "Footer navigation" },
    slots: [
      { slotId: "brand", value: value("store-brand") },
      { slotId: "navigation", value: value("menu", { id: "footer" }) },
      { slotId: "legal", value: value("legal-links") },
    ],
    bindingIds: ["footer-store-name", "footer-navigation"],
  },
];

type BlueprintInput = Readonly<{
  id: string;
  name: string;
  resourceType: StorefrontResourceType;
  sections: BlueprintSectionReference[];
  bindings?: CommerceBinding[];
}>;

const createBlueprint = (input: BlueprintInput): TemplateBlueprint => {
  const payload = {
    kind: "template-blueprint" as const,
    id: input.id,
    version: "1.0.0",
    schemaVersion: 1,
    name: input.name,
    resourceType: input.resourceType,
    extends: null,
    sections: input.sections,
    globalRegions: globalRegions(),
    bindings: [...globalBindings(), ...(input.bindings ?? [])],
    compositionPatches: [],
    requiredCapabilities: ["commerce-bindings", "responsive-layout"],
  };
  return templateBlueprintSchema.parse({
    ...payload,
    integrity: artifactHashFor(payload),
  });
};

export const HOME_BLUEPRINT = createBlueprint({
  id: "storeblink-home",
  name: "StoreBlink home",
  resourceType: "home",
  sections: [
    section(
      "home.hero",
      "hero",
      "split",
      {
        heading: "A storefront built around your brand",
        description: "Discover products chosen with care.",
        alignment: "start",
      },
      {
        content: value("hero-copy"),
        actions: value("primary-action", { label: "Shop products" }),
        media: value("hero-media", { alt: "Featured store collection" }),
      },
      ["home-store-name"],
    ),
    section(
      "home.featured-products",
      "product-grid",
      "grid",
      {
        heading: "Featured products",
        "empty-message": "New products are coming soon.",
      },
      {
        heading: value("heading"),
        products: value("bound-product-list"),
      },
      ["featured-products"],
    ),
  ],
  bindings: [
    binding("home-store-name", { kind: "store" }, "name", "home.hero", "text", true),
    binding("featured-products", { kind: "collection", selector: "featured" }, "products", "home.featured-products", "items", false, []),
  ],
});

export const PRODUCT_BLUEPRINT = createBlueprint({
  id: "storeblink-product",
  name: "StoreBlink product",
  resourceType: "product",
  sections: [
    section(
      "product.gallery",
      "product-gallery",
      "stacked",
      { label: "Product media" },
      {
        media: value("bound-product-media", { alt: "Product image" }),
        thumbnails: value("bound-product-thumbnails"),
      },
      ["current-product-media"],
    ),
    section(
      "product.information",
      "product-information",
      "standard",
      { heading: "Product information" },
      {
        title: value("bound-title"),
        price: value("bound-price"),
        variants: value("bound-variants"),
        "purchase-actions": value("purchase-actions"),
        "extra-content": value("merchant-content"),
      },
      [
        "current-product-title",
        "current-product-price",
        "current-product-inventory",
        "current-product-variant",
      ],
    ),
    section(
      "product.recommendations",
      "recommendations",
      "grid",
      { heading: "You may also like" },
      { heading: value("heading"), products: value("bound-product-list") },
      ["recommended-products"],
    ),
  ],
  bindings: [
    binding("current-product-media", { kind: "product", selector: "current" }, "media", "product.gallery", "media", true),
    binding("current-product-title", { kind: "product", selector: "current" }, "title", "product.information", "text", true),
    binding("current-product-price", { kind: "product", selector: "current" }, "price", "product.information", "price", true),
    binding("current-product-inventory", { kind: "product", selector: "current" }, "inventory", "product.information", "inventory", true),
    binding("current-product-variant", { kind: "product", selector: "current" }, "selectedVariant", "product.information", "variant", false),
    binding("recommended-products", { kind: "collection", selector: "recommendations" }, "products", "product.recommendations", "items", false, []),
  ],
});

export const COLLECTION_BLUEPRINT = createBlueprint({
  id: "storeblink-collection",
  name: "StoreBlink collection",
  resourceType: "collection",
  sections: [
    section(
      "collection.products",
      "collection-grid",
      "standard",
      { heading: "Collection", "empty-message": "No products match this collection." },
      {
        intro: value("bound-collection-intro"),
        filters: value("collection-controls"),
        products: value("bound-product-list"),
      },
      ["current-collection-title", "current-collection-products"],
    ),
  ],
  bindings: [
    binding("current-collection-title", { kind: "collection", selector: "current" }, "title", "collection.products", "text", true),
    binding("current-collection-products", { kind: "collection", selector: "current" }, "products", "collection.products", "items", true),
  ],
});

export const PAGE_BLUEPRINT = createBlueprint({
  id: "storeblink-page",
  name: "StoreBlink page",
  resourceType: "page",
  sections: [
    section(
      "page.content",
      "rich-text",
      "article",
      { heading: "Page" },
      {
        heading: value("bound-page-title"),
        body: value("bound-page-body"),
      },
      ["current-page-title", "current-page-body"],
    ),
  ],
  bindings: [
    binding("current-page-title", { kind: "page", selector: "current" }, "title", "page.content", "label", true),
    binding("current-page-body", { kind: "page", selector: "current" }, "body", "page.content", "text", true),
  ],
});

export const BLOG_BLUEPRINT = createBlueprint({
  id: "storeblink-blog",
  name: "StoreBlink blog article",
  resourceType: "blog",
  sections: [
    section(
      "blog.article",
      "blog-article",
      "editorial",
      { heading: "Article" },
      {
        title: value("bound-page-title"),
        metadata: value("article-metadata"),
        body: value("bound-page-body"),
        media: value("article-media", { alt: "Article feature image" }),
      },
      ["blog-current-page-title", "blog-current-page-body"],
    ),
  ],
  bindings: [
    binding("blog-current-page-title", { kind: "page", selector: "current" }, "title", "blog.article", "label", true),
    binding("blog-current-page-body", { kind: "page", selector: "current" }, "body", "blog.article", "text", true),
  ],
});

export const CART_BLUEPRINT = createBlueprint({
  id: "storeblink-cart",
  name: "StoreBlink cart",
  resourceType: "cart",
  sections: [
    section(
      "cart.main",
      "cart",
      "page",
      { heading: "Your cart", "empty-message": "Your cart is empty." },
      {
        lines: value("bound-cart-lines"),
        summary: value("bound-cart-summary"),
        actions: value("checkout-actions"),
      },
      ["cart-lines", "cart-subtotal"],
    ),
  ],
  bindings: [
    binding("cart-lines", { kind: "cart" }, "lines", "cart.main", "items", true, []),
    binding("cart-subtotal", { kind: "cart" }, "subtotal", "cart.main", "price", true, 0),
  ],
});

export const SEARCH_BLUEPRINT = createBlueprint({
  id: "storeblink-search",
  name: "StoreBlink search",
  resourceType: "search",
  sections: [
    section(
      "search.results",
      "search-results",
      "standard",
      {
        heading: "Search",
        "input-label": "Search products",
        "empty-message": "No results found.",
      },
      {
        input: value("search-input"),
        results: value("bound-search-results"),
        "empty-state": value("empty-state"),
      },
      ["search-query", "search-items"],
    ),
  ],
  bindings: [
    binding("search-query", { kind: "search" }, "query", "search.results", "text", false, ""),
    binding("search-items", { kind: "search" }, "items", "search.results", "items", false, []),
  ],
});

export const NOT_FOUND_BLUEPRINT = createBlueprint({
  id: "storeblink-not-found",
  name: "StoreBlink not found",
  resourceType: "404",
  sections: [
    section(
      "not-found.main",
      "not-found",
      "centered",
      {
        heading: "Page not found",
        message: "The page you requested is unavailable.",
      },
      {
        heading: value("heading"),
        body: value("message"),
        action: value("home-link", { label: "Back to store" }),
      },
    ),
  ],
});

export const BUILT_IN_STOREFRONT_BLUEPRINTS = [
  HOME_BLUEPRINT,
  PRODUCT_BLUEPRINT,
  COLLECTION_BLUEPRINT,
  PAGE_BLUEPRINT,
  BLOG_BLUEPRINT,
  CART_BLUEPRINT,
  SEARCH_BLUEPRINT,
  NOT_FOUND_BLUEPRINT,
] as const;

export const BUILT_IN_BLUEPRINT_BY_RESOURCE = Object.fromEntries(
  BUILT_IN_STOREFRONT_BLUEPRINTS.map((blueprint) => [
    blueprint.resourceType,
    blueprint,
  ]),
) as Record<StorefrontResourceType, TemplateBlueprint>;
