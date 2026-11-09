import type { ThemeManifest } from "@/theme-engine/contracts";
import previewImage from "./assets/spark-hero.webp";
import { sparkFashionHomePreset } from "./presets";
import { sparkFashionTokens } from "./tokens";

const contentSections = [
  "editorial-intro",
  "immersive-product-hero",
  "featured-product-collection",
  "image-with-text",
  "video-banner",
  "customer-stories",
  "promotional-marquee",
  "rich-text",
] as const;

export const sparkFashionThemeManifest: ThemeManifest = {
  id: "spark-fashion",
  name: "Spark Fashion",
  version: "1.0.0",
  schemaVersion: 1,
  minimumPlatformVersion: "1.0.0",
  description:
    "A vivid editorial fashion storefront with live catalog cards, conversion-ready actions and responsive campaign storytelling.",
  previewImage,
  category: ["Fashion", "Apparel", "Lifestyle"],
  designStyle: ["Editorial", "Vibrant", "Contemporary", "Bold"],
  family: "editorial",
  capabilities: {
    stickyHeader: true,
    transparentHeader: false,
    megaMenu: false,
    predictiveSearch: true,
    cartDrawer: true,
    productHotspots: false,
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
  designTokens: sparkFashionTokens,
  templates: [
    {
      key: "home-default",
      name: "Fashion home",
      pageType: "home",
      defaultSections: sparkFashionHomePreset,
      allowedSectionTypes: ["site-header", ...contentSections, "site-footer"],
      requiredSectionTypes: ["site-header", "site-footer"],
      removable: false,
      maximumSections: 24,
    },
    {
      key: "product-default",
      name: "Product",
      pageType: "product",
      allowedSectionTypes: ["site-header", "immersive-product-hero", "featured-product-collection", "site-footer"],
      requiredSectionTypes: ["site-header", "site-footer"],
      removable: false,
    },
    {
      key: "collection-default",
      name: "Products",
      pageType: "collection",
      allowedSectionTypes: ["site-header", "featured-product-collection", "site-footer"],
      requiredSectionTypes: ["site-header", "site-footer"],
      removable: false,
    },
    {
      key: "page-default",
      name: "Page",
      pageType: "page",
      allowedSectionTypes: ["site-header", "rich-text", "image-with-text", "site-footer"],
      requiredSectionTypes: ["site-header", "site-footer"],
      removable: false,
    },
  ],
  features: [
    "predictive-search",
    "cart-drawer",
    "product-quick-view",
    "quick-add",
    "product-filters",
    "color-swatches",
  ],
  editor: { catalogOrder: 6, badge: "New" },
  globalSettingsSchema: [
    {
      key: "primaryColor",
      type: "color",
      label: "Brand accent",
      defaultValue: sparkFashionTokens.colors.primary,
      mode: "simple",
    },
    {
      key: "headingFont",
      type: "font",
      label: "Display typeface",
      defaultValue: sparkFashionTokens.typography.headingFont,
      mode: "advanced",
    },
    {
      key: "sectionSpacing",
      type: "responsive",
      label: "Section spacing",
      defaultValue: { base: 92, tablet: 72, mobile: 56 },
      responsive: true,
      mode: "advanced",
    },
  ],
};

export default sparkFashionThemeManifest;
