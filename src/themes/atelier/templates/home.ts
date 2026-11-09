import heroImage from "../assets/atelier-hero.webp";
import craftImage from "../assets/atelier-craft.webp";
import storyImage from "../assets/atelier-story.webp";
import {
  productReferenceId,
  synchronizeProductReference,
  synchronizeProductReferenceSubtree,
} from "@/document/dynamic-sources";
import { cloneSceneTree, createSceneNode } from "@/engine/scene-graph";
import { assertValidSceneTreeStructure, validateSceneTree } from "@/engine/validation";
import type { CanonicalSectionType } from "@/theme-engine/contracts";
import type { ResponsiveBreakpoint } from "@/stores/responsive.store";
import type { ElementType, SceneNode, SceneTree, StyleData, TransformData } from "@/types";
import { atelierDefaultSectionOrder } from "../presets";
import { atelierTokens } from "../tokens";
import { themeChromeSystem } from "@/theme-engine/chrome";
import { createDefaultStoreNavigationDocument } from "@/content/menus/NavigationSystem";

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

export type AtelierStoreProfile = {
  business_name?: string | null;
  store_tagline?: string | null;
  store_about?: string | null;
  store_color?: string | null;
};

export type AtelierProductInput = {
  id: string | number;
  name?: string | null;
  image_url?: string | null;
  price_cents?: number | null;
};

const timestamp = 1_783_000_000_000;
const colors = atelierTokens.colors;
const sans = atelierTokens.typography.headingFont;
const body = atelierTokens.typography.bodyFont;
const serif = atelierTokens.typography.editorialFont;
const iconMarkup = (paths: string) =>
  `<svg viewBox="0 0 24 24" width="100%" height="100%" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths}</svg>`;
const menuIcon = iconMarkup('<path d="M4 7h16M4 12h16M4 17h16"/>');

const f = (desktop: Frame, tablet: Frame, mobile: Frame): Frames => ({
  desktop,
  tablet,
  mobile,
});
const solid = (color: string): StyleData["fills"] => [{ type: "solid", color }];
const stroke = (color: string, width = 1): StyleData["strokes"] => [
  { color, width, style: "solid" },
];
const shadow = (color: string): StyleData["effects"] => [
  { type: "shadow", value: { x: 0, y: 16, blur: 40, spread: -24, color } },
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

class AtelierSceneBuilder {
  readonly nodes: Record<string, SceneNode> = {};

  add(parentId: string | null, input: NodeInput): SceneNode {
    const desktopVisible = input.visibility?.desktop ?? true;
    const node = createSceneNode(
      {
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
          themeId: "atelier",
          selectable: parentId !== null,
          ...input.extensions,
        },
      },
      parentId,
      timestamp,
    );
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
  builder: AtelierSceneBuilder,
  parentId: string,
  sectionType: CanonicalSectionType,
  id: string,
  name: string,
  text: string,
  frames: Frames,
  fontSize: number,
  options: {
    fontFamily?: string;
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
) =>
  builder.add(parentId, {
    id,
    type: "text",
    name,
    frames,
    props: {
      text,
      fontSize,
      fontFamily: options.fontFamily ?? body,
      fontWeight: options.fontWeight ?? 400,
      color: options.color ?? colors.text,
      lineHeight: options.lineHeight ?? 1.15,
      textAlign: options.textAlign ?? "left",
      letterSpacing: options.letterSpacing ?? 0,
      semanticTag: options.semanticTag,
      whiteSpace: options.whiteSpace,
    },
    visibility: options.visibility,
    responsiveProps: options.responsiveFontSize
      ? {
          desktop: options.responsiveFontSize.desktop === undefined
            ? undefined
            : { fontSize: options.responsiveFontSize.desktop },
          tablet: options.responsiveFontSize.tablet === undefined
            ? undefined
            : { fontSize: options.responsiveFontSize.tablet },
          mobile: options.responsiveFontSize.mobile === undefined
            ? undefined
            : { fontSize: options.responsiveFontSize.mobile },
        }
      : undefined,
    extensions: blockExtensions(
      sectionType,
      options.blockType ?? "rich-text",
      options.extensions,
    ),
  });

const addButton = (
  builder: AtelierSceneBuilder,
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
) =>
  builder.add(parentId, {
    id,
    type: "button",
    name: `${label} action`,
    frames,
    radius: options.radius ?? 999,
    props: {
      label,
      background: options.background ?? "transparent",
      color: options.color ?? colors.text,
      border: options.border ?? `1px solid ${colors.borderStrong}`,
      fontFamily: body,
      fontSize: options.fontSize ?? 12,
      fontWeight: 650,
    },
    visibility: options.visibility,
    extensions: blockExtensions(sectionType, options.blockType ?? "button", {
      navigationTarget: options.navigationTarget,
      action: options.action,
      ...options.extensions,
    }),
  });

const addImage = (
  builder: AtelierSceneBuilder,
  parentId: string,
  sectionType: CanonicalSectionType,
  id: string,
  name: string,
  src: string | undefined,
  frames: Frames,
  options: {
    radius?: number;
    loading?: "eager" | "lazy";
    extensions?: Record<string, unknown>;
  } = {},
) =>
  builder.add(parentId, {
    id,
    type: "image",
    name,
    frames,
    radius: options.radius ?? 0,
    fills: solid("#D8D1C8"),
    props: {
      src,
      alt: name,
      objectFit: "cover",
      objectPosition: "50% 50%",
      loading: options.loading ?? "lazy",
      uploadHint: "Replace image",
    },
    extensions: blockExtensions(sectionType, "image", {
      replaceable: true,
      ...options.extensions,
    }),
  });

const addShape = (
  builder: AtelierSceneBuilder,
  parentId: string,
  sectionType: CanonicalSectionType,
  id: string,
  name: string,
  frames: Frames,
  fill: string,
  options: {
    radius?: number;
    strokes?: StyleData["strokes"];
    effects?: StyleData["effects"];
    extensions?: Record<string, unknown>;
  } = {},
) =>
  builder.add(parentId, {
    id,
    type: "shape",
    name,
    frames,
    fills: solid(fill),
    strokes: options.strokes,
    effects: options.effects,
    radius: options.radius,
    extensions: blockExtensions(sectionType, "decorative-shape", options.extensions),
  });

const sectionFrames = {
  announcement: f(
    { x: 0, y: 0, width: 1200, height: 40 },
    { x: 0, y: 0, width: 768, height: 40 },
    { x: 0, y: 0, width: 390, height: 36 },
  ),
  header: f(
    { x: 0, y: 40, width: 1200, height: 90, zIndex: 100 },
    { x: 0, y: 40, width: 768, height: 84, zIndex: 100 },
    { x: 0, y: 36, width: 390, height: 72, zIndex: 100 },
  ),
  intro: f(
    { x: 0, y: 130, width: 1200, height: 600 },
    { x: 0, y: 124, width: 768, height: 680 },
    { x: 0, y: 108, width: 390, height: 850 },
  ),
  hero: f(
    { x: 0, y: 730, width: 1200, height: 720 },
    { x: 0, y: 804, width: 768, height: 620 },
    { x: 0, y: 958, width: 390, height: 530 },
  ),
  brand: f(
    { x: 0, y: 1450, width: 1200, height: 700 },
    { x: 0, y: 1424, width: 768, height: 780 },
    { x: 0, y: 1488, width: 390, height: 1000 },
  ),
  craft: f(
    { x: 0, y: 2150, width: 1200, height: 720 },
    { x: 0, y: 2204, width: 768, height: 760 },
    { x: 0, y: 2488, width: 390, height: 960 },
  ),
  products: f(
    { x: 0, y: 2870, width: 1200, height: 930 },
    { x: 0, y: 2964, width: 768, height: 920 },
    { x: 0, y: 3448, width: 390, height: 1450 },
  ),
  stories: f(
    { x: 0, y: 3800, width: 1200, height: 720 },
    { x: 0, y: 3884, width: 768, height: 760 },
    { x: 0, y: 4898, width: 390, height: 900 },
  ),
  footer: f(
    { x: 0, y: 4520, width: 1200, height: 780 },
    { x: 0, y: 4644, width: 768, height: 740 },
    { x: 0, y: 5798, width: 390, height: 1020 },
  ),
};

const addAnnouncement = (builder: AtelierSceneBuilder) => {
  const type = "announcement-marquee" as const;
  const section = builder.add("atelier-root", {
    id: "atelier-announcement",
    type: "section",
    name: "Announcement marquee",
    frames: sectionFrames.announcement,
    fills: solid(colors.surfaceInverse),
    props: {
      overflow: "hidden",
      enabled: true,
      speed: { base: 52, mobile: 40 },
      direction: "left",
      pauseOnHover: true,
      pauseWhenOffscreen: true,
      textColor: colors.textInverse,
      fontSize: { base: 10, mobile: 10 },
      fontWeight: 650,
      letterSpacing: { base: 1.4, mobile: 1.1 },
      horizontalPadding: { base: 24, mobile: 16 },
      itemGap: { base: 64, mobile: 36 },
      separator: "\u2022",
    },
    extensions: sectionExtensions(type),
  });
  [
    ["atelier-announcement-one", "OBJECTS FOR QUIET LIVING", 24, 8],
    ["atelier-announcement-two", "CRAFTED IN SMALL EDITIONS", 438, 8],
    ["atelier-announcement-three", "COMPLIMENTARY DELIVERY", 852, 8],
  ].forEach(([id, text, x, y], index) => {
    addText(
      builder,
      section.id,
      type,
      String(id),
      "Announcement item",
      String(text),
      f(
        { x: Number(x), y: Number(y), width: 320, height: 22, zIndex: index + 1 },
        { x: 18 + index * 260, y: 8, width: 220, height: 22, zIndex: index + 1 },
        index === 0
          ? { x: 16, y: 7, width: 358, height: 22, zIndex: 1 }
          : { x: 0, y: 0, width: 1, height: 1, zIndex: index + 1 },
      ),
      10,
      {
        color: colors.textInverse,
        fontWeight: 650,
        letterSpacing: 1.4,
        blockType: "announcement-item",
        whiteSpace: "nowrap",
        visibility: { desktop: true, tablet: true, mobile: index === 0 },
      },
    );
  });
};

const addHeader = (builder: AtelierSceneBuilder, profile: AtelierStoreProfile) => {
  const type = "site-header" as const;
  const section = builder.add("atelier-root", {
    id: "atelier-header",
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
  addText(
    builder,
    section.id,
    type,
    "atelier-logo",
    "Store logo",
    profile.business_name?.trim() || "ATELIER",
    f(
      { x: 44, y: 30, width: 260, height: 30, zIndex: 10 },
      { x: 70, y: 27, width: 250, height: 28, zIndex: 10 },
      { x: 57, y: 24, width: 164, height: 26, zIndex: 10 },
    ),
    18,
    {
      fontFamily: sans,
      fontWeight: 800,
      letterSpacing: 1.8,
      whiteSpace: "nowrap",
      semanticTag: "span",
      blockType: "store-logo",
      responsiveFontSize: { tablet: 16, mobile: 14 },
      extensions: {
        dynamicBinding: { source: "store", field: "business_name", target: "text" },
        navigationTarget: { type: "home" },
      },
    },
  );
  const links: Array<[string, string, unknown]> = [
    ["home", "Home", { type: "home" }],
    ["products", "Collections", { type: "catalog" }],
    ["about", "About", { type: "page", entityId: "about" }],
    ["contact", "Contact", { type: "page", entityId: "contact" }],
  ];
  links.forEach(([key, label, target], index) => {
    addButton(
      builder,
      section.id,
      type,
      `atelier-nav-${key}`,
      label,
      f(
        { x: 390 + index * 112, y: 27, width: 104, height: 36, zIndex: 10 },
        { x: 218 + index * 86, y: 24, width: 80, height: 36, zIndex: 10 },
        { x: 0, y: 0, width: 1, height: 1, zIndex: 1 },
      ),
      {
        border: "0",
        fontSize: 12,
        navigationTarget: target,
        blockType: "navigation-link",
        visibility: { desktop: true, tablet: false, mobile: false },
        extensions: {
          navigationSurfaceVisibility: { desktop: true, tablet: false, mobile: false },
        },
      },
    );
  });
  addButton(
    builder,
    section.id,
    type,
    "atelier-search",
    "Search",
    f(
      { x: 906, y: 27, width: 82, height: 36, zIndex: 10 },
      { x: 590, y: 24, width: 62, height: 36, zIndex: 10 },
      { x: 0, y: 0, width: 1, height: 1 },
    ),
    {
      border: "0",
      action: "open-search",
      blockType: "search-trigger",
      visibility: { desktop: true, tablet: false, mobile: false },
    },
  );
  addButton(
    builder,
    section.id,
    type,
    "atelier-account",
    "Account",
    f(
      { x: 996, y: 27, width: 72, height: 36, zIndex: 10 },
      { x: 634, y: 24, width: 60, height: 36, zIndex: 10 },
      { x: 232, y: 18, width: 64, height: 36, zIndex: 10 },
    ),
    { border: "0", action: "open-account", blockType: "account-trigger" },
  );
  addButton(
    builder,
    section.id,
    type,
    "atelier-cart",
    "Cart (0)",
    f(
      { x: 1074, y: 27, width: 82, height: 36, zIndex: 10 },
      { x: 700, y: 24, width: 60, height: 36, zIndex: 10 },
      { x: 298, y: 18, width: 72, height: 36, zIndex: 10 },
    ),
    { border: "0", action: "open-cart", blockType: "cart-trigger" },
  );
  addText(
    builder,
    section.id,
    type,
    "atelier-cart-count",
    "Cart count",
    "0",
    f(
      { x: 1137, y: 23, width: 18, height: 18, zIndex: 14 },
      { x: 742, y: 20, width: 18, height: 18, zIndex: 14 },
      { x: 352, y: 14, width: 18, height: 18, zIndex: 14 },
    ),
    9,
    {
      color: colors.textInverse,
      textAlign: "center",
      fontWeight: 700,
      blockType: "cart-count",
      extensions: {
        dynamicBinding: { source: "store", field: "cart_count", target: "text" },
      },
    },
  );
  addShape(
    builder,
    section.id,
    type,
    "atelier-cart-count-bg",
    "Cart count background",
    f(
      { x: 1134, y: 21, width: 22, height: 22, zIndex: 13 },
      { x: 739, y: 18, width: 22, height: 22, zIndex: 13 },
      { x: 349, y: 12, width: 22, height: 22, zIndex: 13 },
    ),
    colors.text,
    { radius: 999 },
  );
  builder.add(section.id, {
    id: "atelier-menu",
    type: "svg",
    name: "Open navigation menu",
    frames: f(
      { x: 0, y: 0, width: 1, height: 1 },
      { x: 18, y: 24, width: 28, height: 28, zIndex: 10 },
      { x: 16, y: 18, width: 38, height: 36, zIndex: 10 },
    ),
    props: {
      markup: menuIcon,
      color: colors.text,
      ariaLabel: "Open navigation menu",
    },
    visibility: { desktop: false, tablet: true, mobile: true },
    extensions: blockExtensions(type, "mobile-menu-trigger", {
      action: "toggle-mobile-menu",
    }),
  });
  const drawer = builder.add(section.id, {
    id: "atelier-mobile-menu",
    type: "container",
    name: "Mobile navigation drawer",
    frames: f(
      { x: 0, y: 0, width: 1, height: 1, zIndex: 1 },
      { x: 0, y: 72, width: 768, height: 302, zIndex: 100 },
      { x: 0, y: 72, width: 390, height: 302, zIndex: 100 },
    ),
    fills: solid(colors.background),
    strokes: stroke(colors.border),
    effects: shadow("rgba(0,0,0,0.25)"),
    props: { overflow: "hidden" },
    visibility: { desktop: false, tablet: false, mobile: false },
    extensions: blockExtensions(type, "mobile-menu", {
      runtimeVisibility: "mobile-menu",
    }),
  });
  links.forEach(([key, label, target], index) => {
    addButton(
      builder,
      drawer.id,
      type,
      `atelier-mobile-nav-${key}`,
      label,
      f(
        { x: 0, y: 0, width: 1, height: 1 },
        { x: 20, y: 16 + index * 56, width: 728, height: 46, zIndex: index + 1 },
        { x: 20, y: 16 + index * 56, width: 350, height: 46, zIndex: index + 1 },
      ),
      {
        background: colors.surface,
        border: "0",
        radius: 0,
        fontSize: 15,
        navigationTarget: target,
        blockType: "navigation-link",
        visibility: { desktop: false, tablet: true, mobile: true },
        extensions: {
          mobileNavigationMirror: true,
          navigationSurfaceVisibility: { desktop: false, tablet: true, mobile: true },
        },
      },
    );
  });
};

const addEditorialIntro = (builder: AtelierSceneBuilder) => {
  const type = "editorial-intro" as const;
  const section = builder.add("atelier-root", {
    id: "atelier-intro",
    type: "section",
    name: "Editorial introduction",
    frames: sectionFrames.intro,
    fills: solid(colors.background),
    props: { overflow: "hidden", colorSchemeId: "warm-canvas", mobileStackingOrder: "text-media" },
    extensions: sectionExtensions(type),
  });
  addText(
    builder, section.id, type, "atelier-intro-eyebrow", "Intro eyebrow", "COLLECTION 01 / 2026",
    f(
      { x: 48, y: 62, width: 260, height: 20 },
      { x: 32, y: 52, width: 220, height: 20 },
      { x: 20, y: 42, width: 220, height: 20 },
    ),
    11,
    { fontWeight: 700, letterSpacing: 1.3, blockType: "eyebrow" },
  );
  addText(
    builder, section.id, type, "atelier-intro-heading", "Editorial heading", "Where quiet shapes",
    f(
      { x: 44, y: 112, width: 900, height: 116, zIndex: 4 },
      { x: 30, y: 102, width: 690, height: 92, zIndex: 4 },
      { x: 18, y: 88, width: 354, height: 100, zIndex: 4 },
    ),
    88,
    {
      fontFamily: sans,
      fontWeight: 500,
      lineHeight: 0.98,
      semanticTag: "h1",
      blockType: "heading",
      responsiveFontSize: { tablet: 68, mobile: 48 },
    },
  );
  addText(
    builder, section.id, type, "atelier-intro-accent", "Editorial emphasis", "the finest forms.",
    f(
      { x: 286, y: 222, width: 820, height: 112, zIndex: 5 },
      { x: 120, y: 198, width: 610, height: 92, zIndex: 5 },
      { x: 56, y: 194, width: 316, height: 98, zIndex: 5 },
    ),
    88,
    {
      fontFamily: serif,
      fontWeight: 400,
      lineHeight: 0.98,
      semanticTag: "span",
      blockType: "rich-heading-emphasis",
      responsiveFontSize: { tablet: 68, mobile: 46 },
      extensions: { emphasis: "editorial-italic" },
    },
  );
  addText(
    builder, section.id, type, "atelier-intro-copy", "Introduction", "Furniture shaped by patient hands, honest materials and rooms that leave space to breathe.",
    f(
      { x: 48, y: 426, width: 360, height: 84 },
      { x: 34, y: 400, width: 310, height: 92 },
      { x: 20, y: 310, width: 350, height: 78 },
    ),
    17,
    { color: colors.textMuted, lineHeight: 1.5, blockType: "paragraph" },
  );
  addImage(
    builder, section.id, type, "atelier-intro-image", "Sculptural lounge chair", heroImage,
    f(
      { x: 766, y: 364, width: 386, height: 200, zIndex: 3 },
      { x: 384, y: 370, width: 350, height: 264, zIndex: 3 },
      { x: 20, y: 408, width: 350, height: 360, zIndex: 3 },
    ),
    { loading: "eager" },
  );
  addText(
    builder, section.id, type, "atelier-intro-caption", "Image caption", "The Still Chair / Walnut and natural linen",
    f(
      { x: 766, y: 570, width: 360, height: 20 },
      { x: 384, y: 640, width: 350, height: 20 },
      { x: 20, y: 776, width: 350, height: 20 },
    ),
    10,
    { color: colors.textMuted, blockType: "media-caption" },
  );
};

const addProductHero = (
  builder: AtelierSceneBuilder,
  products: AtelierProductInput[],
) => {
  const type = "immersive-product-hero" as const;
  const productId = products[0] ? String(products[0].id) : "";
  const section = builder.add("atelier-root", {
    id: "atelier-product-hero",
    type: "section",
    name: "Immersive product hero",
    frames: sectionFrames.hero,
    fills: solid(colors.surface),
    props: {
      overflow: "hidden",
      imageFit: "cover",
      cardStyle: "floating",
      showProductPrice: true,
      showAddToCart: true,
      showViewProduct: true,
    },
    extensions: sectionExtensions(type),
  });
  addImage(
    builder, section.id, type, "atelier-hero-image", "Architectural lounge interior", heroImage,
    f(
      { x: 28, y: 24, width: 1144, height: 664, zIndex: 1 },
      { x: 24, y: 22, width: 720, height: 576, zIndex: 1 },
      { x: 14, y: 14, width: 362, height: 502, zIndex: 1 },
    ),
    { loading: "eager" },
  );
  addShape(
    builder, section.id, type, "atelier-hotspot", "Product hotspot",
    f(
      { x: 746, y: 370, width: 26, height: 26, zIndex: 20 },
      { x: 472, y: 316, width: 26, height: 26, zIndex: 20 },
      { x: 230, y: 294, width: 28, height: 28, zIndex: 20 },
    ),
    colors.surface,
    {
      radius: 999,
      strokes: stroke(colors.text, 2),
      effects: shadow("rgba(0,0,0,0.34)"),
      extensions: {
        productId,
        position: {
          desktop: { xPercent: 64.2, yPercent: 55.8 },
          tablet: { xPercent: 64.8, yPercent: 54.8 },
          mobile: { xPercent: 63.5, yPercent: 58.6 },
        },
      },
    },
  );
  addShape(
    builder, section.id, type, "atelier-hero-card-bg", "Floating product card",
    f(
      { x: 68, y: 438, width: 360, height: 204, zIndex: 12 },
      { x: 48, y: 388, width: 326, height: 180, zIndex: 12 },
      { x: 28, y: 338, width: 326, height: 154, zIndex: 12 },
    ),
    "rgba(10,10,10,0.86)",
    { radius: 2, strokes: stroke("rgba(255,255,255,0.3)") },
  );
  addText(
    builder, section.id, type, "atelier-hero-product-title", "Featured product name", "Select a featured product",
    f(
      { x: 92, y: 466, width: 300, height: 56, zIndex: 14 },
      { x: 70, y: 412, width: 280, height: 58, zIndex: 14 },
      { x: 48, y: 358, width: 280, height: 58, zIndex: 14 },
    ),
    24,
    {
      color: colors.textInverse,
      fontFamily: sans,
      fontWeight: 500,
      blockType: "product-reference",
      extensions: {
        productId,
        dynamicBinding: { source: "product", field: "name", target: "text", productId },
      },
    },
  );
  addText(
    builder, section.id, type, "atelier-hero-product-price", "Featured product price", "Live price",
    f(
      { x: 92, y: 528, width: 160, height: 28, zIndex: 14 },
      { x: 70, y: 476, width: 150, height: 24, zIndex: 14 },
      { x: 48, y: 418, width: 140, height: 22, zIndex: 14 },
    ),
    14,
    {
      color: "#D8D1C8",
      blockType: "product-price",
      extensions: {
        productId,
        dynamicBinding: {
          source: "product",
          field: "price_cents",
          target: "text",
          productId,
          format: "currency",
        },
      },
    },
  );
  addButton(
    builder, section.id, type, "atelier-hero-view-product", "View product",
    f(
      { x: 92, y: 574, width: 132, height: 40, zIndex: 14 },
      { x: 70, y: 518, width: 122, height: 38, zIndex: 14 },
      { x: 48, y: 446, width: 122, height: 44, zIndex: 14 },
    ),
    {
      background: colors.surface,
      color: colors.text,
      border: "0",
      radius: 0,
      blockType: "product-action",
      extensions: { productId },
    },
  );
  addButton(
    builder, section.id, type, "atelier-hero-add", "Add to cart",
    f(
      { x: 236, y: 574, width: 142, height: 40, zIndex: 14 },
      { x: 202, y: 518, width: 140, height: 38, zIndex: 14 },
      { x: 180, y: 446, width: 144, height: 44, zIndex: 14 },
    ),
    {
      background: "transparent",
      color: colors.textInverse,
      border: `1px solid ${colors.border}`,
      radius: 0,
      action: "add-to-cart",
      blockType: "product-action",
      extensions: { productId },
    },
  );
  synchronizeProductReference(
    { rootNodeId: "atelier-root", nodes: builder.nodes },
    [
      "atelier-hotspot",
      "atelier-hero-product-title",
      "atelier-hero-product-price",
      "atelier-hero-view-product",
      "atelier-hero-add",
    ],
    productId,
    "atelier-hero-product",
  );
};

const addBrandStory = (builder: AtelierSceneBuilder, profile: AtelierStoreProfile) => {
  const type = "brand-story" as const;
  const section = builder.add("atelier-root", {
    id: "atelier-brand-story",
    type: "section",
    name: "Brand story",
    frames: sectionFrames.brand,
    fills: solid(colors.surface),
    props: { overflow: "hidden", desktopArrangement: "editorial-collage", mobileArrangement: "stacked" },
    extensions: sectionExtensions(type),
  });
  addImage(
    builder, section.id, type, "atelier-story-primary", "Craftsperson shaping walnut", craftImage,
    f(
      { x: 48, y: 64, width: 402, height: 570, zIndex: 2 },
      { x: 32, y: 54, width: 300, height: 650, zIndex: 2 },
      { x: 20, y: 48, width: 350, height: 420, zIndex: 2 },
    ),
  );
  addImage(
    builder, section.id, type, "atelier-story-secondary", "Quiet living interior", storyImage,
    f(
      { x: 832, y: 72, width: 320, height: 220, zIndex: 2 },
      { x: 458, y: 72, width: 278, height: 230, zIndex: 2 },
      { x: 176, y: 492, width: 194, height: 152, zIndex: 2 },
    ),
  );
  addText(
    builder, section.id, type, "atelier-story-eyebrow", "Story eyebrow", "OUR MATERIAL LANGUAGE",
    f(
      { x: 520, y: 96, width: 260, height: 20 },
      { x: 372, y: 92, width: 240, height: 20 },
      { x: 20, y: 684, width: 240, height: 20 },
    ),
    10,
    { fontWeight: 700, letterSpacing: 1.4, blockType: "eyebrow" },
  );
  addText(
    builder, section.id, type, "atelier-story-heading", "Story heading", "Made slowly.\nLived with fully.",
    f(
      { x: 520, y: 150, width: 620, height: 174 },
      { x: 372, y: 138, width: 360, height: 158 },
      { x: 20, y: 720, width: 350, height: 118 },
    ),
    62,
    {
      fontFamily: sans,
      fontWeight: 500,
      lineHeight: 1.04,
      semanticTag: "h2",
      blockType: "heading",
      responsiveFontSize: { tablet: 50, mobile: 42 },
    },
  );
  addText(
    builder, section.id, type, "atelier-story-copy", "Story copy",
    profile.store_about?.trim() || "We work with enduring timber, natural fibers and local makers to create pieces that settle into a room rather than compete with it.",
    f(
      { x: 520, y: 368, width: 430, height: 110 },
      { x: 372, y: 334, width: 350, height: 142 },
      { x: 20, y: 850, width: 350, height: 102 },
    ),
    16,
    {
      color: colors.textMuted,
      lineHeight: 1.55,
      blockType: "paragraph",
      extensions: { dynamicBinding: { source: "store", field: "store_about", target: "text" } },
    },
  );
  addButton(
    builder, section.id, type, "atelier-story-link", "Read our story",
    f(
      { x: 520, y: 510, width: 140, height: 40 },
      { x: 372, y: 506, width: 136, height: 40 },
      { x: 20, y: 948, width: 138, height: 38 },
    ),
    { background: colors.text, color: colors.textInverse, border: "0", radius: 0, navigationTarget: { type: "page", entityId: "about" } },
  );
};

const addCraftsmanship = (builder: AtelierSceneBuilder) => {
  const type = "craftsmanship-features" as const;
  const section = builder.add("atelier-root", {
    id: "atelier-craftsmanship",
    type: "section",
    name: "Craftsmanship features",
    frames: sectionFrames.craft,
    fills: solid(colors.surfaceInverse),
    props: { overflow: "hidden", activeFeature: "precision" },
    extensions: sectionExtensions(type),
  });
  addText(
    builder, section.id, type, "atelier-craft-heading", "Craft statement", "Details are not decoration.\nThey are the work.",
    f(
      { x: 48, y: 64, width: 620, height: 184 },
      { x: 32, y: 54, width: 480, height: 154 },
      { x: 20, y: 46, width: 350, height: 170 },
    ),
    58,
    {
      color: colors.textInverse,
      fontFamily: sans,
      fontWeight: 500,
      lineHeight: 1.05,
      semanticTag: "h2",
      blockType: "heading",
      responsiveFontSize: { tablet: 48, mobile: 40 },
    },
  );
  addText(
    builder, section.id, type, "atelier-craft-copy", "Craft introduction", "Every joint, surface and proportion is considered for daily use and a long life.",
    f(
      { x: 790, y: 78, width: 340, height: 82 },
      { x: 506, y: 70, width: 228, height: 96 },
      { x: 20, y: 228, width: 350, height: 54 },
    ),
    15,
    { color: "#BEB8B0", lineHeight: 1.5, blockType: "paragraph" },
  );
  addImage(
    builder, section.id, type, "atelier-craft-image", "Hand-finished walnut frame", craftImage,
    f(
      { x: 48, y: 258, width: 520, height: 410, zIndex: 2 },
      { x: 32, y: 226, width: 348, height: 472, zIndex: 2 },
      { x: 20, y: 306, width: 350, height: 314, zIndex: 2 },
    ),
  );
  const features = [
    ["precision", "01", "Precision craftsmanship", "Joinery designed to remain stable through years of daily use."],
    ["materials", "02", "Premium materials", "Responsibly sourced timber, natural fibers and low-impact finishes."],
    ["aesthetics", "03", "Minimalist aesthetics", "Calm silhouettes with no unnecessary line, seam or gesture."],
  ];
  features.forEach(([key, number, heading, copy], index) => {
    const y = 274 + index * 126;
    const mobileY = 654 + index * 94;
    addText(
      builder, section.id, type, `atelier-feature-${key}-number`, `${heading} number`, number,
      f(
        { x: 646, y, width: 40, height: 24, zIndex: 4 },
        { x: 420, y: 240 + index * 142, width: 36, height: 24, zIndex: 4 },
        { x: 20, y: mobileY, width: 34, height: 22, zIndex: 4 },
      ),
      11,
      { color: "#9B958E", fontWeight: 700, blockType: "feature-item" },
    );
    addText(
      builder, section.id, type, `atelier-feature-${key}-heading`, heading, heading,
      f(
        { x: 710, y: y - 2, width: 400, height: 34, zIndex: 4 },
        { x: 466, y: 238 + index * 142, width: 270, height: 34, zIndex: 4 },
        { x: 66, y: mobileY - 2, width: 304, height: 28, zIndex: 4 },
      ),
      21,
      { color: colors.textInverse, fontFamily: sans, fontWeight: 500, blockType: "feature-item" },
    );
    addText(
      builder, section.id, type, `atelier-feature-${key}-copy`, `${heading} description`, copy,
      f(
        { x: 710, y: y + 40, width: 390, height: 56, zIndex: 4 },
        { x: 466, y: 278 + index * 142, width: 260, height: 74, zIndex: 4 },
        { x: 66, y: mobileY + 30, width: 300, height: 52, zIndex: 4 },
      ),
      13,
      { color: "#AFA9A2", lineHeight: 1.45, blockType: "feature-item" },
    );
  });
};

const productBinding = (
  productId: string,
  field: "name" | "image_url" | "price_cents",
  target: "text" | "src",
  format?: "currency",
) => ({ source: "product", field, target, productId, format });

const addProductCard = (
  builder: AtelierSceneBuilder,
  sectionId: string,
  productId: string,
  index: number,
) => {
  const type = "featured-product-collection" as const;
  const desktopX = 48 + index * 282;
  const tabletX = 28 + (index % 2) * 360;
  const tabletY = 206 + Math.floor(index / 2) * 332;
  const mobileY = 222 + index * 282;
  const card = builder.add(sectionId, {
    id: `atelier-product-card-${productId}`,
    type: "container",
    name: `Product card ${index + 1}`,
    frames: f(
      { x: desktopX, y: 230, width: 258, height: 574, zIndex: 3 },
      { x: tabletX, y: tabletY, width: 340, height: 310, zIndex: 3 },
      { x: 20, y: mobileY, width: 350, height: 256, zIndex: 3 },
    ),
    props: { overflow: "hidden" },
    extensions: blockExtensions(type, "product-card", { productId }),
  });
  addImage(
    builder, card.id, type, `atelier-product-card-${productId}-image`, `Product ${index + 1} image`, undefined,
    f(
      { x: 0, y: 0, width: 258, height: 408, zIndex: 1 },
      { x: 0, y: 0, width: 340, height: 218, zIndex: 1 },
      { x: 0, y: 0, width: 350, height: 176, zIndex: 1 },
    ),
    {
      extensions: {
        productId,
        dynamicBinding: productBinding(productId, "image_url", "src"),
      },
    },
  );
  addText(
    builder, card.id, type, `atelier-product-card-${productId}-title`, `Product ${index + 1} title`, "Product",
    f(
      { x: 0, y: 428, width: 182, height: 48, zIndex: 3 },
      { x: 0, y: 232, width: 230, height: 34, zIndex: 3 },
      { x: 0, y: 188, width: 230, height: 30, zIndex: 3 },
    ),
    18,
    {
      fontFamily: sans,
      fontWeight: 500,
      blockType: "product-reference",
      extensions: { productId, dynamicBinding: productBinding(productId, "name", "text") },
    },
  );
  addText(
    builder, card.id, type, `atelier-product-card-${productId}-price`, `Product ${index + 1} price`, "Live price",
    f(
      { x: 0, y: 486, width: 120, height: 24, zIndex: 3 },
      { x: 0, y: 272, width: 120, height: 22, zIndex: 3 },
      { x: 0, y: 224, width: 120, height: 20, zIndex: 3 },
    ),
    13,
    {
      color: colors.textMuted,
      blockType: "product-price",
      extensions: {
        productId,
        dynamicBinding: productBinding(productId, "price_cents", "text", "currency"),
      },
    },
  );
  addButton(
    builder, card.id, type, `atelier-product-card-${productId}-action`, "View",
    f(
      { x: 172, y: 480, width: 86, height: 34, zIndex: 3 },
      { x: 254, y: 266, width: 86, height: 34, zIndex: 3 },
      { x: 264, y: 216, width: 86, height: 34, zIndex: 3 },
    ),
    {
      background: colors.text,
      color: colors.textInverse,
      border: "0",
      radius: 0,
      extensions: { productId },
      blockType: "product-action",
    },
  );
  synchronizeProductReferenceSubtree(
    { rootNodeId: "atelier-root", nodes: builder.nodes },
    card.id,
    productId,
    card.id,
  );
};

const addFeaturedProducts = (
  builder: AtelierSceneBuilder,
  products: AtelierProductInput[],
) => {
  const type = "featured-product-collection" as const;
  const section = builder.add("atelier-root", {
    id: "atelier-products",
    type: "section",
    name: "Featured product collection",
    frames: sectionFrames.products,
    fills: solid(colors.background),
    props: {
      overflow: "hidden",
      source: { type: "all-products" },
      maximumProducts: 4,
      columns: { base: 4, tablet: 2, mobile: 1 },
      imageRatio: "portrait",
      showPrice: true,
      showQuickAdd: true,
      showQuickView: true,
      pagination: "none",
    },
    extensions: sectionExtensions(type),
  });
  addText(
    builder, section.id, type, "atelier-products-eyebrow", "Collection eyebrow", "THE CURRENT EDIT",
    f(
      { x: 48, y: 62, width: 250, height: 20 },
      { x: 28, y: 48, width: 220, height: 20 },
      { x: 20, y: 42, width: 220, height: 20 },
    ),
    10,
    { fontWeight: 700, letterSpacing: 1.4, blockType: "eyebrow" },
  );
  addText(
    builder, section.id, type, "atelier-products-heading", "Collection heading", "Objects for a considered home.",
    f(
      { x: 48, y: 98, width: 730, height: 106 },
      { x: 28, y: 82, width: 480, height: 94 },
      { x: 20, y: 76, width: 350, height: 78 },
    ),
    50,
    {
      fontFamily: sans,
      fontWeight: 500,
      lineHeight: 1.05,
      semanticTag: "h2",
      blockType: "heading",
      responsiveFontSize: { tablet: 44, mobile: 36 },
    },
  );
  addButton(
    builder, section.id, type, "atelier-products-filter", "All pieces",
    f(
      { x: 938, y: 108, width: 96, height: 38 },
      { x: 538, y: 150, width: 92, height: 36 },
      { x: 20, y: 168, width: 94, height: 36 },
    ),
    {
      radius: 0,
      blockType: "collection-filter",
      navigationTarget: { type: "catalog" },
    },
  );
  addButton(
    builder, section.id, type, "atelier-products-sort", "Newest",
    f(
      { x: 1044, y: 108, width: 106, height: 38 },
      { x: 640, y: 150, width: 96, height: 36 },
      { x: 124, y: 168, width: 96, height: 36 },
    ),
    {
      radius: 0,
      blockType: "collection-sort",
      navigationTarget: { type: "catalog" },
    },
  );
  products.slice(0, 4).forEach((product, index) => {
    addProductCard(builder, section.id, String(product.id), index);
  });
  if (!products.length) {
    addShape(
      builder, section.id, type, "atelier-products-empty-bg", "Empty catalog panel",
      f(
        { x: 48, y: 228, width: 1104, height: 520 },
        { x: 28, y: 216, width: 712, height: 560 },
        { x: 20, y: 230, width: 350, height: 510 },
      ),
      colors.surface,
      { strokes: stroke(colors.border) },
    );
    addText(
      builder, section.id, type, "atelier-products-empty", "Empty catalog message",
      "Publish products from the dashboard.\nThey will appear here automatically.",
      f(
        { x: 350, y: 430, width: 500, height: 100, zIndex: 3 },
        { x: 170, y: 430, width: 430, height: 100, zIndex: 3 },
        { x: 54, y: 420, width: 282, height: 100, zIndex: 3 },
      ),
      28,
      { fontFamily: serif, lineHeight: 1.2, textAlign: "center", blockType: "empty-state" },
    );
  }
};

const addCustomerStories = (builder: AtelierSceneBuilder) => {
  const type = "customer-stories" as const;
  const section = builder.add("atelier-root", {
    id: "atelier-customer-stories",
    type: "section",
    name: "Customer stories",
    frames: sectionFrames.stories,
    fills: solid(colors.surface),
    props: { overflow: "hidden", mode: "editorial-split", source: "manual" },
    extensions: sectionExtensions(type),
  });
  addText(
    builder, section.id, type, "atelier-stories-eyebrow", "Stories eyebrow", "IN THEIR ROOMS",
    f(
      { x: 48, y: 54, width: 220, height: 20 },
      { x: 32, y: 48, width: 210, height: 20 },
      { x: 20, y: 42, width: 210, height: 20 },
    ),
    10,
    { fontWeight: 700, letterSpacing: 1.4, blockType: "eyebrow" },
  );
  addText(
    builder, section.id, type, "atelier-stories-heading", "Stories heading", "Designed to become\npart of the story.",
    f(
      { x: 48, y: 96, width: 500, height: 142 },
      { x: 32, y: 86, width: 400, height: 158 },
      { x: 20, y: 78, width: 350, height: 170 },
    ),
    50,
    {
      fontFamily: sans,
      fontWeight: 500,
      lineHeight: 1.05,
      semanticTag: "h2",
      blockType: "heading",
      responsiveFontSize: { tablet: 44, mobile: 40 },
    },
  );
  addText(
    builder, section.id, type, "atelier-stories-copy", "Stories introduction", "Homes are shaped over time. These pieces were chosen for the life already happening around them.",
    f(
      { x: 48, y: 270, width: 390, height: 82 },
      { x: 32, y: 258, width: 340, height: 90 },
      { x: 20, y: 264, width: 350, height: 70 },
    ),
    15,
    { color: colors.textMuted, lineHeight: 1.5, blockType: "paragraph" },
  );
  addImage(
    builder, section.id, type, "atelier-testimonial-image", "A quiet home with modular seating", storyImage,
    f(
      { x: 510, y: 58, width: 642, height: 404, zIndex: 2 },
      { x: 402, y: 48, width: 334, height: 336, zIndex: 2 },
      { x: 20, y: 342, width: 350, height: 264, zIndex: 2 },
    ),
  );
  addShape(
    builder, section.id, type, "atelier-testimonial-card", "Editorial testimonial card",
    f(
      { x: 510, y: 478, width: 642, height: 188, zIndex: 2 },
      { x: 32, y: 420, width: 704, height: 270, zIndex: 2 },
      { x: 20, y: 608, width: 350, height: 244, zIndex: 2 },
    ),
    colors.surfaceInverse,
  );
  addText(
    builder, section.id, type, "atelier-testimonial-quote", "Customer quote",
    "\"The room feels calmer, but never empty. The chair is the first place everyone chooses.\"",
    f(
      { x: 544, y: 512, width: 540, height: 86, zIndex: 4 },
      { x: 64, y: 458, width: 620, height: 98, zIndex: 4 },
      { x: 44, y: 642, width: 302, height: 126, zIndex: 4 },
    ),
    24,
    { color: colors.textInverse, fontFamily: serif, lineHeight: 1.3, blockType: "testimonial" },
  );
  addText(
    builder, section.id, type, "atelier-testimonial-person", "Customer name", "Mara Chen / Copenhagen",
    f(
      { x: 544, y: 618, width: 300, height: 20, zIndex: 4 },
      { x: 64, y: 620, width: 300, height: 20, zIndex: 4 },
      { x: 44, y: 800, width: 260, height: 20, zIndex: 4 },
    ),
    10,
    { color: "#BDB7B0", fontWeight: 700, letterSpacing: 1.1, blockType: "testimonial" },
  );
};

const addFooter = (builder: AtelierSceneBuilder, profile: AtelierStoreProfile) => {
  const type = "site-footer" as const;
  const section = builder.add("atelier-root", {
    id: "atelier-footer",
    type: "section",
    name: "Global site footer",
    frames: sectionFrames.footer,
    fills: solid(colors.surfaceInverse),
    props: {
      overflow: "hidden",
      primaryMenuId: "main",
      secondaryMenuId: "footer",
      showNewsletter: true,
      showSocialLinks: true,
      showContactInformation: true,
    },
    extensions: { ...sectionExtensions(type), globalSectionGroup: "footer" },
  });
  addText(
    builder, section.id, type, "atelier-footer-kicker", "Footer kicker", "VISIT, WRITE OR BEGIN WITH A QUESTION",
    f(
      { x: 48, y: 60, width: 360, height: 20 },
      { x: 32, y: 48, width: 330, height: 20 },
      { x: 20, y: 44, width: 340, height: 20 },
    ),
    10,
    { color: "#BDB7B0", fontWeight: 700, letterSpacing: 1.4, blockType: "contact-information" },
  );
  addText(
    builder, section.id, type, "atelier-footer-contact", "Contact email", "hello@yourstore.com",
    f(
      { x: 48, y: 106, width: 900, height: 92 },
      { x: 32, y: 92, width: 680, height: 76 },
      { x: 20, y: 82, width: 350, height: 92 },
    ),
    60,
    {
      color: colors.textInverse,
      fontFamily: sans,
      fontWeight: 500,
      semanticTag: "h2",
      blockType: "contact-information",
      responsiveFontSize: { tablet: 48, mobile: 32 },
    },
  );
  addShape(
    builder, section.id, type, "atelier-footer-divider", "Footer divider",
    f(
      { x: 48, y: 230, width: 1104, height: 1 },
      { x: 32, y: 204, width: 704, height: 1 },
      { x: 20, y: 206, width: 350, height: 1 },
    ),
    "#47433F",
  );
  const footerLinks: Array<[string, string, unknown]> = [
    ["products", "Collections", { type: "catalog" }],
    ["about", "Our story", { type: "page", entityId: "about" }],
    ["contact", "Contact", { type: "page", entityId: "contact" }],
    ["account", "Account", { type: "account" }],
  ];
  footerLinks.forEach(([key, label, target], index) => {
    addButton(
      builder, section.id, type, `atelier-footer-link-${key}`, label,
      f(
        { x: 48, y: 282 + index * 50, width: 150, height: 32 },
        { x: 32, y: 254 + index * 48, width: 150, height: 32 },
        { x: 20, y: 246 + index * 48, width: 150, height: 32 },
      ),
      {
        color: colors.textInverse,
        border: "0",
        navigationTarget: target,
        blockType: "navigation-link",
      },
    );
  });
  addText(
    builder, section.id, type, "atelier-footer-services-heading", "Services heading", "SERVICES",
    f(
      { x: 286, y: 282, width: 180, height: 20 },
      { x: 238, y: 254, width: 160, height: 20 },
      { x: 202, y: 246, width: 160, height: 20 },
    ),
    10,
    { color: "#8F8983", fontWeight: 700, letterSpacing: 1.2, blockType: "menu-heading" },
  );
  addText(
    builder, section.id, type, "atelier-footer-services", "Services links", "Delivery\nCare guide\nTrade program\nReturns",
    f(
      { x: 286, y: 326, width: 200, height: 150 },
      { x: 238, y: 296, width: 190, height: 150 },
      { x: 202, y: 286, width: 168, height: 150 },
    ),
    14,
    { color: colors.textInverse, lineHeight: 2.25, blockType: "menu" },
  );
  addImage(
    builder, section.id, type, "atelier-footer-image", "Atelier interior", storyImage,
    f(
      { x: 650, y: 280, width: 502, height: 310, zIndex: 2 },
      { x: 462, y: 252, width: 274, height: 300, zIndex: 2 },
      { x: 20, y: 474, width: 350, height: 270, zIndex: 2 },
    ),
  );
  addText(
    builder, section.id, type, "atelier-footer-logo", "Footer logo",
    profile.business_name?.trim() || "ATELIER",
    f(
      { x: 48, y: 666, width: 360, height: 54 },
      { x: 32, y: 624, width: 300, height: 48 },
      { x: 20, y: 792, width: 350, height: 54 },
    ),
    40,
    {
      color: colors.textInverse,
      fontFamily: sans,
      fontWeight: 700,
      letterSpacing: 2,
      blockType: "store-logo",
      responsiveFontSize: { tablet: 36, mobile: 32 },
      extensions: { dynamicBinding: { source: "store", field: "business_name", target: "text" } },
    },
  );
  addText(
    builder, section.id, type, "atelier-footer-meta", "Footer legal",
    `Copyright ${new Date().getFullYear()} / Privacy / Terms / Built with StoreBlink`,
    f(
      { x: 650, y: 684, width: 502, height: 24 },
      { x: 380, y: 638, width: 356, height: 24 },
      { x: 20, y: 884, width: 350, height: 50 },
    ),
    10,
    { color: "#8F8983", textAlign: "right", blockType: "legal" },
  );
};

export const buildAtelierTemplateScene = (
  profile: AtelierStoreProfile = {},
  products: AtelierProductInput[] = [],
): SceneTree => {
  const builder = new AtelierSceneBuilder();
  builder.add(null, {
    id: "atelier-root",
    type: "section",
    name: "Atelier storefront",
    frames: f(
      { x: 0, y: 0, width: 1200, height: 5300 },
      { x: 0, y: 0, width: 768, height: 5384 },
      { x: 0, y: 0, width: 390, height: 6818 },
    ),
    fills: solid(colors.background),
    props: { overflow: "visible" },
    extensions: {
      themeId: "atelier",
      template: "atelier",
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

  addAnnouncement(builder);
  addHeader(builder, profile);
  addEditorialIntro(builder);
  addProductHero(builder, products);
  addBrandStory(builder, profile);
  addCraftsmanship(builder);
  addFeaturedProducts(builder, products);
  addCustomerStories(builder);
  addFooter(builder, profile);

  const scene = themeChromeSystem.ensureScene(
    validateSceneTree({ rootNodeId: "atelier-root", nodes: builder.nodes }),
  );
  assertValidSceneTreeStructure(scene);
  return scene;
};

export { atelierDefaultSectionOrder } from "../presets";

const removeSubtree = (scene: SceneTree, nodeId: string) => {
  const node = scene.nodes[nodeId];
  if (!node) return;
  node.childIds.forEach((childId) => removeSubtree(scene, childId));
  delete scene.nodes[nodeId];
};

const copySubtree = (
  target: SceneTree,
  source: SceneTree,
  nodeId: string,
) => {
  const node = source.nodes[nodeId];
  if (!node) return;
  target.nodes[nodeId] = structuredClone(node);
  node.childIds.forEach((childId) => copySubtree(target, source, childId));
};

export const reconcileAtelierProducts = (
  source: SceneTree,
  profile: AtelierStoreProfile,
  products: AtelierProductInput[],
): SceneTree => {
  const root = source.rootNodeId ? source.nodes[source.rootNodeId] : undefined;
  if (root?.extensions?.themeId !== "atelier" && root?.extensions?.template !== "atelier") {
    return source;
  }

  const next = themeChromeSystem.ensureScene(source);
  const baseline = buildAtelierTemplateScene(profile, products);
  const section = next.nodes["atelier-products"];
  const baselineSection = baseline.nodes["atelier-products"];
  if (!section || !baselineSection) return next;

  const currentProductCards = section.childIds.filter(
    (id) => next.nodes[id]?.extensions?.blockType === "product-card",
  );
  const desiredProductCards = baselineSection.childIds.filter(
    (id) => baseline.nodes[id]?.extensions?.blockType === "product-card",
  );
  const desiredSectionChildren = new Set(baselineSection.childIds);
  const desiredIds = new Set(desiredProductCards);
  const availableProductIds = new Set(
    products
      .map((product) => product.id)
      .filter((id): id is string | number => id !== undefined && id !== null)
      .map(String),
  );

  currentProductCards
    .filter((id) => !desiredIds.has(id))
    .forEach((id) => removeSubtree(next, id));
  section.childIds
    .filter((id) => id.startsWith("atelier-products-empty") && !desiredSectionChildren.has(id))
    .forEach((id) => removeSubtree(next, id));

  desiredProductCards.forEach((cardId) => {
    const baselineCard = baseline.nodes[cardId];
    const existingCard = next.nodes[cardId];
    if (!existingCard) {
      copySubtree(next, baseline, cardId);
      return;
    }
    baselineCard.childIds.forEach((childId) => {
      const baselineChild = baseline.nodes[childId];
      const existingChild = next.nodes[childId];
      if (!existingChild) {
        copySubtree(next, baseline, childId);
        return;
      }
      next.nodes[childId] = {
        ...existingChild,
        extensions: {
          ...(existingChild.extensions ?? {}),
          ...(
            existingChild.extensions?.dynamicBinding
              ? {}
              : { dynamicBinding: baselineChild.extensions?.dynamicBinding }
          ),
        },
      };
    });
    const baselineProductId = productReferenceId(baselineCard) ?? "";
    const persistedProductId = productReferenceId(existingCard);
    const productId =
      persistedProductId && availableProductIds.has(persistedProductId)
        ? persistedProductId
        : baselineProductId;
    synchronizeProductReferenceSubtree(next, cardId, productId, cardId);
  });

  const baselineManaged = new Set(
    baselineSection.childIds.filter((id) =>
      id.startsWith("atelier-product-card-") || id.startsWith("atelier-products-empty"),
    ),
  );
  const customChildren = section.childIds.filter(
    (id) =>
      !currentProductCards.includes(id) &&
      !id.startsWith("atelier-products-empty") &&
      !baselineManaged.has(id),
  );
  section.childIds = [
    ...baselineSection.childIds.filter((id) => {
      if (baselineManaged.has(id) && !next.nodes[id]) copySubtree(next, baseline, id);
      return Boolean(next.nodes[id]);
    }),
    ...customChildren.filter((id) => next.nodes[id]),
  ];

  const heroIds = [
    "atelier-hotspot",
    "atelier-hero-product-title",
    "atelier-hero-product-price",
    "atelier-hero-view-product",
    "atelier-hero-add",
  ];
  heroIds.forEach((id) => {
    const current = next.nodes[id];
    const desired = baseline.nodes[id];
    if (!current || !desired) return;
    next.nodes[id] = {
      ...current,
      extensions: {
        ...(current.extensions ?? {}),
        ...(
          current.extensions?.dynamicBinding
            ? {}
            : { dynamicBinding: desired.extensions?.dynamicBinding }
        ),
      },
    };
  });
  const persistedHeroProductId = heroIds
    .map((id) => productReferenceId(next.nodes[id]))
    .find((id): id is string => Boolean(id && availableProductIds.has(id)));
  const baselineHeroProductId = heroIds
    .map((id) => productReferenceId(baseline.nodes[id]))
    .find((id): id is string => Boolean(id));
  synchronizeProductReference(
    next,
    heroIds,
    persistedHeroProductId ?? baselineHeroProductId,
    "atelier-hero-product",
  );

  return validateSceneTree(next);
};
