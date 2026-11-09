import heroImage from "../assets/spark-hero.webp";
import cyanImage from "../assets/spark-cyan.webp";
import coralImage from "../assets/spark-coral.webp";
import violetImage from "../assets/spark-violet.webp";
import {
  productReferenceId,
  synchronizeProductReferenceSubtree,
} from "@/document/dynamic-sources";
import { createDefaultStoreNavigationDocument } from "@/content/menus/NavigationSystem";
import { cloneSceneTree, createSceneNode } from "@/engine/scene-graph";
import { assertValidSceneTreeStructure, validateSceneTree } from "@/engine/validation";
import { themeChromeSystem } from "@/theme-engine/chrome";
import type { CanonicalSectionType } from "@/theme-engine/contracts";
import type { ResponsiveBreakpoint } from "@/stores/responsive.store";
import type { ElementType, SceneNode, SceneTree, StyleData, TransformData } from "@/types";
import { sparkFashionDefaultSectionOrder } from "../presets";
import { sparkFashionTokens } from "../tokens";

type Frame = Pick<TransformData, "x" | "y" | "width" | "height"> & { zIndex?: number };
type Frames = Record<ResponsiveBreakpoint, Frame>;
type NodeInput = {
  id: string;
  type: ElementType;
  name: string;
  frames: Frames;
  props?: Record<string, unknown>;
  fills?: StyleData["fills"];
  strokes?: StyleData["strokes"];
  effects?: StyleData["effects"];
  radius?: number;
  extensions?: Record<string, unknown>;
  visibility?: Partial<Record<ResponsiveBreakpoint, boolean>>;
  responsiveProps?: Partial<Record<ResponsiveBreakpoint, Record<string, unknown>>>;
};

export type SparkFashionStoreProfile = {
  business_name?: string | null;
  store_tagline?: string | null;
  store_about?: string | null;
  store_color?: string | null;
};

export type SparkFashionProductInput = {
  id: string | number;
  name?: string | null;
  image_url?: string | null;
  price_cents?: number | null;
};

const timestamp = 1_787_000_000_000;
const colors = sparkFashionTokens.colors;
const heading = sparkFashionTokens.typography.headingFont;
const body = sparkFashionTokens.typography.bodyFont;
const f = (desktop: Frame, tablet: Frame, mobile: Frame): Frames => ({ desktop, tablet, mobile });
const solid = (color: string): StyleData["fills"] => [{ type: "solid", color }];
const stroke = (color: string, width = 1): StyleData["strokes"] => [{ color, width, style: "solid" }];
const shadow = (color: string): StyleData["effects"] => [
  { type: "shadow", value: { x: 0, y: 18, blur: 46, spread: -28, color } },
];
const transform = (frame: Frame): TransformData => ({
  x: frame.x,
  y: frame.y,
  width: frame.width,
  height: frame.height,
  rotation: 0,
  scaleX: 1,
  scaleY: 1,
  skewX: 0,
  skewY: 0,
  transformOrigin: [0.5, 0.5],
  zIndex: frame.zIndex ?? 0,
});

class SparkFashionSceneBuilder {
  readonly nodes: Record<string, SceneNode> = {};

  add(parentId: string | null, input: NodeInput): SceneNode {
    const desktopVisible = input.visibility?.desktop ?? true;
    const node = createSceneNode({
      id: input.id,
      type: input.type,
      name: input.name,
      props: input.props,
      transform: transform(input.frames.desktop),
      layout: {
        mode: "absolute",
        responsive: {
          desktop: {
            transform: transform(input.frames.desktop),
            props: input.responsiveProps?.desktop,
            meta: { hidden: !desktopVisible, locked: false },
          },
          tablet: {
            transform: transform(input.frames.tablet),
            props: input.responsiveProps?.tablet,
            meta: { hidden: !(input.visibility?.tablet ?? desktopVisible), locked: false },
          },
          mobile: {
            transform: transform(input.frames.mobile),
            props: input.responsiveProps?.mobile,
            meta: { hidden: !(input.visibility?.mobile ?? desktopVisible), locked: false },
          },
        },
      },
      style: {
        fills: input.fills ?? [],
        strokes: input.strokes ?? [],
        effects: input.effects ?? [],
        opacity: 1,
        cornerRadius: input.radius,
      },
      meta: { hidden: !desktopVisible, locked: false },
      extensions: {
        themeId: "spark-fashion",
        selectable: parentId !== null,
        ...input.extensions,
      },
    }, parentId, timestamp);
    this.nodes[node.id] = node;
    if (parentId) this.nodes[parentId]?.childIds.push(node.id);
    return node;
  }
}

const sectionExtensions = (sectionType: CanonicalSectionType) => ({
  editorKind: "section",
  structured: true,
  canonicalSectionType: sectionType,
  sectionType,
  schemaVersion: 1,
  responsiveDefaultsInitialized: true,
});

const blockExtensions = (
  sectionType: CanonicalSectionType,
  blockType: string,
  extras: Record<string, unknown> = {},
) => ({
  editorKind: "block",
  structured: true,
  canonicalSectionType: sectionType,
  sectionType,
  blockType,
  ...extras,
});

const addText = (
  builder: SparkFashionSceneBuilder,
  parentId: string,
  sectionType: CanonicalSectionType,
  id: string,
  name: string,
  text: string,
  frames: Frames,
  fontSize: number,
  options: {
    fontWeight?: number;
    color?: string;
    lineHeight?: number;
    textAlign?: string;
    letterSpacing?: number;
    semanticTag?: string;
    blockType?: string;
    whiteSpace?: "nowrap" | "pre-wrap";
    visibility?: Partial<Record<ResponsiveBreakpoint, boolean>>;
    extensions?: Record<string, unknown>;
    responsiveFontSize?: Partial<Record<ResponsiveBreakpoint, number>>;
  } = {},
) => builder.add(parentId, {
  id,
  type: "text",
  name,
  frames,
  props: {
    text,
    fontSize,
    fontFamily: body,
    fontWeight: options.fontWeight ?? 400,
    color: options.color ?? colors.text,
    lineHeight: options.lineHeight ?? 1.15,
    textAlign: options.textAlign ?? "left",
    letterSpacing: options.letterSpacing ?? 0,
    semanticTag: options.semanticTag,
    whiteSpace: options.whiteSpace,
  },
  visibility: options.visibility,
  responsiveProps: options.responsiveFontSize ? {
    desktop: options.responsiveFontSize.desktop === undefined ? undefined : { fontSize: options.responsiveFontSize.desktop },
    tablet: options.responsiveFontSize.tablet === undefined ? undefined : { fontSize: options.responsiveFontSize.tablet },
    mobile: options.responsiveFontSize.mobile === undefined ? undefined : { fontSize: options.responsiveFontSize.mobile },
  } : undefined,
  extensions: blockExtensions(sectionType, options.blockType ?? "rich-text", options.extensions),
});

const addButton = (
  builder: SparkFashionSceneBuilder,
  parentId: string,
  sectionType: CanonicalSectionType,
  id: string,
  label: string,
  frames: Frames,
  options: {
    background?: string;
    color?: string;
    border?: string;
    radius?: number;
    fontSize?: number;
    navigationTarget?: unknown;
    action?: string;
    blockType?: string;
    extensions?: Record<string, unknown>;
    visibility?: Partial<Record<ResponsiveBreakpoint, boolean>>;
  } = {},
) => builder.add(parentId, {
  id,
  type: "button",
  name: `${label} action`,
  frames,
  radius: options.radius ?? 999,
  props: {
    label,
    text: label,
    background: options.background ?? colors.surfaceInverse,
    color: options.color ?? colors.textInverse,
    border: options.border ?? "0",
    fontFamily: body,
    fontSize: options.fontSize ?? 12,
    fontWeight: 700,
  },
  visibility: options.visibility,
  extensions: blockExtensions(sectionType, options.blockType ?? "button", {
    navigationTarget: options.navigationTarget,
    action: options.action,
    minimumInteractionTarget: 44,
    ...options.extensions,
  }),
});

const addImage = (
  builder: SparkFashionSceneBuilder,
  parentId: string,
  sectionType: CanonicalSectionType,
  id: string,
  name: string,
  src: string | undefined,
  frames: Frames,
  options: {
    radius?: number;
    loading?: "eager" | "lazy";
    objectPosition?: string;
    extensions?: Record<string, unknown>;
  } = {},
) => builder.add(parentId, {
  id,
  type: "image",
  name,
  frames,
  radius: options.radius ?? 14,
  fills: solid("#D9D9D6"),
  props: {
    src,
    alt: name,
    objectFit: "cover",
    objectPosition: options.objectPosition ?? "50% 50%",
    loading: options.loading ?? "lazy",
    uploadHint: "Replace image",
  },
  extensions: blockExtensions(sectionType, "image", {
    replaceable: true,
    ...options.extensions,
  }),
});

const addShape = (
  builder: SparkFashionSceneBuilder,
  parentId: string,
  sectionType: CanonicalSectionType,
  id: string,
  name: string,
  frames: Frames,
  fill: string,
  options: { radius?: number; strokes?: StyleData["strokes"]; effects?: StyleData["effects"] } = {},
) => builder.add(parentId, {
  id,
  type: "shape",
  name,
  frames,
  fills: solid(fill),
  strokes: options.strokes,
  effects: options.effects,
  radius: options.radius,
  extensions: {
    editorKind: "element",
    structured: true,
    canonicalSectionType: sectionType,
    sectionType,
    role: "decoration",
  },
});

const sectionFrames = {
  header: f(
    { x: 0, y: 0, width: 1200, height: 98, zIndex: 100 },
    { x: 0, y: 0, width: 768, height: 86, zIndex: 100 },
    { x: 0, y: 0, width: 390, height: 76, zIndex: 100 },
  ),
  hero: f(
    { x: 0, y: 98, width: 1200, height: 630 },
    { x: 0, y: 86, width: 768, height: 620 },
    { x: 0, y: 76, width: 390, height: 720 },
  ),
  categories: f(
    { x: 0, y: 728, width: 1200, height: 96 },
    { x: 0, y: 706, width: 768, height: 112 },
    { x: 0, y: 796, width: 390, height: 150 },
  ),
  intro: f(
    { x: 0, y: 824, width: 1200, height: 230 },
    { x: 0, y: 818, width: 768, height: 250 },
    { x: 0, y: 946, width: 390, height: 270 },
  ),
  products: f(
    { x: 0, y: 1054, width: 1200, height: 680 },
    { x: 0, y: 1068, width: 768, height: 970 },
    { x: 0, y: 1216, width: 390, height: 1510 },
  ),
  editorial: f(
    { x: 0, y: 1734, width: 1200, height: 700 },
    { x: 0, y: 2038, width: 768, height: 790 },
    { x: 0, y: 2726, width: 390, height: 950 },
  ),
  campaign: f(
    { x: 0, y: 2434, width: 1200, height: 620 },
    { x: 0, y: 2828, width: 768, height: 600 },
    { x: 0, y: 3676, width: 390, height: 530 },
  ),
  story: f(
    { x: 0, y: 3054, width: 1200, height: 780 },
    { x: 0, y: 3428, width: 768, height: 900 },
    { x: 0, y: 4206, width: 390, height: 1060 },
  ),
  footer: f(
    { x: 0, y: 3834, width: 1200, height: 566 },
    { x: 0, y: 4328, width: 768, height: 650 },
    { x: 0, y: 5266, width: 390, height: 850 },
  ),
};

const addHeader = (builder: SparkFashionSceneBuilder, profile: SparkFashionStoreProfile) => {
  const type = "site-header" as const;
  const section = builder.add("spark-root", {
    id: "spark-header",
    type: "section",
    name: "Global site header",
    frames: sectionFrames.header,
    fills: solid(colors.background),
    strokes: stroke(colors.border),
    props: {
      overflow: "visible",
      menuId: "main",
      sticky: true,
      showSearch: true,
      showAccount: true,
      showCart: true,
      desktopLayout: "logo-left",
      mobileLayout: "menu-logo-actions",
    },
    extensions: { ...sectionExtensions(type), globalSectionGroup: "header" },
  });
  addText(builder, section.id, type, "spark-logo", "Store logo", profile.business_name?.trim() || "SPARK", f(
    { x: 34, y: 30, width: 220, height: 34, zIndex: 10 },
    { x: 68, y: 27, width: 190, height: 30, zIndex: 10 },
    { x: 58, y: 23, width: 140, height: 28, zIndex: 10 },
  ), 22, {
    fontWeight: 800,
    letterSpacing: 0.4,
    whiteSpace: "nowrap",
    blockType: "store-logo",
    responsiveFontSize: { tablet: 19, mobile: 17 },
    extensions: {
      dynamicBinding: { source: "store", field: "business_name", target: "text" },
      navigationTarget: { type: "route", routeKey: "home" },
    },
  });

  const links: Array<[string, string, unknown]> = [
    ["home", "Home", { type: "route", routeKey: "home" }],
    ["products", "Products", { type: "route", routeKey: "products" }],
    ["about", "About us", { type: "route", routeKey: "about" }],
    ["contact", "Contact", { type: "route", routeKey: "contact" }],
  ];
  links.forEach(([key, label, target], index) => addButton(
    builder, section.id, type, `spark-nav-${key}`, label,
    f(
      { x: 338 + index * 118, y: 26, width: 108, height: 44, zIndex: 10 },
      { x: 0, y: 0, width: 1, height: 1 },
      { x: 0, y: 0, width: 1, height: 1 },
    ),
    {
      background: "transparent",
      color: colors.text,
      border: "0",
      fontSize: 13,
      navigationTarget: target,
      blockType: "navigation-link",
      visibility: { desktop: true, tablet: false, mobile: false },
      extensions: { navigationSurfaceVisibility: { desktop: true, tablet: false, mobile: false } },
    },
  ));
  addButton(builder, section.id, type, "spark-search", "Search", f(
    { x: 842, y: 26, width: 82, height: 44, zIndex: 10 },
    { x: 548, y: 21, width: 72, height: 44, zIndex: 10 },
    { x: 0, y: 0, width: 1, height: 1 },
  ), {
    background: "transparent", color: colors.text, border: `1px solid ${colors.border}`,
    action: "open-search", blockType: "search-trigger",
    visibility: { desktop: true, tablet: true, mobile: false },
  });
  addButton(builder, section.id, type, "spark-account", "Account", f(
    { x: 934, y: 26, width: 94, height: 44, zIndex: 10 },
    { x: 630, y: 21, width: 58, height: 44, zIndex: 10 },
    { x: 232, y: 16, width: 62, height: 44, zIndex: 10 },
  ), { background: "transparent", color: colors.text, border: "0", action: "open-account", blockType: "account-trigger" });
  addButton(builder, section.id, type, "spark-cart", "Cart (0)", f(
    { x: 1040, y: 26, width: 126, height: 44, zIndex: 10 },
    { x: 690, y: 21, width: 62, height: 44, zIndex: 10 },
    { x: 300, y: 16, width: 74, height: 44, zIndex: 10 },
  ), { background: "transparent", color: colors.text, border: "0", action: "open-cart", blockType: "cart-trigger" });
  addButton(builder, section.id, type, "spark-menu", "Menu", f(
    { x: 0, y: 0, width: 1, height: 1 },
    { x: 16, y: 21, width: 44, height: 44, zIndex: 10 },
    { x: 8, y: 16, width: 44, height: 44, zIndex: 10 },
  ), {
    background: "transparent", color: colors.text, border: `1px solid ${colors.border}`,
    action: "toggle-mobile-menu", blockType: "mobile-menu-trigger",
    visibility: { desktop: false, tablet: true, mobile: true },
  });
  const drawer = builder.add(section.id, {
    id: "spark-mobile-menu",
    type: "container",
    name: "Mobile navigation drawer",
    frames: f(
      { x: 0, y: 0, width: 1, height: 1 },
      { x: 0, y: 86, width: 768, height: 312, zIndex: 100 },
      { x: 0, y: 76, width: 390, height: 312, zIndex: 100 },
    ),
    fills: solid(colors.background),
    strokes: stroke(colors.border),
    effects: shadow("rgba(0,0,0,0.2)"),
    props: { overflow: "hidden" },
    visibility: { desktop: false, tablet: false, mobile: false },
    extensions: blockExtensions(type, "mobile-menu", { runtimeVisibility: "mobile-menu" }),
  });
  links.forEach(([key, label, target], index) => addButton(
    builder, drawer.id, type, `spark-mobile-nav-${key}`, label,
    f(
      { x: 0, y: 0, width: 1, height: 1 },
      { x: 20, y: 16 + index * 68, width: 728, height: 54, zIndex: index + 1 },
      { x: 16, y: 16 + index * 68, width: 358, height: 54, zIndex: index + 1 },
    ),
    {
      background: colors.surface,
      color: colors.text,
      border: "0",
      radius: 8,
      fontSize: 16,
      navigationTarget: target,
      blockType: "navigation-link",
      visibility: { desktop: false, tablet: true, mobile: true },
      extensions: {
        mobileNavigationMirror: true,
        navigationSurfaceVisibility: { desktop: false, tablet: true, mobile: true },
      },
    },
  ));
};

const addHero = (builder: SparkFashionSceneBuilder) => {
  const type = "immersive-product-hero" as const;
  const section = builder.add("spark-root", {
    id: "spark-hero",
    type: "section",
    name: "Fashion campaign hero",
    frames: sectionFrames.hero,
    fills: solid(colors.background),
    props: { overflow: "hidden", colorSchemeId: "orange-campaign" },
    extensions: sectionExtensions(type),
  });
  addImage(builder, section.id, type, "spark-hero-image", "Fashion campaign image", heroImage, f(
    { x: 30, y: 18, width: 1140, height: 590, zIndex: 1 },
    { x: 24, y: 18, width: 720, height: 584, zIndex: 1 },
    { x: 16, y: 12, width: 358, height: 692, zIndex: 1 },
  ), { radius: 14, loading: "eager", objectPosition: "62% 48%" });
  addText(builder, section.id, type, "spark-hero-eyebrow", "Hero eyebrow", "TREND-LED FASHION / NEW EDIT", f(
    { x: 72, y: 112, width: 390, height: 24, zIndex: 4 },
    { x: 56, y: 82, width: 340, height: 22, zIndex: 4 },
    { x: 34, y: 42, width: 320, height: 20, zIndex: 4 },
  ), 12, { color: colors.textInverse, fontWeight: 800, letterSpacing: 1.1, blockType: "eyebrow" });
  addText(builder, section.id, type, "spark-hero-heading", "Hero heading", "We always build stunning fashion experiences.", f(
    { x: 72, y: 154, width: 620, height: 255, zIndex: 4 },
    { x: 56, y: 122, width: 470, height: 220, zIndex: 4 },
    { x: 34, y: 78, width: 320, height: 235, zIndex: 4 },
  ), 66, {
    color: colors.textInverse, fontWeight: 800, lineHeight: 0.98, semanticTag: "h1", blockType: "heading",
    responsiveFontSize: { tablet: 52, mobile: 42 },
  });
  addButton(builder, section.id, type, "spark-hero-shop", "Shop now", f(
    { x: 72, y: 454, width: 132, height: 50, zIndex: 5 },
    { x: 56, y: 388, width: 128, height: 48, zIndex: 5 },
    { x: 34, y: 572, width: 136, height: 48, zIndex: 5 },
  ), { navigationTarget: { type: "route", routeKey: "products" }, blockType: "button" });
  addButton(builder, section.id, type, "spark-hero-trending", "Browse categories", f(
    { x: 218, y: 454, width: 176, height: 50, zIndex: 5 },
    { x: 198, y: 388, width: 170, height: 48, zIndex: 5 },
    { x: 182, y: 572, width: 172, height: 48, zIndex: 5 },
  ), {
    background: "rgba(255,255,255,0.1)", color: colors.textInverse,
    border: "1px solid rgba(255,255,255,0.72)", action: "open-category-menu", blockType: "button",
  });
};

const addCategories = (builder: SparkFashionSceneBuilder) => {
  const type = "promotional-marquee" as const;
  const section = builder.add("spark-root", {
    id: "spark-categories",
    type: "section",
    name: "Shop categories",
    frames: sectionFrames.categories,
    fills: solid(colors.background),
    strokes: stroke(colors.border),
    props: { overflow: "hidden", pauseOnHover: true },
    extensions: sectionExtensions(type),
  });
  ["New arrivals", "Everyday style", "Statement color", "Accessories", "Limited edit"].forEach((label, index) => {
    addButton(builder, section.id, type, `spark-category-${index + 1}`, label, f(
      { x: 30 + index * 228, y: 24, width: 210, height: 48, zIndex: 2 },
      { x: 20 + (index % 3) * 246, y: 18 + Math.floor(index / 3) * 48, width: 224, height: 42, zIndex: 2 },
      { x: 16 + (index % 2) * 181, y: 16 + Math.floor(index / 2) * 42, width: 173, height: 36, zIndex: 2 },
    ), {
      background: index === 0 ? colors.primary : colors.surface,
      color: colors.text,
      border: index === 0 ? "0" : `1px solid ${colors.border}`,
      radius: 999,
      navigationTarget: { type: "route", routeKey: "products" },
      action: "browse-products",
      blockType: "announcement-item",
      extensions: { query: label },
    });
  });
};

const addIntro = (builder: SparkFashionSceneBuilder) => {
  const type = "editorial-intro" as const;
  const section = builder.add("spark-root", {
    id: "spark-intro",
    type: "section",
    name: "Collection introduction",
    frames: sectionFrames.intro,
    fills: solid(colors.background),
    props: { overflow: "hidden" },
    extensions: sectionExtensions(type),
  });
  addText(builder, section.id, type, "spark-intro-heading", "Collection introduction", "Browse a carefully curated edit of expressive clothing and accessories.", f(
    { x: 42, y: 56, width: 900, height: 108, zIndex: 2 },
    { x: 28, y: 48, width: 710, height: 124, zIndex: 2 },
    { x: 20, y: 40, width: 350, height: 146, zIndex: 2 },
  ), 34, { fontWeight: 650, lineHeight: 1.1, semanticTag: "h2", blockType: "heading", responsiveFontSize: { tablet: 31, mobile: 27 } });
  addText(builder, section.id, type, "spark-intro-mark", "Brand mark", "*", f(
    { x: 966, y: 66, width: 54, height: 72, zIndex: 2 },
    { x: 680, y: 148, width: 42, height: 72, zIndex: 2 },
    { x: 20, y: 190, width: 38, height: 72, zIndex: 2 },
  ), 58, { color: colors.primary, fontWeight: 900, blockType: "rich-heading-emphasis" });
};

const productBinding = (productId: string, field: string, target: string, format?: string) => ({
  source: "product",
  productId,
  field,
  target,
  ...(format ? { format } : {}),
});
const safeProductId = (value: string | number) => String(value).replace(/[^a-zA-Z0-9_-]/g, "-");

const addProductCard = (
  builder: SparkFashionSceneBuilder,
  sectionId: string,
  product: SparkFashionProductInput,
  index: number,
) => {
  const type = "featured-product-collection" as const;
  const productId = String(product.id);
  const safeId = safeProductId(product.id);
  const desktopX = 42 + index * 378;
  const tabletX = 28 + (index % 2) * 360;
  const tabletY = 188 + Math.floor(index / 2) * 370;
  const mobileY = 220 + index * 430;
  const card = builder.add(sectionId, {
    id: `spark-product-card-${safeId}`,
    type: "container",
    name: `Product card ${index + 1}`,
    frames: f(
      { x: desktopX, y: 184, width: 350, height: 438, zIndex: 3 },
      { x: tabletX, y: tabletY, width: 340, height: 350, zIndex: 3 },
      { x: 20, y: mobileY, width: 350, height: 398, zIndex: 3 },
    ),
    fills: solid(colors.surface),
    radius: 14,
    effects: shadow("rgba(0,0,0,0.14)"),
    props: { overflow: "hidden", ariaLabel: "View product" },
    extensions: blockExtensions(type, "product-card", { productId }),
  });
  addImage(builder, card.id, type, `spark-product-card-${safeId}-image`, `Product ${index + 1} image`, undefined, f(
    { x: 0, y: 0, width: 350, height: 326, zIndex: 1 },
    { x: 0, y: 0, width: 340, height: 246, zIndex: 1 },
    { x: 0, y: 0, width: 350, height: 286, zIndex: 1 },
  ), {
    radius: 14,
    extensions: { productId, dynamicBinding: productBinding(productId, "image_url", "src") },
  });
  addText(builder, card.id, type, `spark-product-card-${safeId}-title`, `Product ${index + 1} title`, "Product", f(
    { x: 16, y: 342, width: 212, height: 34, zIndex: 3 },
    { x: 14, y: 260, width: 210, height: 30, zIndex: 3 },
    { x: 14, y: 302, width: 220, height: 32, zIndex: 3 },
  ), 17, {
    fontWeight: 700, blockType: "product-reference",
    extensions: { productId, dynamicBinding: productBinding(productId, "name", "text") },
  });
  addText(builder, card.id, type, `spark-product-card-${safeId}-price`, `Product ${index + 1} price`, "Live price", f(
    { x: 16, y: 384, width: 126, height: 24, zIndex: 3 },
    { x: 14, y: 298, width: 120, height: 22, zIndex: 3 },
    { x: 14, y: 344, width: 120, height: 22, zIndex: 3 },
  ), 14, {
    color: colors.primary, fontWeight: 800, blockType: "product-price",
    extensions: { productId, dynamicBinding: productBinding(productId, "price_cents", "text", "currency") },
  });
  addButton(builder, card.id, type, `spark-product-card-${safeId}-cart`, "Add to cart", f(
    { x: 234, y: 366, width: 102, height: 50, zIndex: 4 },
    { x: 224, y: 286, width: 102, height: 48, zIndex: 4 },
    { x: 234, y: 332, width: 102, height: 48, zIndex: 4 },
  ), { action: "add-to-cart", blockType: "product-action", extensions: { productId } });
  synchronizeProductReferenceSubtree(
    { rootNodeId: "spark-root", nodes: builder.nodes },
    card.id,
    productId,
    card.id,
  );
};

const addProducts = (builder: SparkFashionSceneBuilder, products: SparkFashionProductInput[]) => {
  const type = "featured-product-collection" as const;
  const section = builder.add("spark-root", {
    id: "spark-products",
    type: "section",
    name: "New arrivals",
    frames: sectionFrames.products,
    fills: solid(colors.background),
    props: {
      overflow: "hidden",
      source: { type: "all-products" },
      maximumProducts: 3,
      columns: { base: 3, tablet: 2, mobile: 1 },
      showPrice: true,
      showQuickAdd: true,
    },
    extensions: sectionExtensions(type),
  });
  addText(builder, section.id, type, "spark-products-heading", "Products heading", "New arrivals", f(
    { x: 42, y: 72, width: 480, height: 62, zIndex: 2 },
    { x: 28, y: 60, width: 430, height: 58, zIndex: 2 },
    { x: 20, y: 54, width: 260, height: 52, zIndex: 2 },
  ), 42, { fontWeight: 700, semanticTag: "h2", blockType: "heading", responsiveFontSize: { tablet: 38, mobile: 32 } });
  addButton(builder, section.id, type, "spark-products-shop-all", "Shop all", f(
    { x: 1072, y: 68, width: 84, height: 46, zIndex: 4 },
    { x: 642, y: 126, width: 96, height: 46, zIndex: 4 },
    { x: 236, y: 126, width: 134, height: 46, zIndex: 4 },
  ), { navigationTarget: { type: "route", routeKey: "products" }, blockType: "button" });
  const visibleProducts = products.slice(0, 3);
  visibleProducts.forEach((product, index) => addProductCard(builder, section.id, product, index));
  const productCardIds = visibleProducts.map(
    (product) => `spark-product-card-${safeProductId(product.id)}`,
  );
  addButton(builder, section.id, type, "spark-products-categories", "Categories", f(
    { x: 824, y: 68, width: 132, height: 46, zIndex: 4 },
    { x: 416, y: 126, width: 114, height: 46, zIndex: 4 },
    { x: 20, y: 126, width: 104, height: 46, zIndex: 4 },
  ), {
    background: "transparent",
    color: colors.text,
    border: `1px solid ${colors.borderStrong}`,
    action: "open-category-menu",
    blockType: "button",
  });
  if (productCardIds.length > 1) {
    addButton(builder, section.id, type, "spark-products-previous", "Previous", f(
      { x: 968, y: 68, width: 44, height: 46, zIndex: 4 },
      { x: 538, y: 126, width: 44, height: 46, zIndex: 4 },
      { x: 132, y: 126, width: 44, height: 46, zIndex: 4 },
    ), {
      background: "transparent",
      color: colors.text,
      border: `1px solid ${colors.borderStrong}`,
      action: "step-node-set",
      blockType: "button",
      extensions: { direction: -1, targetNodeIds: productCardIds, carouselSectionId: section.id },
    });
    addButton(builder, section.id, type, "spark-products-next", "Next", f(
      { x: 1020, y: 68, width: 44, height: 46, zIndex: 4 },
      { x: 590, y: 126, width: 44, height: 46, zIndex: 4 },
      { x: 184, y: 126, width: 44, height: 46, zIndex: 4 },
    ), {
      background: "transparent",
      color: colors.text,
      border: `1px solid ${colors.borderStrong}`,
      action: "step-node-set",
      blockType: "button",
      extensions: { direction: 1, targetNodeIds: productCardIds, carouselSectionId: section.id },
    });
  }
  if (!visibleProducts.length) {
    addShape(builder, section.id, type, "spark-products-empty-surface", "Product empty state background", f(
      { x: 42, y: 184, width: 1114, height: 330, zIndex: 1 },
      { x: 28, y: 188, width: 712, height: 330, zIndex: 1 },
      { x: 20, y: 190, width: 350, height: 320, zIndex: 1 },
    ), colors.surface, { radius: 14 });
    addText(builder, section.id, type, "spark-products-empty-title", "Empty catalog message", "Your products will appear here", f(
      { x: 318, y: 284, width: 566, height: 58, zIndex: 3 },
      { x: 150, y: 286, width: 470, height: 52, zIndex: 3 },
      { x: 48, y: 278, width: 294, height: 72, zIndex: 3 },
  ), 32, { fontWeight: 700, textAlign: "center", blockType: "empty-state", responsiveFontSize: { mobile: 26 } });
    addText(builder, section.id, type, "spark-products-empty-copy", "Empty catalog guidance", "Add products from the Products dashboard. This section stays connected to your live catalog.", f(
      { x: 340, y: 356, width: 520, height: 56, zIndex: 3 },
      { x: 164, y: 354, width: 440, height: 56, zIndex: 3 },
      { x: 54, y: 366, width: 282, height: 86, zIndex: 3 },
  ), 15, { color: colors.textMuted, lineHeight: 1.5, textAlign: "center", blockType: "empty-state" });
  }
};

const addEditorial = (builder: SparkFashionSceneBuilder) => {
  const type = "image-with-text" as const;
  const section = builder.add("spark-root", {
    id: "spark-editorial",
    type: "section",
    name: "Season editorial",
    frames: sectionFrames.editorial,
    fills: solid(colors.background),
    props: { overflow: "hidden", mobileStackingOrder: "media-text" },
    extensions: sectionExtensions(type),
  });
  addImage(builder, section.id, type, "spark-editorial-image", "Turquoise fashion editorial", cyanImage, f(
    { x: 30, y: 44, width: 520, height: 612, zIndex: 1 },
    { x: 24, y: 42, width: 350, height: 704, zIndex: 1 },
    { x: 16, y: 34, width: 358, height: 486, zIndex: 1 },
  ), { objectPosition: "50% 34%" });
  addShape(builder, section.id, type, "spark-editorial-card", "Editorial story background", f(
    { x: 570, y: 44, width: 600, height: 292, zIndex: 1 },
    { x: 394, y: 42, width: 350, height: 338, zIndex: 1 },
    { x: 16, y: 538, width: 358, height: 202, zIndex: 1 },
  ), "#111111", { radius: 14 });
  addText(builder, section.id, type, "spark-editorial-kicker", "Editorial kicker", "THE SEASON LOOKBOOK", f(
    { x: 610, y: 88, width: 310, height: 22, zIndex: 3 },
    { x: 422, y: 76, width: 286, height: 22, zIndex: 3 },
    { x: 40, y: 568, width: 280, height: 20, zIndex: 3 },
  ), 11, { color: colors.primary, fontWeight: 800, letterSpacing: 1.2, blockType: "paragraph" });
  addText(builder, section.id, type, "spark-editorial-heading", "Editorial heading", "Color that moves with you.", f(
    { x: 610, y: 128, width: 484, height: 104, zIndex: 3 },
    { x: 422, y: 116, width: 288, height: 122, zIndex: 3 },
    { x: 40, y: 604, width: 296, height: 76, zIndex: 3 },
  ), 46, { color: colors.textInverse, fontWeight: 750, lineHeight: 1.04, semanticTag: "h2", blockType: "heading", responsiveFontSize: { tablet: 37, mobile: 30 } });
  addButton(builder, section.id, type, "spark-editorial-action", "Explore products", f(
    { x: 610, y: 254, width: 154, height: 48, zIndex: 3 },
    { x: 422, y: 282, width: 154, height: 48, zIndex: 3 },
    { x: 40, y: 684, width: 154, height: 44, zIndex: 3 },
  ), { background: colors.primary, color: colors.text, navigationTarget: { type: "route", routeKey: "products" }, blockType: "button" });
  addShape(builder, section.id, type, "spark-editorial-offer", "Member access background", f(
    { x: 570, y: 356, width: 600, height: 300, zIndex: 1 },
    { x: 394, y: 400, width: 350, height: 346, zIndex: 1 },
    { x: 16, y: 756, width: 358, height: 178, zIndex: 1 },
  ), colors.primary, { radius: 14 });
  addText(builder, section.id, type, "spark-editorial-offer-heading", "Member access heading", "Fresh edits, ready to shop.", f(
    { x: 610, y: 406, width: 480, height: 74, zIndex: 3 },
    { x: 422, y: 440, width: 284, height: 94, zIndex: 3 },
    { x: 40, y: 782, width: 290, height: 58, zIndex: 3 },
  ), 34, { fontWeight: 750, lineHeight: 1.08, blockType: "heading", responsiveFontSize: { tablet: 31, mobile: 25 } });
  addText(builder, section.id, type, "spark-editorial-offer-copy", "Member access copy", "Explore new products with secure cash on delivery.", f(
    { x: 610, y: 502, width: 420, height: 58, zIndex: 3 },
    { x: 422, y: 552, width: 282, height: 76, zIndex: 3 },
    { x: 40, y: 850, width: 156, height: 64, zIndex: 3 },
  ), 15, { lineHeight: 1.45, blockType: "paragraph", responsiveFontSize: { mobile: 12 } });
  addButton(builder, section.id, type, "spark-editorial-offer-action", "See new arrivals", f(
    { x: 610, y: 582, width: 160, height: 48, zIndex: 3 },
    { x: 422, y: 650, width: 160, height: 46, zIndex: 3 },
    { x: 214, y: 850, width: 136, height: 44, zIndex: 3 },
  ), { navigationTarget: { type: "route", routeKey: "products" }, blockType: "button" });
};

const addCampaign = (builder: SparkFashionSceneBuilder) => {
  const type = "video-banner" as const;
  const section = builder.add("spark-root", {
    id: "spark-campaign",
    type: "section",
    name: "Violet campaign banner",
    frames: sectionFrames.campaign,
    fills: solid(colors.background),
    props: { overflow: "hidden", mediaType: "image" },
    extensions: sectionExtensions(type),
  });
  addImage(builder, section.id, type, "spark-campaign-image", "Violet campaign image", violetImage, f(
    { x: 30, y: 28, width: 1140, height: 550, zIndex: 1 },
    { x: 24, y: 28, width: 720, height: 544, zIndex: 1 },
    { x: 16, y: 24, width: 358, height: 482, zIndex: 1 },
  ), { objectPosition: "50% 50%" });
  addText(builder, section.id, type, "spark-campaign-heading", "Campaign heading", "Make color your signature.", f(
    { x: 78, y: 82, width: 560, height: 118, zIndex: 3 },
    { x: 56, y: 64, width: 470, height: 106, zIndex: 3 },
    { x: 36, y: 54, width: 302, height: 98, zIndex: 3 },
  ), 58, { color: colors.textInverse, fontWeight: 800, lineHeight: 1.02, semanticTag: "h2", blockType: "heading", responsiveFontSize: { tablet: 48, mobile: 37 } });
  addButton(builder, section.id, type, "spark-campaign-action", "Shop the edit", f(
    { x: 78, y: 474, width: 150, height: 50, zIndex: 3 },
    { x: 56, y: 466, width: 150, height: 48, zIndex: 3 },
    { x: 36, y: 418, width: 146, height: 48, zIndex: 3 },
  ), { background: "rgba(255,255,255,0.9)", color: colors.text, navigationTarget: { type: "route", routeKey: "products" }, blockType: "button" });
};

const addStory = (builder: SparkFashionSceneBuilder) => {
  const type = "customer-stories" as const;
  const section = builder.add("spark-root", {
    id: "spark-story",
    type: "section",
    name: "Fashion story mosaic",
    frames: sectionFrames.story,
    fills: solid(colors.background),
    props: { overflow: "hidden", presentation: "editorial-mosaic" },
    extensions: sectionExtensions(type),
  });
  addText(builder, section.id, type, "spark-story-heading", "Story heading", "Style is a way to say who you are before you speak.", f(
    { x: 42, y: 64, width: 660, height: 138, zIndex: 3 },
    { x: 28, y: 52, width: 610, height: 126, zIndex: 3 },
    { x: 20, y: 44, width: 350, height: 146, zIndex: 3 },
  ), 46, { fontWeight: 800, lineHeight: 1.04, semanticTag: "h2", blockType: "heading", responsiveFontSize: { tablet: 40, mobile: 34 } });
  addButton(builder, section.id, type, "spark-story-action", "Shop now", f(
    { x: 42, y: 218, width: 128, height: 48, zIndex: 4 },
    { x: 28, y: 190, width: 128, height: 48, zIndex: 4 },
    { x: 20, y: 202, width: 128, height: 46, zIndex: 4 },
  ), { navigationTarget: { type: "route", routeKey: "products" }, blockType: "button" });
  addImage(builder, section.id, type, "spark-story-coral-image", "Coral fashion portrait", coralImage, f(
    { x: 42, y: 316, width: 300, height: 400, zIndex: 1 },
    { x: 28, y: 282, width: 330, height: 554, zIndex: 1 },
    { x: 20, y: 278, width: 168, height: 330, zIndex: 1 },
  ), { objectPosition: "50% 25%" });
  addShape(builder, section.id, type, "spark-story-offer-card", "Season offer background", f(
    { x: 370, y: 316, width: 300, height: 400, zIndex: 1 },
    { x: 382, y: 282, width: 358, height: 266, zIndex: 1 },
    { x: 204, y: 278, width: 166, height: 330, zIndex: 1 },
  ), colors.surfaceInverse, { radius: 14 });
  addText(builder, section.id, type, "spark-story-offer-label", "Season offer label", "LIMITED EDIT", f(
    { x: 396, y: 354, width: 210, height: 20, zIndex: 3 },
    { x: 410, y: 316, width: 210, height: 20, zIndex: 3 },
    { x: 220, y: 304, width: 130, height: 18, zIndex: 3 },
  ), 11, { color: colors.primary, fontWeight: 800, letterSpacing: 1.2, blockType: "eyebrow" });
  addText(builder, section.id, type, "spark-story-offer-heading", "Season offer heading", "Discover the edit made for right now.", f(
    { x: 396, y: 408, width: 242, height: 154, zIndex: 3 },
    { x: 410, y: 362, width: 286, height: 112, zIndex: 3 },
    { x: 220, y: 344, width: 134, height: 156, zIndex: 3 },
  ), 34, { color: colors.textInverse, fontWeight: 700, lineHeight: 1.08, blockType: "heading", responsiveFontSize: { tablet: 31, mobile: 23 } });
  addButton(builder, section.id, type, "spark-story-offer-action", "Browse", f(
    { x: 396, y: 624, width: 110, height: 46, zIndex: 3 },
    { x: 410, y: 480, width: 110, height: 44, zIndex: 3 },
    { x: 220, y: 532, width: 116, height: 44, zIndex: 3 },
  ), { background: colors.primary, color: colors.text, navigationTarget: { type: "route", routeKey: "products" }, blockType: "button" });
  addImage(builder, section.id, type, "spark-story-group-image", "Fashion group portrait", violetImage, f(
    { x: 698, y: 316, width: 472, height: 260, zIndex: 1 },
    { x: 382, y: 572, width: 358, height: 264, zIndex: 1 },
    { x: 20, y: 632, width: 350, height: 244, zIndex: 1 },
  ), { objectPosition: "50% 42%" });
  addText(builder, section.id, type, "spark-story-quote", "Fashion quote", "Dress for the life you are creating, with pieces that feel unmistakably yours.", f(
    { x: 722, y: 612, width: 420, height: 90, zIndex: 3 },
    { x: 404, y: 814, width: 314, height: 80, zIndex: 3 },
    { x: 20, y: 904, width: 350, height: 92, zIndex: 3 },
  ), 22, { fontWeight: 650, lineHeight: 1.3, blockType: "testimonial", responsiveFontSize: { tablet: 19, mobile: 20 } });
};

const addFooter = (builder: SparkFashionSceneBuilder, profile: SparkFashionStoreProfile) => {
  const type = "site-footer" as const;
  const section = builder.add("spark-root", {
    id: "spark-footer",
    type: "section",
    name: "Global site footer",
    frames: sectionFrames.footer,
    fills: solid(colors.background),
    props: { overflow: "hidden", primaryMenuId: "footer", showNewsletter: false, showSocialLinks: true },
    extensions: { ...sectionExtensions(type), globalSectionGroup: "footer" },
  });
  addShape(builder, section.id, type, "spark-footer-bg", "Footer background", f(
    { x: 30, y: 26, width: 1140, height: 510, zIndex: 1 },
    { x: 24, y: 26, width: 720, height: 596, zIndex: 1 },
    { x: 16, y: 24, width: 358, height: 794, zIndex: 1 },
  ), colors.surfaceInverse, { radius: 14 });
  addText(builder, section.id, type, "spark-footer-logo", "Footer logo", profile.business_name?.trim() || "SPARK", f(
    { x: 68, y: 74, width: 300, height: 52, zIndex: 3 },
    { x: 56, y: 64, width: 260, height: 48, zIndex: 3 },
    { x: 40, y: 56, width: 250, height: 46, zIndex: 3 },
  ), 34, {
    color: colors.textInverse, fontWeight: 800, blockType: "store-logo",
    extensions: {
      dynamicBinding: { source: "store", field: "business_name", target: "text" },
      navigationTarget: { type: "route", routeKey: "home" },
    },
  });
  addText(builder, section.id, type, "spark-footer-heading", "Footer heading", "Find your next favorite piece.", f(
    { x: 68, y: 160, width: 520, height: 106, zIndex: 3 },
    { x: 56, y: 146, width: 430, height: 96, zIndex: 3 },
    { x: 40, y: 138, width: 300, height: 106, zIndex: 3 },
  ), 48, { color: colors.textInverse, fontWeight: 700, lineHeight: 1.03, semanticTag: "h2", blockType: "heading", responsiveFontSize: { tablet: 42, mobile: 34 } });
  addButton(builder, section.id, type, "spark-footer-shop", "Shop products", f(
    { x: 68, y: 294, width: 148, height: 50, zIndex: 3 },
    { x: 56, y: 270, width: 148, height: 48, zIndex: 3 },
    { x: 40, y: 270, width: 148, height: 48, zIndex: 3 },
  ), { background: colors.primary, color: colors.text, navigationTarget: { type: "route", routeKey: "products" }, blockType: "button" });
  const footerLinks: Array<[string, string, unknown]> = [
    ["home", "Home", { type: "route", routeKey: "home" }],
    ["products", "Products", { type: "route", routeKey: "products" }],
    ["about", "About us", { type: "route", routeKey: "about" }],
    ["contact", "Contact", { type: "route", routeKey: "contact" }],
  ];
  footerLinks.forEach(([key, label, target], index) => addButton(builder, section.id, type, `spark-footer-${key}`, label, f(
    { x: 720, y: 92 + index * 62, width: 160, height: 44, zIndex: 3 },
    { x: 520, y: 80 + index * 58, width: 168, height: 44, zIndex: 3 },
    { x: 40, y: 370 + index * 58, width: 310, height: 46, zIndex: 3 },
  ), {
    background: "transparent", color: colors.textInverse, border: "1px solid rgba(255,255,255,0.18)",
    radius: 999, navigationTarget: target, blockType: "navigation-link",
  }));
  addButton(builder, section.id, type, "spark-footer-catalog", "Browse catalog", f(
    { x: 920, y: 92, width: 190, height: 44, zIndex: 3 },
    { x: 520, y: 326, width: 168, height: 44, zIndex: 3 },
    { x: 40, y: 626, width: 310, height: 46, zIndex: 3 },
  ), {
    background: "transparent", color: colors.textInverse, border: "1px solid rgba(255,255,255,0.18)",
    navigationTarget: { type: "route", routeKey: "products" }, blockType: "button",
  });
  addText(builder, section.id, type, "spark-footer-legal", "Footer legal", `Copyright ${new Date().getFullYear()} ${profile.business_name?.trim() || "Spark"}. Powered by StoreBlink.`, f(
    { x: 68, y: 468, width: 540, height: 24, zIndex: 3 },
    { x: 56, y: 544, width: 500, height: 24, zIndex: 3 },
    { x: 40, y: 738, width: 300, height: 48, zIndex: 3 },
  ), 11, { color: "#AFAFAF", lineHeight: 1.4, blockType: "legal" });
};

export const buildSparkFashionTemplateScene = (
  profile: SparkFashionStoreProfile = {},
  products: SparkFashionProductInput[] = [],
): SceneTree => {
  const builder = new SparkFashionSceneBuilder();
  builder.add(null, {
    id: "spark-root",
    type: "section",
    name: "Spark Fashion storefront",
    frames: f(
      { x: 0, y: 0, width: 1200, height: 4400 },
      { x: 0, y: 0, width: 768, height: 4978 },
      { x: 0, y: 0, width: 390, height: 6116 },
    ),
    fills: solid(colors.background),
    props: { overflow: "visible" },
    extensions: {
      themeId: "spark-fashion",
      template: "spark-fashion",
      navigation: createDefaultStoreNavigationDocument(),
      templateKey: "home-default",
      editorKind: "page",
      structured: true,
      structuredPage: true,
      canvasBackground: colors.background,
      responsiveBaseWidth: 1200,
      schemaVersion: 1,
    },
  });
  addHeader(builder, profile);
  addHero(builder);
  addCategories(builder);
  addIntro(builder);
  addProducts(builder, products);
  addEditorial(builder);
  addCampaign(builder);
  addStory(builder);
  addFooter(builder, profile);

  const scene = themeChromeSystem.ensureScene(
    validateSceneTree({ rootNodeId: "spark-root", nodes: builder.nodes }),
  );
  assertValidSceneTreeStructure(scene);
  return scene;
};

export { sparkFashionDefaultSectionOrder } from "../presets";

const removeSubtree = (scene: SceneTree, nodeId: string) => {
  const node = scene.nodes[nodeId];
  if (!node) return;
  [...node.childIds].forEach((childId) => removeSubtree(scene, childId));
  delete scene.nodes[nodeId];
};

const copySubtree = (target: SceneTree, source: SceneTree, nodeId: string) => {
  const node = source.nodes[nodeId];
  if (!node) return;
  target.nodes[nodeId] = structuredClone(node);
  node.childIds.forEach((childId) => copySubtree(target, source, childId));
};

export const reconcileSparkFashionProducts = (
  source: SceneTree,
  profile: SparkFashionStoreProfile,
  products: SparkFashionProductInput[],
): SceneTree => {
  const root = source.rootNodeId ? source.nodes[source.rootNodeId] : undefined;
  if (root?.extensions?.themeId !== "spark-fashion" && root?.extensions?.template !== "spark-fashion") {
    return source;
  }
  const next = themeChromeSystem.ensureScene(cloneSceneTree(source));
  const baseline = buildSparkFashionTemplateScene(profile, products);
  const section = next.nodes["spark-products"];
  const baselineSection = baseline.nodes["spark-products"];
  if (!section || !baselineSection) return next;

  const currentCards = section.childIds.filter((id) => next.nodes[id]?.extensions?.blockType === "product-card");
  const desiredCards = baselineSection.childIds.filter((id) => baseline.nodes[id]?.extensions?.blockType === "product-card");
  const desiredCardIds = new Set(desiredCards);
  const desiredProductIds = new Set(products.map((product) => String(product.id)));

  currentCards.filter((id) => !desiredCardIds.has(id)).forEach((id) => removeSubtree(next, id));
  section.childIds
    .filter((id) => id.startsWith("spark-products-empty") && !baselineSection.childIds.includes(id))
    .forEach((id) => removeSubtree(next, id));

  desiredCards.forEach((cardId) => {
    const baselineCard = baseline.nodes[cardId];
    const existingCard = next.nodes[cardId];
    if (!existingCard) {
      copySubtree(next, baseline, cardId);
      return;
    }
    baselineCard.childIds.forEach((childId) => {
      const desired = baseline.nodes[childId];
      const current = next.nodes[childId];
      if (!current) {
        copySubtree(next, baseline, childId);
        return;
      }
      next.nodes[childId] = {
        ...current,
        extensions: {
          ...(current.extensions ?? {}),
          ...(current.extensions?.dynamicBinding ? {} : { dynamicBinding: desired.extensions?.dynamicBinding }),
        },
      };
    });
    const baselineProductId = productReferenceId(baselineCard) ?? "";
    const persistedProductId = productReferenceId(existingCard);
    const productId = persistedProductId && desiredProductIds.has(persistedProductId)
      ? persistedProductId
      : baselineProductId;
    synchronizeProductReferenceSubtree(next, cardId, productId, cardId);
  });

  const managed = (id: string) => id.startsWith("spark-product-card-") || id.startsWith("spark-products-empty");
  const customChildren = section.childIds.filter((id) => !managed(id));
  baselineSection.childIds.filter(managed).forEach((id) => {
    if (!next.nodes[id]) copySubtree(next, baseline, id);
  });
  section.childIds = [
    ...customChildren.filter((id) => next.nodes[id]),
    ...baselineSection.childIds.filter((id) => managed(id) && next.nodes[id]),
  ];
  return validateSceneTree(next);
};
