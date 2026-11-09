import type { CanonicalSectionType, ThemeSectionPreset } from "@/theme-engine/contracts";

export const sparkFashionDefaultSectionOrder: CanonicalSectionType[] = [
  "site-header",
  "immersive-product-hero",
  "promotional-marquee",
  "editorial-intro",
  "featured-product-collection",
  "image-with-text",
  "video-banner",
  "customer-stories",
  "site-footer",
];

const preset = (
  id: string,
  type: CanonicalSectionType,
  settings: Record<string, unknown>,
): ThemeSectionPreset => ({ id, type, settings });

export const sparkFashionHomePreset: ThemeSectionPreset[] = [
  preset("spark-header", "site-header", {
    menuId: "main",
    sticky: true,
    showSearch: true,
    showAccount: true,
    showCart: true,
  }),
  preset("spark-hero", "immersive-product-hero", {
    imageFocalPoint: { xPercent: 66, yPercent: 44 },
  }),
  preset("spark-categories", "promotional-marquee", {
    pauseOnHover: true,
  }),
  preset("spark-intro", "editorial-intro", { alignment: "left" }),
  preset("spark-products", "featured-product-collection", {
    columns: { base: 3, tablet: 2, mobile: 1 },
    productSource: "live-catalog",
  }),
  preset("spark-editorial", "image-with-text", { mediaPosition: "left" }),
  preset("spark-campaign", "video-banner", { mediaType: "image" }),
  preset("spark-story", "customer-stories", { presentation: "editorial-mosaic" }),
  preset("spark-footer", "site-footer", {
    primaryMenuId: "footer",
    showNewsletter: false,
    showSocialLinks: true,
  }),
];
