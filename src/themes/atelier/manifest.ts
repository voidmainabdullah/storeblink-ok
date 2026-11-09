import type { ThemeManifest } from "@/theme-engine/contracts";
import previewImage from "./assets/atelier-hero.webp";
import { atelierHomeDefaultPreset } from "./presets";
import { atelierTokens } from "./tokens";

const allContentSections = [
  "editorial-intro",
  "immersive-product-hero",
  "brand-story",
  "craftsmanship-features",
  "featured-product-collection",
  "customer-stories",
  "image-with-text",
  "rich-text",
  "newsletter",
] as const;

export const atelierThemeManifest: ThemeManifest = {
  id: "atelier",
  name: "Atelier",
  version: "1.0.0",
  schemaVersion: 1,
  description:
    "An editorial furniture theme with architectural imagery, live product references and refined typography.",
  previewImage,
  category: ["Furniture", "Interior Design", "Lifestyle"],
  designStyle: ["Editorial", "Minimal", "Architectural", "Premium"],
  family: "editorial",
  minimumPlatformVersion: "1.0.0",
  capabilities: {
    stickyHeader: true,
    transparentHeader: false,
    megaMenu: false,
    predictiveSearch: true,
    cartDrawer: true,
    productHotspots: true,
    productQuickView: true,
    quickAdd: true,
    collectionFilters: true,
    collectionSorting: true,
    customerAccountDrawer: true,
    appBlocks: true,
    editorialTypography: true,
    productCompare: false,
    stickyAddToCart: true,
    productFilters: true,
    colorSwatches: true,
    customerDrawer: true,
    announcementSlider: true,
  },
  designTokens: atelierTokens,
  templates: [
    {
      key: "home-default",
      name: "Editorial home",
      pageType: "home",
      defaultSections: atelierHomeDefaultPreset,
      allowedSectionTypes: [
        "announcement-marquee",
        "site-header",
        ...allContentSections,
        "promotional-marquee",
        "site-footer",
      ],
      requiredSectionTypes: ["site-header", "site-footer"],
      removable: false,
      maximumSections: 24,
    },
    {
      key: "product-default",
      name: "Product",
      pageType: "product",
      allowedSectionTypes: [
        "site-header",
        "immersive-product-hero",
        "featured-product-collection",
        "site-footer",
      ],
      requiredSectionTypes: ["site-header", "site-footer"],
      removable: false,
    },
    {
      key: "collection-default",
      name: "Collection",
      pageType: "collection",
      allowedSectionTypes: ["site-header", "featured-product-collection", "site-footer"],
      requiredSectionTypes: ["site-header", "site-footer"],
      removable: false,
    },
    {
      key: "page-default",
      name: "Page",
      pageType: "page",
      allowedSectionTypes: ["site-header", "rich-text", "image-with-text", "newsletter", "site-footer"],
      requiredSectionTypes: ["site-header", "site-footer"],
      removable: false,
    },
  ],
  features: [
    "product-hotspots",
    "product-quick-view",
    "quick-add",
    "predictive-search",
    "cart-drawer",
  ],
  editor: {
    catalogOrder: 10,
    badge: "New",
  },
  globalSettingsSchema: [
    {
      key: "primaryColor",
      type: "color",
      label: "Brand accent",
      defaultValue: atelierTokens.colors.primary,
      mode: "simple",
    },
    {
      key: "headingFont",
      type: "font",
      label: "Display typeface",
      defaultValue: atelierTokens.typography.headingFont,
      mode: "advanced",
    },
    {
      key: "editorialFont",
      type: "font",
      label: "Editorial accent typeface",
      defaultValue: atelierTokens.typography.editorialFont,
      mode: "advanced",
    },
    {
      key: "sectionSpacing",
      type: "responsive",
      label: "Section spacing",
      defaultValue: { base: 128, tablet: 88, mobile: 64 },
      responsive: true,
      mode: "advanced",
    },
  ],
};

export default atelierThemeManifest;
