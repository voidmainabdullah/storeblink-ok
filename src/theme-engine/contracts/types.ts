import type { ComponentType, ReactNode } from "react";
import type { SceneNode, SceneTree } from "@/types";

export const CANONICAL_SECTION_TYPES = [
  "announcement-marquee",
  "site-header",
  "editorial-intro",
  "immersive-product-hero",
  "brand-story",
  "craftsmanship-features",
  "featured-product-collection",
  "customer-stories",
  "site-footer",
  "image-with-text",
  "rich-text",
  "product-grid",
  "featured-collection",
  "collection-list",
  "testimonial-grid",
  "newsletter",
  "faq",
  "logo-list",
  "video-banner",
  "promotional-marquee",
] as const;

export type CanonicalSectionType = (typeof CANONICAL_SECTION_TYPES)[number];

export type ThemePageType =
  | "home"
  | "product"
  | "collection"
  | "page"
  | "contact"
  | "faq"
  | "search"
  | "cart"
  | "404";

export type ResponsiveValue<T> = {
  base: T;
  tablet?: T;
  mobile?: T;
};

export type ThemeSettingCondition = {
  setting: string;
  equals: unknown;
};

export type ThemeSettingDefinition = {
  key: string;
  type:
    | "text"
    | "textarea"
    | "rich-text"
    | "number"
    | "range"
    | "select"
    | "switch"
    | "color"
    | "color-scheme"
    | "image"
    | "video"
    | "link"
    | "menu"
    | "product"
    | "collection"
    | "font"
    | "alignment"
    | "spacing"
    | "responsive";
  label: string;
  description?: string;
  defaultValue?: unknown;
  options?: Array<{ label: string; value: string | number | boolean }>;
  visibleWhen?: ThemeSettingCondition;
  responsive?: boolean;
  mode?: "simple" | "advanced";
};

export type ThemeCapabilities = {
  stickyHeader: boolean;
  transparentHeader: boolean;
  megaMenu: boolean;
  predictiveSearch: boolean;
  cartDrawer: boolean;
  productHotspots: boolean;
  productQuickView: boolean;
  quickAdd: boolean;
  collectionFilters: boolean;
  collectionSorting: boolean;
  customerAccountDrawer: boolean;
  appBlocks: boolean;
  editorialTypography: boolean;
  productCompare: boolean;
  stickyAddToCart: boolean;
  productFilters: boolean;
  colorSwatches: boolean;
  customerDrawer: boolean;
  announcementSlider: boolean;
};

export type ThemeDesignTokens = {
  colors: {
    background: string;
    surface: string;
    surfaceInverse: string;
    text: string;
    textMuted: string;
    textInverse: string;
    primary: string;
    onPrimary: string;
    border: string;
    borderStrong: string;
  };
  typography: {
    headingFont: string;
    bodyFont: string;
    editorialFont: string;
    scale: Record<string, string>;
  };
  spacing: Record<string, string>;
  radii: {
    none: string;
    small: string;
    medium: string;
    pill: string;
  };
  containers: {
    narrow: string;
    standard: string;
    wide: string;
    full: string;
  };
  motion: {
    fast: string;
    normal: string;
    slow: string;
    easing: string;
  };
};

export type ThemeTemplateDefinition = {
  key: string;
  name: string;
  pageType: ThemePageType | string;
  defaultSections?: ThemeSectionPreset[];
  allowedSectionTypes: Array<CanonicalSectionType | string>;
  requiredSectionTypes?: Array<CanonicalSectionType | string>;
  removable: boolean;
  maximumSections?: number;
};

export type ThemeSectionPreset = {
  id: string;
  type: CanonicalSectionType;
  settings: Record<string, unknown>;
  blocks?: Array<{
    id: string;
    type: string;
    settings: Record<string, unknown>;
  }>;
};

export type ThemeManifest = {
  id: string;
  name: string;
  description: string;
  version: string;
  schemaVersion: number;
  minimumPlatformVersion: string;
  previewImage?: string;
  category?: string[];
  designStyle?: string[];
  family?: string;
  capabilities: ThemeCapabilities;
  designTokens?: ThemeDesignTokens;
  templates: ThemeTemplateDefinition[];
  features: string[];
  globalSettingsSchema?: ThemeSettingDefinition[];
  editor?: {
    catalogOrder?: number;
    badge?: string;
  };
};

export type StorefrontBlock = {
  id: string;
  type: string;
  settings: Record<string, unknown>;
};

export type StorefrontSection<TSettings = Record<string, unknown>> = {
  id: string;
  type: CanonicalSectionType;
  schemaVersion: number;
  settings: TSettings;
  blockOrder: string[];
  blocks: Record<string, StorefrontBlock>;
  dataSource?: Record<string, unknown>;
  visibility: {
    desktop: boolean;
    tablet: boolean;
    mobile: boolean;
  };
  customName?: string;
  createdAt: string;
  updatedAt: string;
};

export type ThemeSectionRendererProps = {
  node: SceneNode;
  children: ReactNode;
  tokens: ThemeDesignTokens;
  mode: "editor" | "storefront";
  validationIssues?: string[];
};

export type ThemeSectionRenderer = ComponentType<ThemeSectionRendererProps>;

export type ThemePackage = {
  manifest: ThemeManifest;
  sectionRenderers: Partial<Record<CanonicalSectionType, ThemeSectionRenderer>>;
  featureRenderers?: Record<string, ComponentType<Record<string, unknown>>>;
  createScene?: (profile: Record<string, unknown>, products: unknown[]) => SceneTree;
  reconcileScene?: (
    scene: SceneTree,
    profile: Record<string, unknown>,
    products: unknown[],
  ) => SceneTree;
};

export type ResolvedThemeFeature = {
  id: string;
  enabled: boolean;
  sourceThemeId: string;
};

export type ThemeInstallation = {
  id: string;
  storeId: string;
  themeId: string;
  themeVersion: string;
  schemaVersion: number;
  status: "draft" | "active" | "archived";
  globalSettings: Record<string, unknown>;
  featureSettings: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
  publishedAt?: string;
};

export type ThemeTemplateDocument = {
  id: string;
  storeId: string;
  themeInstallationId: string;
  templateKey: string;
  document: SceneTree;
  revision: number;
  createdAt: string;
  updatedAt: string;
};
