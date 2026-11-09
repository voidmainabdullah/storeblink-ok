import { cloneSceneNode, cloneSceneTree, createSceneNode } from "@/engine/scene-graph";
import { assertValidSceneTreeStructure, validateSceneTree } from "@/engine/validation";
import {
  productReferenceId,
  synchronizeProductReferenceSubtree,
} from "@/document/dynamic-sources";
import { structuredLayoutSystem } from "@/layout/structured";
import type { ResponsiveOverrideMap } from "@/layout/responsive";
import { themeChromeSystem } from "@/theme-engine/chrome";
import { createDefaultStoreNavigationDocument } from "@/content/menus/NavigationSystem";
import type { ResponsiveBreakpoint } from "@/stores/responsive.store";
import type { ElementType, SceneNode, SceneTree, StyleData, TransformData } from "@/types";
import type { StoreSceneItem, StoreSceneProfile } from "./storeSceneAdapter";

type Frame = Pick<TransformData, "x" | "y" | "width" | "height"> & { zIndex?: number };
type Frames = Record<ResponsiveBreakpoint, Frame>;

type NodeConfig = {
  id: string;
  type: ElementType;
  name: string;
  frames: Frames;
  props?: Record<string, unknown>;
  responsiveProps?: Partial<Record<ResponsiveBreakpoint, Record<string, unknown>>>;
  fills?: StyleData["fills"];
  strokes?: StyleData["strokes"];
  effects?: StyleData["effects"];
  radius?: number;
  extensions?: Record<string, unknown>;
  visibility?: Partial<Record<ResponsiveBreakpoint, boolean>>;
  locked?: boolean;
};

const timestamp = 1_782_000_000_000;
const solid = (color: string): StyleData["fills"] => [{ type: "solid", color }];
const stroke = (color: string, width = 1): StyleData["strokes"] => [{ color, width, style: "solid" }];
const shadow = (color: string): StyleData["effects"] => [
  { type: "shadow", value: { x: 0, y: 18, blur: 44, spread: -26, color } },
];
const safeText = (value: unknown, fallback: string) =>
  typeof value === "string" && value.trim() ? value.trim() : fallback;

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

const frames = (desktop: Frame, tablet: Frame, mobile: Frame): Frames => ({ desktop, tablet, mobile });

const iconMarkup = (paths: string, strokeColor = "currentColor") =>
  `<svg viewBox="0 0 24 24" width="100%" height="100%" fill="none" stroke="${strokeColor}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths}</svg>`;

const menuIcon = iconMarkup('<path d="M4 7h16M4 12h16M4 17h16"/>');
const cartIcon = iconMarkup('<circle cx="9" cy="20" r="1"/><circle cx="19" cy="20" r="1"/><path d="M3 4h2l2.4 11.2a2 2 0 0 0 2 1.6h7.8a2 2 0 0 0 2-1.6L21 8H6"/>');
const searchIcon = iconMarkup('<circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/>');
const accountIcon = iconMarkup('<circle cx="12" cy="8" r="3.5"/><path d="M5.5 20c.8-4 3-6 6.5-6s5.7 2 6.5 6"/>');
const arrowIcon = iconMarkup('<path d="M5 12h14m-5-5 5 5-5 5"/>', "#ffffff");

const structuredExtensions = (
  editorKind: "page" | "section" | "block" | "internal",
  extras: Record<string, unknown> = {},
) => ({
  editorKind,
  structured: editorKind !== "internal",
  selectable: editorKind !== "internal",
  ...(editorKind === "section" ? { responsiveDefaultsInitialized: true } : {}),
  ...extras,
});

class BasicTemplateBuilder {
  readonly nodes: Record<string, SceneNode> = {};

  add(parentId: string | null, config: NodeConfig): SceneNode {
    const desktopVisible = config.visibility?.desktop ?? true;
    const node = createSceneNode(
      {
        id: config.id,
        type: config.type,
        name: config.name,
        props: config.props,
        transform: transform(config.frames.desktop),
        layout: {
          mode: "absolute",
          responsive: {
            desktop: {
              transform: transform(config.frames.desktop),
              props: config.responsiveProps?.desktop,
              meta: { hidden: !desktopVisible, locked: config.locked ?? false },
            },
            tablet: {
              transform: transform(config.frames.tablet),
              props: config.responsiveProps?.tablet,
              meta: { hidden: !(config.visibility?.tablet ?? desktopVisible), locked: config.locked ?? false },
            },
            mobile: {
              transform: transform(config.frames.mobile),
              props: config.responsiveProps?.mobile,
              meta: { hidden: !(config.visibility?.mobile ?? desktopVisible), locked: config.locked ?? false },
            },
          },
        },
        style: {
          fills: config.fills ?? [],
          strokes: config.strokes ?? [],
          effects: config.effects ?? [],
          opacity: 1,
          cornerRadius: config.radius,
        },
        meta: { hidden: !desktopVisible, locked: config.locked ?? false },
        extensions: config.extensions,
      },
      parentId,
      timestamp,
    );
    this.nodes[node.id] = node;
    if (parentId) this.nodes[parentId]?.childIds.push(node.id);
    return node;
  }
}

const textProps = (
  text: string,
  fontSize: number,
  fontWeight: number,
  color: string,
  extras: Record<string, unknown> = {},
) => ({
  text,
  fontSize,
  fontWeight,
  color,
  fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif",
  lineHeight: 1.18,
  ...extras,
});

const addNavLink = (
  builder: BasicTemplateBuilder,
  parentId: string,
  id: string,
  label: string,
  target: "home" | "products" | "about" | "contact",
  linkFrames: Frames,
  visibility?: NodeConfig["visibility"],
) =>
  builder.add(parentId, {
    id,
    type: "button",
    name: `${label} link`,
    frames: linkFrames,
    props: {
      label,
      background: "transparent",
      color: "#181818",
      border: "0",
      fontSize: 14,
      fontWeight: 620,
    },
    extensions: structuredExtensions("block", {
      sectionType: "header",
      blockType: "navigation-link",
      navigationTarget: target,
      navigationSurfaceVisibility: {
        desktop: visibility?.desktop ?? true,
        tablet: visibility?.tablet ?? true,
        mobile: visibility?.mobile ?? true,
      },
    }),
    visibility,
  });

const addHeader = (builder: BasicTemplateBuilder, storeName: string) => {
  const section = builder.add("basic-root", {
    id: "basic-header",
    type: "section",
    name: "Main header",
    frames: frames(
      { x: 0, y: 0, width: 1200, height: 96, zIndex: 100 },
      { x: 0, y: 0, width: 768, height: 88, zIndex: 100 },
      { x: 0, y: 0, width: 390, height: 72, zIndex: 100 },
    ),
    fills: solid("#ffffff"),
    strokes: stroke("rgba(23,23,23,0.08)"),
    props: { overflow: "visible", background: "#ffffff", sticky: true },
    extensions: structuredExtensions("section", {
      sectionType: "header",
      global: false,
      sectionScope: "local",
      sectionInstanceId: "basic-header",
    }),
  });

  builder.add(section.id, {
    id: "basic-brand",
    type: "text",
    name: "Store name",
    frames: frames(
      { x: 48, y: 31, width: 220, height: 34, zIndex: 5 },
      { x: 28, y: 27, width: 180, height: 34, zIndex: 5 },
      { x: 18, y: 21, width: 180, height: 30, zIndex: 5 },
    ),
    props: textProps(storeName, 22, 800, "#111111", { lineHeight: 1.1 }),
    responsiveProps: { mobile: { fontSize: 19 } },
    extensions: structuredExtensions("internal", {
      dynamicBinding: { source: "store", field: "business_name", target: "text" },
      navigationTarget: "home",
      ariaLabel: "Home",
    }),
  });

  addNavLink(builder, section.id, "basic-nav-home", "Home", "home", frames(
    { x: 400, y: 29, width: 78, height: 38, zIndex: 6 },
    { x: 255, y: 25, width: 72, height: 38, zIndex: 6 },
    { x: 24, y: 78, width: 342, height: 48, zIndex: 6 },
  ), { desktop: true, tablet: false, mobile: false });
  addNavLink(builder, section.id, "basic-nav-products", "Products", "products", frames(
    { x: 482, y: 29, width: 92, height: 38, zIndex: 6 },
    { x: 330, y: 25, width: 88, height: 38, zIndex: 6 },
    { x: 24, y: 134, width: 342, height: 48, zIndex: 6 },
  ), { desktop: true, tablet: false, mobile: false });
  addNavLink(builder, section.id, "basic-nav-about", "About us", "about", frames(
    { x: 578, y: 29, width: 92, height: 38, zIndex: 6 },
    { x: 422, y: 25, width: 88, height: 38, zIndex: 6 },
    { x: 24, y: 190, width: 342, height: 48, zIndex: 6 },
  ), { desktop: true, tablet: false, mobile: false });
  addNavLink(builder, section.id, "basic-nav-contact", "Contact", "contact", frames(
    { x: 674, y: 29, width: 84, height: 38, zIndex: 6 },
    { x: 514, y: 25, width: 82, height: 38, zIndex: 6 },
    { x: 24, y: 246, width: 342, height: 48, zIndex: 6 },
  ), { desktop: true, tablet: false, mobile: false });

  builder.add(section.id, {
    id: "basic-search-icon",
    type: "svg",
    name: "Search products",
    frames: frames(
      { x: 1028, y: 34, width: 26, height: 26, zIndex: 8 },
      { x: 640, y: 31, width: 25, height: 25, zIndex: 8 },
      { x: 244, y: 23, width: 25, height: 25, zIndex: 8 },
    ),
    props: { markup: searchIcon, color: "#151515", ariaLabel: "Browse products" },
    extensions: structuredExtensions("internal", { navigationTarget: "products" }),
  });
  builder.add(section.id, {
    id: "basic-account-icon",
    type: "svg",
    name: "Customer account",
    frames: frames(
      { x: 1074, y: 34, width: 27, height: 27, zIndex: 8 },
      { x: 684, y: 31, width: 26, height: 26, zIndex: 8 },
      { x: 282, y: 23, width: 26, height: 26, zIndex: 8 },
    ),
    props: { markup: accountIcon, color: "#151515", ariaLabel: "Customer account" },
    extensions: structuredExtensions("internal", { action: "open-account" }),
  });
  builder.add(section.id, {
    id: "basic-cart-icon",
    type: "svg",
    name: "Cart",
    frames: frames(
      { x: 1120, y: 34, width: 27, height: 27, zIndex: 8 },
      { x: 724, y: 31, width: 26, height: 26, zIndex: 8 },
      { x: 320, y: 23, width: 26, height: 26, zIndex: 8 },
    ),
    props: { markup: cartIcon, color: "#151515", ariaLabel: "Open cart" },
    extensions: structuredExtensions("internal", { action: "open-cart" }),
  });
  builder.add(section.id, {
    id: "basic-menu-icon",
    type: "svg",
    name: "Open navigation",
    frames: frames(
      { x: 1134, y: 34, width: 28, height: 28, zIndex: 8 },
      { x: 730, y: 31, width: 26, height: 26, zIndex: 8 },
      { x: 354, y: 23, width: 24, height: 24, zIndex: 8 },
    ),
    props: { markup: menuIcon, color: "#151515", ariaLabel: "Open navigation menu" },
    extensions: structuredExtensions("internal", { action: "toggle-mobile-menu" }),
    visibility: { desktop: false, tablet: true, mobile: true },
  });

  const drawer = builder.add(section.id, {
    id: "basic-mobile-menu",
    type: "container",
    name: "Mobile navigation drawer",
    frames: frames(
      { x: 0, y: 72, width: 0, height: 0, zIndex: 90 },
      { x: 12, y: 82, width: 744, height: 318, zIndex: 90 },
      { x: 12, y: 66, width: 366, height: 318, zIndex: 90 },
    ),
    props: { overflow: "hidden" },
    fills: solid("#ffffff"),
    strokes: stroke("rgba(23,23,23,0.12)"),
    effects: shadow("rgba(0,0,0,0.25)"),
    radius: 12,
    extensions: structuredExtensions("internal", { runtimeVisibility: "mobile-menu" }),
    visibility: { desktop: false, tablet: false, mobile: false },
  });
  [
    ["basic-mobile-home", "Home", "home", 18],
    ["basic-mobile-contact", "Contact", "contact", 74],
    ["basic-mobile-about", "About us", "about", 130],
    ["basic-mobile-products", "Products", "products", 186],
  ].forEach(([id, label, target, y]) => {
    builder.add(drawer.id, {
      id: String(id),
      type: "button",
      name: `${label} mobile link`,
      frames: frames(
        { x: 0, y: 0, width: 0, height: 0 },
        { x: 16, y: Number(y), width: 712, height: 48, zIndex: 2 },
        { x: 16, y: Number(y), width: 334, height: 48, zIndex: 2 },
      ),
      props: { label, background: "#f6f6f4", color: "#171717", border: "0", fontSize: 16, fontWeight: 650 },
      radius: 8,
      extensions: structuredExtensions("internal", { navigationTarget: target }),
      visibility: { desktop: false, tablet: true, mobile: true },
    });
  });
};

const addHero = (builder: BasicTemplateBuilder, accent: string) => {
  const section = builder.add("basic-root", {
    id: "basic-hero",
    type: "section",
    name: "Split hero",
    frames: frames(
      { x: 0, y: 96, width: 1200, height: 620, zIndex: 10 },
      { x: 0, y: 88, width: 768, height: 680, zIndex: 10 },
      { x: 0, y: 72, width: 390, height: 780, zIndex: 10 },
    ),
    props: { overflow: "hidden", background: "#f3f1eb", contentAlignment: "left", reverseOnMobile: false },
    fills: solid("#f3f1eb"),
    extensions: structuredExtensions("section", { sectionType: "hero" }),
  });

  builder.add(section.id, {
    id: "basic-hero-eyebrow",
    type: "text",
    name: "Hero eyebrow",
    frames: frames(
      { x: 64, y: 80, width: 420, height: 24, zIndex: 3 },
      { x: 42, y: 70, width: 330, height: 24, zIndex: 3 },
      { x: 24, y: 40, width: 342, height: 22, zIndex: 3 },
    ),
    props: textProps("NEW SEASON ESSENTIALS", 13, 760, accent),
    extensions: structuredExtensions("block", { sectionType: "hero", blockType: "eyebrow", flowGroup: "content" }),
  });
  builder.add(section.id, {
    id: "basic-hero-heading",
    type: "text",
    name: "Hero heading",
    frames: frames(
      { x: 60, y: 116, width: 510, height: 244, zIndex: 4 },
      { x: 38, y: 106, width: 332, height: 190, zIndex: 4 },
      { x: 22, y: 76, width: 346, height: 164, zIndex: 4 },
    ),
    props: textProps("Everyday products, thoughtfully selected.", 58, 760, "#171717", { lineHeight: 1.04, semanticTag: "h1" }),
    responsiveProps: { tablet: { fontSize: 44 }, mobile: { fontSize: 38 } },
    extensions: structuredExtensions("block", { sectionType: "hero", blockType: "heading", flowGroup: "content" }),
  });
  builder.add(section.id, {
    id: "basic-hero-copy",
    type: "text",
    name: "Hero description",
    frames: frames(
      { x: 64, y: 374, width: 470, height: 72, zIndex: 4 },
      { x: 42, y: 318, width: 320, height: 112, zIndex: 4 },
      { x: 24, y: 252, width: 342, height: 92, zIndex: 4 },
    ),
    props: textProps("A clean, responsive starting point connected to your live StoreBlink catalog.", 18, 420, "#565656", { lineHeight: 1.55, semanticTag: "p" }),
    responsiveProps: { mobile: { fontSize: 16 } },
    extensions: structuredExtensions("block", { sectionType: "hero", blockType: "paragraph", flowGroup: "content" }),
  });
  builder.add(section.id, {
    id: "basic-hero-cta",
    type: "button",
    name: "Shop products button",
    frames: frames(
      { x: 64, y: 472, width: 176, height: 54, zIndex: 6 },
      { x: 42, y: 458, width: 170, height: 52, zIndex: 6 },
      { x: 24, y: 362, width: 342, height: 54, zIndex: 6 },
    ),
    props: { label: "Shop products", background: accent, color: "#ffffff", border: "0", fontSize: 15, fontWeight: 720 },
    radius: 7,
    extensions: structuredExtensions("block", {
      sectionType: "hero",
      blockType: "button",
      flowGroup: "content",
      navigationTarget: "products",
    }),
  });
  builder.add(section.id, {
    id: "basic-hero-image",
    type: "image",
    name: "Hero image",
    frames: frames(
      { x: 630, y: 42, width: 514, height: 536, zIndex: 2 },
      { x: 400, y: 44, width: 326, height: 590, zIndex: 2 },
      { x: 20, y: 446, width: 350, height: 304, zIndex: 2 },
    ),
    props: { alt: "Featured store collection", objectFit: "cover", objectPosition: "50% 50%", loading: "eager", uploadHint: "Add hero image" },
    fills: [{ type: "gradient", value: "linear-gradient(135deg,#d9ded4 0%,#aeb9aa 100%)" }],
    radius: 12,
    extensions: structuredExtensions("block", {
      sectionType: "hero",
      blockType: "image",
      placeholder: true,
      replaceable: true,
    }),
  });
};

const addProductCard = (
  builder: BasicTemplateBuilder,
  sectionId: string,
  productId: string,
  index: number,
  accent: string,
) => {
  const desktopX = 48 + index * 282;
  const tabletX = 28 + (index % 2) * 356;
  const tabletY = 160 + Math.floor(index / 2) * 324;
  const mobileY = 166 + index * 270;
  const card = builder.add(sectionId, {
    id: `basic-product-card-${productId}`,
    type: "container",
    name: `Product ${index + 1}`,
    frames: frames(
      { x: desktopX, y: 164, width: 258, height: 424, zIndex: 10 + index },
      { x: tabletX, y: tabletY, width: 328, height: 292, zIndex: 10 + index },
      { x: 24, y: mobileY, width: 342, height: 246, zIndex: 10 + index },
    ),
    props: { overflow: "hidden" },
    fills: solid("#ffffff"),
    strokes: stroke("rgba(23,23,23,0.10)"),
    radius: 10,
    extensions: structuredExtensions("block", {
      sectionType: "product-grid",
      blockType: "product-card",
      productId,
      dynamicSource: true,
    }),
  });
  builder.add(card.id, {
    id: `${card.id}-image`,
    type: "image",
    name: "Product image",
    frames: frames(
      { x: 12, y: 12, width: 234, height: 248, zIndex: 1 },
      { x: 12, y: 12, width: 138, height: 268, zIndex: 1 },
      { x: 10, y: 10, width: 142, height: 226, zIndex: 1 },
    ),
    props: { alt: "Product image", objectFit: "cover" },
    fills: solid("#ecece9"),
    radius: 7,
    extensions: structuredExtensions("internal", {
      productId,
      dynamicBinding: { source: "product", field: "image_url", target: "src", productId },
    }),
  });
  builder.add(card.id, {
    id: `${card.id}-title`,
    type: "text",
    name: "Product title",
    frames: frames(
      { x: 16, y: 282, width: 226, height: 48, zIndex: 2 },
      { x: 166, y: 42, width: 146, height: 54, zIndex: 2 },
      { x: 168, y: 34, width: 156, height: 54, zIndex: 2 },
    ),
    props: textProps("Product", 18, 720, "#171717", { semanticTag: "h3" }),
    responsiveProps: { mobile: { fontSize: 17 } },
    extensions: structuredExtensions("internal", {
      productId,
      dynamicBinding: { source: "product", field: "name", target: "text", productId },
    }),
  });
  builder.add(card.id, {
    id: `${card.id}-category`,
    type: "text",
    name: "Product category",
    frames: frames(
      { x: 16, y: 334, width: 226, height: 24, zIndex: 2 },
      { x: 166, y: 108, width: 146, height: 24, zIndex: 2 },
      { x: 168, y: 96, width: 156, height: 24, zIndex: 2 },
    ),
    props: textProps("Catalog", 13, 520, "#737373"),
    extensions: structuredExtensions("internal", {
      productId,
      dynamicBinding: { source: "product", field: "category", target: "text", productId },
    }),
  });
  builder.add(card.id, {
    id: `${card.id}-price`,
    type: "text",
    name: "Product price",
    frames: frames(
      { x: 16, y: 365, width: 120, height: 26, zIndex: 2 },
      { x: 166, y: 146, width: 132, height: 28, zIndex: 2 },
      { x: 168, y: 128, width: 146, height: 28, zIndex: 2 },
    ),
    props: textProps("$0.00", 16, 760, "#171717"),
    extensions: structuredExtensions("internal", {
      productId,
      dynamicBinding: { source: "product", field: "price_cents", target: "text", productId, format: "currency" },
    }),
  });
  builder.add(card.id, {
    id: `${card.id}-cta`,
    type: "button",
    name: "View product",
    frames: frames(
      { x: 144, y: 360, width: 98, height: 38, zIndex: 3 },
      { x: 166, y: 210, width: 132, height: 42, zIndex: 3 },
      { x: 168, y: 174, width: 146, height: 44, zIndex: 3 },
    ),
    props: { label: "View product", background: accent, color: "#ffffff", border: "0", fontSize: 12, fontWeight: 700 },
    radius: 6,
    extensions: structuredExtensions("internal", { productId }),
  });
  synchronizeProductReferenceSubtree(
    { rootNodeId: "basic-root", nodes: builder.nodes },
    card.id,
    productId,
    card.id,
  );
};

const addProducts = (builder: BasicTemplateBuilder, items: StoreSceneItem[], accent: string) => {
  const productIds = items
    .map((item) => item.id)
    .filter((id): id is string | number => id !== null && id !== undefined)
    .slice(0, 4)
    .map(String);
  const count = Math.max(1, productIds.length);
  const section = builder.add("basic-root", {
    id: "basic-products",
    type: "section",
    name: "Featured products",
    frames: frames(
      { x: 0, y: 716, width: 1200, height: 700, zIndex: 20 },
      { x: 0, y: 768, width: 768, height: productIds.length > 2 ? 850 : 540, zIndex: 20 },
      { x: 0, y: 852, width: 390, height: productIds.length ? 180 + count * 270 : 430, zIndex: 20 },
    ),
    props: { overflow: "hidden", heading: "Featured products", columns: 4 },
    responsiveProps: { tablet: { columns: 2 }, mobile: { columns: 1 } },
    fills: solid("#ffffff"),
    extensions: structuredExtensions("section", { sectionType: "product-grid", dataSource: "products" }),
  });
  builder.add(section.id, {
    id: "basic-products-eyebrow",
    type: "text",
    name: "Products eyebrow",
    frames: frames(
      { x: 48, y: 58, width: 300, height: 22, zIndex: 2 },
      { x: 28, y: 52, width: 250, height: 22, zIndex: 2 },
      { x: 24, y: 42, width: 250, height: 22, zIndex: 2 },
    ),
    props: textProps("LIVE CATALOG", 12, 760, accent),
    extensions: structuredExtensions("internal"),
  });
  builder.add(section.id, {
    id: "basic-products-heading",
    type: "text",
    name: "Products heading",
    frames: frames(
      { x: 48, y: 88, width: 560, height: 56, zIndex: 2 },
      { x: 28, y: 82, width: 520, height: 52, zIndex: 2 },
      { x: 24, y: 72, width: 342, height: 72, zIndex: 2 },
    ),
    props: textProps("Shop the latest products", 36, 760, "#171717", { semanticTag: "h2" }),
    responsiveProps: { mobile: { fontSize: 29 } },
    extensions: structuredExtensions("internal"),
  });
  if (!productIds.length) {
    builder.add(section.id, {
      id: "basic-products-empty",
      type: "container",
      name: "Products empty state",
      frames: frames(
        { x: 48, y: 170, width: 1104, height: 400, zIndex: 2 },
        { x: 28, y: 160, width: 712, height: 310, zIndex: 2 },
        { x: 24, y: 144, width: 342, height: 230, zIndex: 2 },
      ),
      props: { overflow: "hidden" },
      fills: solid("#f5f5f2"),
      strokes: stroke("rgba(23,23,23,0.10)"),
      radius: 10,
      extensions: structuredExtensions("internal"),
    });
    builder.add(section.id, {
      id: "basic-products-empty-copy",
      type: "text",
      name: "Products empty message",
      frames: frames(
        { x: 360, y: 330, width: 480, height: 60, zIndex: 3 },
        { x: 164, y: 278, width: 440, height: 54, zIndex: 3 },
        { x: 56, y: 228, width: 278, height: 62, zIndex: 3 },
      ),
      props: textProps("Add products from the Products page. They will appear here automatically.", 18, 560, "#666666", { textAlign: "center" }),
      responsiveProps: { mobile: { fontSize: 15 } },
      extensions: structuredExtensions("internal"),
    });
  } else {
    productIds.forEach((productId, index) => addProductCard(builder, section.id, productId, index, accent));
  }
};

const addStory = (builder: BasicTemplateBuilder, accent: string) => {
  const section = builder.add("basic-root", {
    id: "basic-story",
    type: "section",
    name: "Image with text",
    frames: frames(
      { x: 0, y: 1416, width: 1200, height: 400, zIndex: 30 },
      { x: 0, y: 1618, width: 768, height: 450, zIndex: 30 },
      { x: 0, y: 2112, width: 390, height: 680, zIndex: 30 },
    ),
    props: { overflow: "hidden", background: "#eef1ec" },
    fills: solid("#eef1ec"),
    extensions: structuredExtensions("section", { sectionType: "rich-text" }),
  });
  builder.add(section.id, {
    id: "basic-story-image",
    type: "image",
    name: "Story image",
    frames: frames(
      { x: 48, y: 44, width: 510, height: 312, zIndex: 2 },
      { x: 28, y: 40, width: 320, height: 370, zIndex: 2 },
      { x: 20, y: 24, width: 350, height: 300, zIndex: 2 },
    ),
    props: { alt: "Brand story", objectFit: "cover", uploadHint: "Add story image" },
    fills: [{ type: "gradient", value: "linear-gradient(135deg,#c8cfbf,#e5e8e1)" }],
    radius: 10,
    extensions: structuredExtensions("block", {
      sectionType: "rich-text",
      blockType: "image",
      placeholder: true,
      replaceable: true,
    }),
  });
  builder.add(section.id, {
    id: "basic-story-heading",
    type: "text",
    name: "Story heading",
    frames: frames(
      { x: 636, y: 76, width: 470, height: 110, zIndex: 3 },
      { x: 390, y: 70, width: 334, height: 120, zIndex: 3 },
      { x: 24, y: 354, width: 342, height: 100, zIndex: 3 },
    ),
    props: textProps("A flexible foundation for your brand.", 38, 760, "#171717", { lineHeight: 1.08, semanticTag: "h2" }),
    responsiveProps: { tablet: { fontSize: 32 }, mobile: { fontSize: 30 } },
    extensions: structuredExtensions("block", { sectionType: "rich-text", blockType: "heading", flowGroup: "story-content" }),
  });
  builder.add(section.id, {
    id: "basic-story-copy",
    type: "text",
    name: "Story copy",
    frames: frames(
      { x: 636, y: 210, width: 470, height: 92, zIndex: 3 },
      { x: 390, y: 214, width: 334, height: 112, zIndex: 3 },
      { x: 24, y: 476, width: 342, height: 110, zIndex: 3 },
    ),
    props: textProps("Edit every section and block while responsive defaults protect the storefront on tablets and phones.", 17, 420, "#5b5b5b", { lineHeight: 1.55, semanticTag: "p" }),
    responsiveProps: { mobile: { fontSize: 16 } },
    extensions: structuredExtensions("block", { sectionType: "rich-text", blockType: "paragraph", flowGroup: "story-content" }),
  });
  builder.add(section.id, {
    id: "basic-story-cta",
    type: "button",
    name: "About us button",
    frames: frames(
      { x: 636, y: 318, width: 150, height: 48, zIndex: 4 },
      { x: 390, y: 346, width: 144, height: 46, zIndex: 4 },
      { x: 24, y: 606, width: 342, height: 50, zIndex: 4 },
    ),
    props: { label: "About us", background: accent, color: "#ffffff", border: "0", fontSize: 14, fontWeight: 700 },
    radius: 7,
    extensions: structuredExtensions("block", {
      sectionType: "rich-text",
      blockType: "button",
      flowGroup: "story-content",
      navigationTarget: "about",
    }),
  });
};

const addFooter = (builder: BasicTemplateBuilder, storeName: string) => {
  const section = builder.add("basic-root", {
    id: "basic-footer",
    type: "section",
    name: "Footer",
    frames: frames(
      { x: 0, y: 1816, width: 1200, height: 260, zIndex: 40 },
      { x: 0, y: 2068, width: 768, height: 280, zIndex: 40 },
      { x: 0, y: 2792, width: 390, height: 420, zIndex: 40 },
    ),
    props: { overflow: "hidden", background: "#171717", color: "#ffffff" },
    fills: solid("#171717"),
    extensions: structuredExtensions("section", {
      sectionType: "footer",
      global: false,
      sectionScope: "local",
      sectionInstanceId: "basic-footer",
    }),
  });
  builder.add(section.id, {
    id: "basic-footer-brand",
    type: "text",
    name: "Footer brand",
    frames: frames(
      { x: 48, y: 54, width: 340, height: 42, zIndex: 2 },
      { x: 28, y: 48, width: 300, height: 40, zIndex: 2 },
      { x: 24, y: 42, width: 342, height: 38, zIndex: 2 },
    ),
    props: textProps(storeName, 27, 800, "#ffffff"),
    responsiveProps: { mobile: { fontSize: 24 } },
    extensions: structuredExtensions("block", {
      sectionType: "footer",
      blockType: "paragraph",
      dynamicBinding: { source: "store", field: "business_name", target: "text" },
    }),
  });
  builder.add(section.id, {
    id: "basic-footer-copy",
    type: "text",
    name: "Footer description",
    frames: frames(
      { x: 48, y: 110, width: 390, height: 62, zIndex: 2 },
      { x: 28, y: 102, width: 330, height: 74, zIndex: 2 },
      { x: 24, y: 94, width: 342, height: 82, zIndex: 2 },
    ),
    props: textProps("A responsive StoreBlink storefront powered by your live catalog.", 14, 420, "#bdbdbd", { lineHeight: 1.5 }),
    extensions: structuredExtensions("internal"),
  });
  [
    ["basic-footer-products", "Products", "products", 696, 30, 204],
    ["basic-footer-about", "About us", "about", 816, 150, 260],
    ["basic-footer-contact", "Contact", "contact", 936, 270, 316],
  ].forEach(([id, label, target, dx, tx, my]) => {
    builder.add(section.id, {
      id: String(id),
      type: "button",
      name: `${label} footer link`,
      frames: frames(
        { x: Number(dx), y: 64, width: 108, height: 40, zIndex: 2 },
        { x: Number(tx) + 390, y: 72, width: 108, height: 40, zIndex: 2 },
        { x: 24, y: Number(my), width: 342, height: 44, zIndex: 2 },
      ),
      props: { label, background: "transparent", color: "#ffffff", border: "0", fontSize: 14, fontWeight: 620 },
      extensions: structuredExtensions("block", {
        sectionType: "footer",
        blockType: "navigation-link",
        navigationTarget: target,
      }),
    });
  });
  builder.add(section.id, {
    id: "basic-footer-arrow",
    type: "svg",
    name: "Footer arrow",
    frames: frames(
      { x: 1106, y: 62, width: 34, height: 34, zIndex: 3 },
      { x: 704, y: 70, width: 32, height: 32, zIndex: 3 },
      { x: 332, y: 356, width: 30, height: 30, zIndex: 3 },
    ),
    props: { markup: arrowIcon, ariaLabel: "Browse products" },
    extensions: structuredExtensions("internal", { navigationTarget: "products" }),
  });
};

export const buildBasicTemplateScene = (
  profile: StoreSceneProfile,
  items: StoreSceneItem[] = [],
): SceneTree => {
  const builder = new BasicTemplateBuilder();
  const accent = safeText(profile.store_color, "#2f5f4a");
  const storeName = safeText(profile.business_name, "Basic Store");

  builder.add(null, {
    id: "basic-root",
    type: "section",
    name: "Basic storefront",
    frames: frames(
      { x: 0, y: 0, width: 1200, height: 2076, zIndex: 0 },
      { x: 0, y: 0, width: 768, height: 2348, zIndex: 0 },
      { x: 0, y: 0, width: 390, height: 3212, zIndex: 0 },
    ),
    props: { overflow: "visible" },
    fills: solid("#ffffff"),
    extensions: structuredExtensions("page", {
      template: "basic",
      navigation: createDefaultStoreNavigationDocument(),
      canvasBackground: "#d9d9d9",
      responsiveBaseWidth: 1200,
      structuredPage: true,
      designTokens: {
        colors: {
          primary: accent,
          secondary: "#171717",
          background: "#ffffff",
          surface: "#f3f1eb",
          text: "#171717",
          mutedText: "#666666",
          border: "#deded9",
          success: "#16845b",
          warning: "#b66a00",
          error: "#c93b3b",
        },
        typography: {
          headingFont: "Inter, ui-sans-serif, system-ui, sans-serif",
          bodyFont: "Inter, ui-sans-serif, system-ui, sans-serif",
          baseSize: 16,
          headingScale: 1.25,
          bodyWeight: 400,
          headingWeight: 760,
          lineHeight: 1.5,
          letterSpacing: 0,
        },
        layout: { maxWidth: 1200, desktopPadding: 48, tabletPadding: 28, mobilePadding: 20 },
        buttons: { radius: 7, borderWidth: 1, minHeight: 48, mobileFullWidth: true },
        cards: { radius: 10, borderWidth: 1, imageRatio: "4 / 3", internalSpacing: 16 },
      },
    }),
  });

  addHeader(builder, storeName);
  addHero(builder, accent);
  addProducts(builder, items, accent);
  addStory(builder, accent);
  addFooter(builder, storeName);

  const scene = themeChromeSystem.ensureScene(structuredLayoutSystem.reflowScene(
    validateSceneTree({ rootNodeId: "basic-root", nodes: builder.nodes }),
  ));
  assertValidSceneTreeStructure(scene);
  return scene;
};

const removeSubtree = (scene: SceneTree, nodeId: string) => {
  const node = scene.nodes[nodeId];
  if (!node) return;
  node.childIds.forEach((childId) => removeSubtree(scene, childId));
  delete scene.nodes[nodeId];
};

const copySubtree = (target: SceneTree, source: SceneTree, nodeId: string) => {
  const node = source.nodes[nodeId];
  if (!node) return;
  target.nodes[nodeId] = cloneSceneNode(node);
  node.childIds.forEach((childId) => copySubtree(target, source, childId));
};

type NodePresentation = Pick<SceneNode, "transform" | "layout">;

const captureSubtreePresentation = (
  scene: SceneTree,
  nodeId: string,
  presentation: Map<string, NodePresentation>,
) => {
  const node = scene.nodes[nodeId];
  if (!node) return;
  presentation.set(nodeId, {
    transform: structuredClone(node.transform),
    layout: structuredClone(node.layout),
  });
  node.childIds.forEach((childId) =>
    captureSubtreePresentation(scene, childId, presentation));
};

const restoreSubtreePresentation = (
  scene: SceneTree,
  presentation: Map<string, NodePresentation>,
) => {
  presentation.forEach((snapshot, nodeId) => {
    const node = scene.nodes[nodeId];
    if (!node) return;
    node.transform = structuredClone(snapshot.transform);
    node.layout = structuredClone(snapshot.layout);
  });
};

const runtimeProductChild = (node: SceneNode | undefined) =>
  Boolean(
    node &&
      (node.extensions?.blockType === "product-card" || node.id.startsWith("basic-products-empty")),
  );

export const reconcileBasicTemplateProducts = (
  sceneTree: SceneTree,
  profile: StoreSceneProfile,
  items: StoreSceneItem[] = [],
): SceneTree => {
  const root = sceneTree.rootNodeId ? sceneTree.nodes[sceneTree.rootNodeId] : undefined;
  if (root?.extensions?.template !== "basic") return cloneSceneTree(sceneTree);
  const scene = themeChromeSystem.ensureScene(sceneTree);
  const section = scene.nodes["basic-products"];
  if (!section) return scene;

  const reference = buildBasicTemplateScene(profile, items);
  const referenceSection = reference.nodes["basic-products"];
  const currentRuntimeRoots = section.childIds.filter((childId) =>
    runtimeProductChild(scene.nodes[childId]),
  );
  const desiredRuntimeRoots = referenceSection.childIds.filter((childId) =>
    runtimeProductChild(reference.nodes[childId]),
  );
  const desiredProductIds = desiredRuntimeRoots
    .map((childId) => reference.nodes[childId])
    .filter((node) => node?.extensions?.blockType === "product-card")
    .map((node) => String(node.extensions?.productId));
  const desiredProductCardIds = desiredRuntimeRoots.filter(
    (childId) => reference.nodes[childId]?.extensions?.blockType === "product-card",
  );
  const currentCards = currentRuntimeRoots
    .map((childId) => scene.nodes[childId])
    .filter((node): node is SceneNode => node?.extensions?.blockType === "product-card");
  const currentProductCardIds = currentCards.map((node) => node.id);
  const retainedPresentation = new Map<string, NodePresentation>();
  currentCards
    .filter((card) => desiredProductCardIds.includes(card.id))
    .forEach((card) =>
      captureSubtreePresentation(scene, card.id, retainedPresentation));
  const availableProductIds = new Set(
    items
      .map((item) => item.id)
      .filter((id): id is string | number => id !== undefined && id !== null)
      .map(String),
  );
  const synchronizeCard = (card: SceneNode, fallbackProductId: string) => {
    const persistedProductId = productReferenceId(card);
    const productId =
      persistedProductId && availableProductIds.has(persistedProductId)
        ? persistedProductId
        : fallbackProductId;
    synchronizeProductReferenceSubtree(scene, card.id, productId, card.id);
  };
  const currentHasEmptyState = currentRuntimeRoots.some((childId) =>
    childId.startsWith("basic-products-empty"),
  );
  const desiredHasEmptyState = desiredProductIds.length === 0;
  const catalogShapeUnchanged =
    currentProductCardIds.length === desiredProductCardIds.length &&
    currentProductCardIds.every((cardId, index) => cardId === desiredProductCardIds[index]) &&
    currentHasEmptyState === desiredHasEmptyState;
  if (catalogShapeUnchanged) {
    currentCards.forEach((card, index) => synchronizeCard(card, desiredProductIds[index]));
    return scene;
  }

  const retained = section.childIds.filter((childId) => !currentRuntimeRoots.includes(childId));
  const nextRuntimeRoots: string[] = [];
  if (desiredHasEmptyState) {
    desiredRuntimeRoots.forEach((nodeId) => {
      if (!scene.nodes[nodeId]) copySubtree(scene, reference, nodeId);
      nextRuntimeRoots.push(nodeId);
    });
  } else {
    desiredProductIds.forEach((productId, index) => {
      const referenceId = desiredProductCardIds[index];
      const existing = currentCards.find((card) => card.id === referenceId);
      if (existing) {
        synchronizeCard(existing, productId);
        nextRuntimeRoots.push(existing.id);
        return;
      }
      copySubtree(scene, reference, referenceId);
      nextRuntimeRoots.push(referenceId);
    });
  }
  currentRuntimeRoots
    .filter((nodeId) => !nextRuntimeRoots.includes(nodeId))
    .forEach((nodeId) => removeSubtree(scene, nodeId));
  section.childIds = [...retained, ...nextRuntimeRoots];

  section.transform = { ...section.transform, height: referenceSection.transform.height };
  const targetResponsive = (section.layout.responsive ?? {}) as ResponsiveOverrideMap;
  const sourceResponsive = (referenceSection.layout.responsive ?? {}) as ResponsiveOverrideMap;
  section.layout = {
    ...section.layout,
    responsive: Object.fromEntries(
      (["desktop", "tablet", "mobile"] as ResponsiveBreakpoint[]).map((breakpoint) => {
        const target = targetResponsive[breakpoint] ?? {};
        const source = sourceResponsive[breakpoint] ?? {};
        return [
          breakpoint,
          {
            ...target,
            transform: {
              ...(target.transform ?? section.transform),
              height: source.transform?.height ?? referenceSection.transform.height,
            },
          },
        ];
      }),
    ),
  };
  const reflowed = structuredLayoutSystem.reflowScene(scene);
  restoreSubtreePresentation(reflowed, retainedPresentation);
  return validateSceneTree(reflowed);
};

export const buildBasicCustomPageScene = (
  profile: StoreSceneProfile,
  title: string,
  slug: string,
): SceneTree => {
  const scene = cloneSceneTree(buildBasicTemplateScene(profile, []));
  const root = scene.nodes[scene.rootNodeId as string];
  ["basic-hero", "basic-products"].forEach((nodeId) => {
    root.childIds = root.childIds.filter((childId) => childId !== nodeId);
    removeSubtree(scene, nodeId);
  });
  root.name = title.trim() || "Custom page";
  root.extensions = {
    ...(root.extensions ?? {}),
    pageKind: "custom",
    pageSlug: slug,
  };
  const content = scene.nodes["basic-story"];
  if (content) {
    content.name = `${root.name} content`;
    content.props = { ...content.props, background: "#ffffff" };
    content.style = { ...content.style, fills: solid("#ffffff") };
  }
  const heading = scene.nodes["basic-story-heading"];
  if (heading) heading.props = { ...heading.props, text: root.name, semanticTag: "h1" };
  const copy = scene.nodes["basic-story-copy"];
  if (copy) {
    copy.props = {
      ...copy.props,
      text: "Use the section library to build this page. Your global store navigation, account, and cart remain available automatically.",
    };
  }
  const button = scene.nodes["basic-story-cta"];
  if (button) {
    button.props = { ...button.props, label: "Browse products" };
    button.extensions = { ...(button.extensions ?? {}), navigationTarget: "products" };
  }
  return structuredLayoutSystem.reflowScene(scene);
};
