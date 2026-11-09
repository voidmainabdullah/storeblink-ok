export type AdaptiveQaFixture = Readonly<{
  id: string;
  locale: string;
  direction: "ltr" | "rtl";
  productCount: 1 | 500;
  titleLength: "tiny" | "huge";
  priceMagnitude: "tiny" | "huge";
  media: "missing" | "portrait" | "landscape" | "ultrawide";
  navigationItems: 3 | 18;
}>;

/**
 * Deterministic pairwise-style adversarial set. Every boundary value appears
 * multiple times without expanding into an unbounded Cartesian product.
 */
export const ADAPTIVE_QA_FIXTURES: readonly AdaptiveQaFixture[] = Object.freeze([
  { id: "single-missing", locale: "en", direction: "ltr", productCount: 1, titleLength: "tiny", priceMagnitude: "tiny", media: "missing", navigationItems: 3 },
  { id: "single-portrait-long", locale: "de", direction: "ltr", productCount: 1, titleLength: "huge", priceMagnitude: "huge", media: "portrait", navigationItems: 18 },
  { id: "catalog-landscape-long", locale: "en", direction: "ltr", productCount: 500, titleLength: "huge", priceMagnitude: "tiny", media: "landscape", navigationItems: 3 },
  { id: "catalog-ultrawide-nav", locale: "de", direction: "ltr", productCount: 500, titleLength: "tiny", priceMagnitude: "huge", media: "ultrawide", navigationItems: 18 },
  { id: "rtl-single-landscape", locale: "ar", direction: "rtl", productCount: 1, titleLength: "huge", priceMagnitude: "tiny", media: "landscape", navigationItems: 18 },
  { id: "rtl-catalog-missing", locale: "ar", direction: "rtl", productCount: 500, titleLength: "tiny", priceMagnitude: "huge", media: "missing", navigationItems: 3 },
  { id: "rtl-catalog-portrait", locale: "ar", direction: "rtl", productCount: 500, titleLength: "huge", priceMagnitude: "huge", media: "portrait", navigationItems: 18 },
  { id: "german-single-ultrawide", locale: "de", direction: "ltr", productCount: 1, titleLength: "huge", priceMagnitude: "tiny", media: "ultrawide", navigationItems: 3 },
]);

