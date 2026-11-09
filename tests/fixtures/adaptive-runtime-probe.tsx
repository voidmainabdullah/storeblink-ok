import { createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import type { StorefrontResourceType } from "../../src/adaptive-commerce/contracts";
import { StorefrontCompiler } from "../../src/adaptive-commerce/compiler";
import { createBuiltInAdaptiveCommerceCatalog } from "../../src/adaptive-commerce/fixtures";
import type { AdaptiveQaFixture } from "../../src/adaptive-commerce/qa";
import { AdaptiveStorefrontRuntime } from "../../src/adaptive-commerce/runtime/rendering";

let activeRoot: Root | null = null;

const imageData = (width: number, height: number): string =>
  `data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='${width}' height='${height}'%3E%3Crect width='100%25' height='100%25' fill='%23e8e5dc'/%3E%3C/svg%3E`;

const MEDIA = Object.freeze({
  portrait: imageData(900, 1_100),
  landscape: imageData(1_200, 800),
  ultrawide: imageData(1_600, 500),
});

const defaultFixture = (direction: "ltr" | "rtl"): AdaptiveQaFixture => ({
  id: `baseline-${direction}`,
  locale: direction === "rtl" ? "ar" : "de-DE",
  direction,
  productCount: 1,
  titleLength: "huge",
  priceMagnitude: "huge",
  media: "portrait",
  navigationItems: 18,
});

export type AdaptiveRuntimeProbeInput = Readonly<{
  resourceType: StorefrontResourceType;
  direction?: "ltr" | "rtl";
  fixture?: AdaptiveQaFixture;
}>;

export const mountAdaptiveRuntimeProbe = async (input: AdaptiveRuntimeProbeInput) => {
  const fixture = input.fixture ?? defaultFixture(input.direction ?? "ltr");
  const direction = fixture.direction;
  activeRoot?.unmount();
  document.documentElement.dir = direction;
  document.documentElement.lang = fixture.locale;
  document.body.replaceChildren();

  const catalog = createBuiltInAdaptiveCommerceCatalog();
  const storeDefinition = structuredClone(catalog.storeDefinition);
  storeDefinition.locale = fixture.locale;
  const artifact = new StorefrontCompiler().compile({
    registry: catalog.registry,
    storeDefinition,
    createdAt: "2030-01-02T03:04:05.000Z",
  }).artifact;
  const productImage = fixture.media === "missing" ? null : MEDIA[fixture.media];
  const products = Array.from({ length: fixture.productCount }, (_, index) => ({
    id: `product-${index + 1}`,
    handle: `product-${index + 1}`,
    name: index === 0
      ? fixture.titleLength === "tiny"
        ? "A"
        : direction === "rtl"
          ? "منتج طويل للغاية مصنوع بعناية مع وصف توضيحي للشاشات الصغيرة"
          : "Außergewöhnlich langes handgefertigtes Produkt mit einer erklärenden Bezeichnung für kleine Bildschirme"
      : `Product ${index + 1}`,
    description: "Durable, responsibly made, and described with enough detail to stress intrinsic layout behavior.",
    category: "Collection",
    image_url: productImage,
    images: index === 0 && productImage ? [productImage, productImage] : [],
    price_cents: index === 0
      ? fixture.priceMagnitude === "huge" ? 12_599_999 : 100
      : 8_900 + index,
    original_price_cents: null,
    stock: 12,
  }));
  const navigation = Array.from({ length: fixture.navigationItems }, (_, index) => ({
    id: `navigation-${index}`,
    label: direction === "rtl" ? `قسم المتجر الطويل ${index + 1}` : `Store section ${index + 1}`,
    href: `/section-${index + 1}`,
  }));
  const host = document.createElement("div");
  host.id = "adaptive-runtime-probe";
  document.body.append(host);
  activeRoot = createRoot(host);
  activeRoot.render(createElement(
    MemoryRouter,
    { initialEntries: ["/"] },
    createElement(AdaptiveStorefrontRuntime, {
      artifact,
      resourceType: input.resourceType,
      storeName: direction === "rtl" ? "متجر ستوربلينك" : "StoreBlink Atelier",
      bannerUrl: productImage,
      products,
      currentProduct: products[0],
      collectionTitle: direction === "rtl" ? "مجموعة يومية طويلة الاسم" : "Everyday collection with a long title",
      page: {
        title: direction === "rtl" ? "قصتنا مع التصميم المسؤول" : "Unsere Geschichte und verantwortungsvolles Design",
        body: Array.from({ length: 12 }, () => "Long-form merchant content must wrap naturally without clipping, overlap, or horizontal page overflow.").join("\n\n"),
      },
      searchQuery: direction === "rtl" ? "منتج" : "produkt",
      cart: {
        quantities: input.resourceType === "cart" ? { "product-1": 2, "product-2": 1 } : {},
        count: input.resourceType === "cart" ? 3 : 0,
        add: () => undefined,
        checkout: () => undefined,
        increment: () => undefined,
        decrement: () => undefined,
        remove: () => undefined,
      },
      navigation,
      homeHref: "/",
      productsHref: "/products",
      cartHref: "/cart",
      searchHref: "/search",
      productHref: (product: { handle?: string | null; id: string }) => `/products/${product.handle || product.id}`,
    }),
  ));

  await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
  const storefront = document.querySelector<HTMLElement>(".sb-adaptive-storefront");
  const touchTargets = [...document.querySelectorAll<HTMLElement>(
    ".sb-adaptive-button, .sb-adaptive-cart-link, .sb-adaptive-navigation a, .sb-adaptive-footer nav a, button, input",
  )].filter((element) => {
    const style = getComputedStyle(element);
    return style.display !== "none" && style.visibility !== "hidden";
  });
  const targetRects = touchTargets.map((element) => element.getBoundingClientRect());
  const productCards = [...document.querySelectorAll<HTMLElement>(".sb-adaptive-product-card")]
    .map((element) => element.getBoundingClientRect());
  const collisionCount = productCards.slice(1).filter((rect, index) => {
    const previous = productCards[index];
    return rect.left < previous.right - 0.5 && rect.right > previous.left + 0.5 &&
      rect.top < previous.bottom - 0.5 && rect.bottom > previous.top + 0.5;
  }).length;
  const clippedMediaCount = [...document.querySelectorAll<HTMLElement>(".sb-adaptive-product-media")]
    .filter((media) => {
      const image = media.querySelector("img");
      if (!image) return false;
      const outer = media.getBoundingClientRect();
      const inner = image.getBoundingClientRect();
      return inner.left < outer.left - 1 || inner.right > outer.right + 1 ||
        inner.top < outer.top - 1 || inner.bottom > outer.bottom + 1;
    }).length;
  const textOverflowCount = [...document.querySelectorAll<HTMLElement>("main h1,main h2,main h3,main p,main button,main label")]
    .filter((element) => element.scrollWidth > element.clientWidth + 1).length;
  const requiredCommerceControl = input.resourceType === "product"
    ? Boolean(document.querySelector(".sb-adaptive-product-information .sb-adaptive-button"))
    : input.resourceType === "cart"
      ? Boolean(document.querySelector(".sb-adaptive-cart .sb-adaptive-button"))
      : input.resourceType === "search"
        ? Boolean(document.querySelector(".sb-adaptive-search input, .sb-adaptive-search button"))
        : true;
  return {
    error: document.querySelector<HTMLElement>("[role='alert']")?.textContent ?? null,
    h1Count: storefront?.querySelectorAll("h1").length ?? 0,
    documentScrollWidth: document.documentElement.scrollWidth,
    viewportWidth: document.documentElement.clientWidth,
    minimumTouchWidth: targetRects.length ? Math.min(...targetRects.map((rect) => rect.width)) : 0,
    minimumTouchHeight: targetRects.length ? Math.min(...targetRects.map((rect) => rect.height)) : 0,
    sectionCount: storefront?.querySelectorAll("main section, main article").length ?? 0,
    direction: storefront ? getComputedStyle(storefront).direction : "missing",
    collisionCount,
    clippedMediaCount,
    textOverflowCount,
    requiredCommerceControl,
  };
};
