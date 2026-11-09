import type {
  CanonicalSectionType,
  ThemeSectionPreset,
} from "@/theme-engine/contracts";

export const atelierDefaultSectionOrder: CanonicalSectionType[] = [
  "announcement-marquee",
  "site-header",
  "editorial-intro",
  "immersive-product-hero",
  "brand-story",
  "craftsmanship-features",
  "featured-product-collection",
  "customer-stories",
  "site-footer",
];

const preset = (
  id: string,
  type: CanonicalSectionType,
  settings: Record<string, unknown>,
): ThemeSectionPreset => ({
  id,
  type,
  settings,
});

export const atelierHomeDefaultPreset: ThemeSectionPreset[] = [
  preset("atelier-announcement", "announcement-marquee", {
    speed: { base: 18, mobile: 24 },
    direction: "left",
    pauseOnHover: true,
  }),
  preset("atelier-header", "site-header", {
    menuId: "main",
    sticky: true,
    showSearch: true,
    showAccount: true,
    showCart: true,
  }),
  preset("atelier-intro", "editorial-intro", {
    alignment: "asymmetric",
  }),
  preset("atelier-product-hero", "immersive-product-hero", {
    imageFocalPoint: { xPercent: 50, yPercent: 48 },
    showHotspot: true,
  }),
  preset("atelier-story", "brand-story", {
    mediaPosition: "left",
  }),
  preset("atelier-craft", "craftsmanship-features", {
    columns: { base: 3, tablet: 2, mobile: 1 },
  }),
  preset("atelier-products", "featured-product-collection", {
    columns: { base: 4, tablet: 2, mobile: 1 },
    productSource: "live-catalog",
  }),
  preset("atelier-stories", "customer-stories", {
    presentation: "editorial-split",
  }),
  preset("atelier-footer", "site-footer", {
    primaryMenuId: "footer",
    showNewsletter: true,
    showSocialLinks: true,
    showContactInformation: true,
  }),
];
