import type { ThemeSectionPreset } from "@/theme-engine/contracts";

export const noirChronoHomePreset: ThemeSectionPreset[] = [
  { id: "noir-header", type: "site-header", settings: { menuId: "main" } },
  { id: "noir-hero", type: "immersive-product-hero", settings: {} },
  {
    id: "noir-products",
    type: "featured-product-collection",
    settings: { productSource: "live-catalog" },
  },
  { id: "noir-collections", type: "featured-product-collection", settings: {} },
  { id: "noir-story", type: "image-with-text", settings: {} },
  { id: "noir-categories", type: "rich-text", settings: {} },
  { id: "noir-footer", type: "site-footer", settings: { primaryMenuId: "footer" } },
];
