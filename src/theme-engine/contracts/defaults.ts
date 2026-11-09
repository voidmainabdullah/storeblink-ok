import type { ThemeCapabilities, ThemeDesignTokens } from "./types";

export const UNIVERSAL_THEME_CAPABILITIES: ThemeCapabilities = {
  stickyHeader: true,
  transparentHeader: false,
  megaMenu: false,
  predictiveSearch: false,
  cartDrawer: false,
  productHotspots: false,
  productQuickView: false,
  quickAdd: true,
  collectionFilters: true,
  collectionSorting: true,
  customerAccountDrawer: false,
  appBlocks: true,
  editorialTypography: false,
  productCompare: false,
  stickyAddToCart: false,
  productFilters: true,
  colorSwatches: false,
  customerDrawer: false,
  announcementSlider: false,
};

export const UNIVERSAL_THEME_TOKENS: ThemeDesignTokens = {
  colors: {
    background: "#ffffff",
    surface: "#f5f5f5",
    surfaceInverse: "#111111",
    text: "#111111",
    textMuted: "#666666",
    textInverse: "#ffffff",
    primary: "#111111",
    onPrimary: "#ffffff",
    border: "#dedede",
    borderStrong: "#999999",
  },
  typography: {
    headingFont: "Inter, ui-sans-serif, system-ui, sans-serif",
    bodyFont: "Inter, ui-sans-serif, system-ui, sans-serif",
    editorialFont: "Georgia, Times New Roman, serif",
    scale: {
      display: "clamp(2.5rem, 7vw, 7rem)",
      heading: "clamp(2rem, 4vw, 4.5rem)",
      body: "1rem",
      small: "0.8125rem",
    },
  },
  spacing: {
    xs: "0.5rem",
    sm: "1rem",
    md: "1.5rem",
    lg: "3rem",
    xl: "6rem",
  },
  radii: { none: "0", small: "2px", medium: "8px", pill: "999px" },
  containers: { narrow: "720px", standard: "1120px", wide: "1440px", full: "100%" },
  motion: {
    fast: "120ms",
    normal: "220ms",
    slow: "600ms",
    easing: "cubic-bezier(0.22, 1, 0.36, 1)",
  },
};
