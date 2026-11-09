import { cloneSceneTree, createSceneNode } from "@/engine/scene-graph";
import {
  assertValidSceneTreeStructure,
  validateSceneTree,
} from "@/engine/validation";
import {
  productReferenceId,
  synchronizeProductReference,
} from "@/document/dynamic-sources";
import { structuredLayoutSystem } from "@/layout/structured";
import { responsiveSystem } from "@/layout/responsive";
import { themeChromeSystem } from "@/theme-engine/chrome";
import { createDefaultStoreNavigationDocument } from "@/content/menus/NavigationSystem";
import type { ResponsiveBreakpoint } from "@/stores/responsive.store";
import type {
  ElementType,
  SceneNode,
  SceneTree,
  StyleData,
  TransformData,
} from "@/types";
import type {
  StoreSceneItem,
  StoreSceneProfile,
} from "@/editor/engine/storeSceneAdapter";
import watchHero from "../assets/noir-watch-hero.webp";
import watchLight from "../assets/noir-watch-light.webp";

type Frame = Pick<TransformData, "x" | "y" | "width" | "height"> & {
  zIndex?: number;
  rotation?: number;
};
type Frames = Record<ResponsiveBreakpoint, Frame>;

type NodeConfig = {
  id: string;
  type: ElementType;
  name: string;
  frames: Frames;
  props?: Record<string, unknown>;
  responsiveProps?: Partial<
    Record<ResponsiveBreakpoint, Record<string, unknown>>
  >;
  fills?: StyleData["fills"];
  strokes?: StyleData["strokes"];
  effects?: StyleData["effects"];
  radius?: number;
  extensions?: Record<string, unknown>;
  visibility?: Partial<Record<ResponsiveBreakpoint, boolean>>;
  locked?: boolean;
};

const timestamp = 1_783_000_000_000;
const displayFont =
  "Arial, Helvetica, ui-sans-serif, system-ui, sans-serif";
const bodyFont = "Inter, Arial, ui-sans-serif, system-ui, sans-serif";

const solid = (color: string): StyleData["fills"] => [
  { type: "solid", color },
];
const stroke = (
  color: string,
  width = 1,
): StyleData["strokes"] => [{ color, width, style: "solid" }];
const shadow = (color = "rgba(0,0,0,0.18)"): StyleData["effects"] => [
  {
    type: "shadow",
    value: { x: 0, y: 18, blur: 48, spread: -26, color },
  },
];
const frames = (
  desktop: Frame,
  tablet: Frame,
  mobile: Frame,
): Frames => ({ desktop, tablet, mobile });
const safeText = (value: unknown, fallback: string) =>
  typeof value === "string" && value.trim() ? value.trim() : fallback;
const itemId = (item: StoreSceneItem | undefined): string | null =>
  item?.id === undefined || item.id === null ? null : String(item.id);

const transform = (frame: Frame): TransformData => ({
  x: frame.x,
  y: frame.y,
  width: frame.width,
  height: frame.height,
  rotation: frame.rotation ?? 0,
  scaleX: 1,
  scaleY: 1,
  skewX: 0,
  skewY: 0,
  transformOrigin: [0.5, 0.5],
  zIndex: frame.zIndex ?? 0,
});

const editorExtensions = (
  kind: "page" | "section" | "block" | "internal",
  extras: Record<string, unknown> = {},
) => ({
  editorKind: kind,
  structured: kind !== "internal",
  selectable: kind !== "internal",
  ...(kind === "section" ? { responsiveDefaultsInitialized: true } : {}),
  ...extras,
});

const ensureNoirResponsiveLayoutContract = (source: SceneTree): SceneTree => {
  const scene = cloneSceneTree(source);
  const root = scene.rootNodeId ? scene.nodes[scene.rootNodeId] : undefined;
  if (!root) return scene;
  const needsLegacyRepair =
    root.extensions?.structuredLayoutPolicy !== "authored-responsive";
  root.extensions = {
    ...(root.extensions ?? {}),
    structuredLayoutPolicy: "authored-responsive",
  };
  const drawer = scene.nodes["noir-mobile-menu"];
  if (drawer) {
    drawer.extensions = {
      ...(drawer.extensions ?? {}),
      navigationSurfaceLayout: {
        mode: "vertical-list",
        tablet: { paddingTop: 18, gap: 8 },
        mobile: { paddingTop: 16, gap: 8 },
      },
    };
  }
  if (!needsLegacyRepair) return scene;

  root.childIds.forEach((nodeId, index) => {
    const node = scene.nodes[nodeId];
    if (!node || node.extensions?.editorKind !== "section") return;
    const zIndex = node.extensions?.sectionType === "header"
      ? 100
      : Math.max(10, index * 10);
    (["desktop", "tablet", "mobile"] as const).forEach((breakpoint) => {
      if (responsiveSystem.hasManualTransform(node, breakpoint)) return;
      const resolved = responsiveSystem.resolveNode(node, breakpoint);
      const nextTransform = { ...resolved.transform, zIndex };
      node.layout = responsiveSystem.updateLayout(node, breakpoint, {
        transform: nextTransform,
      });
      if (breakpoint === "desktop") node.transform = nextTransform;
    });
  });
  return scene;
};

class NoirSceneBuilder {
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
              meta: {
                hidden: !desktopVisible,
                locked: config.locked ?? false,
              },
            },
            tablet: {
              transform: transform(config.frames.tablet),
              props: config.responsiveProps?.tablet,
              meta: {
                hidden: !(config.visibility?.tablet ?? desktopVisible),
                locked: config.locked ?? false,
              },
            },
            mobile: {
              transform: transform(config.frames.mobile),
              props: config.responsiveProps?.mobile,
              meta: {
                hidden: !(config.visibility?.mobile ?? desktopVisible),
                locked: config.locked ?? false,
              },
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
        meta: {
          hidden: !desktopVisible,
          locked: config.locked ?? false,
        },
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
  fontFamily: displayFont,
  lineHeight: 1.05,
  letterSpacing: 0,
  ...extras,
});

const addText = (
  builder: NoirSceneBuilder,
  parentId: string,
  id: string,
  name: string,
  text: string,
  nodeFrames: Frames,
  fontSize: number,
  fontWeight: number,
  color: string,
  extras: {
    props?: Record<string, unknown>;
    responsiveProps?: NodeConfig["responsiveProps"];
    extensions?: Record<string, unknown>;
  } = {},
) =>
  builder.add(parentId, {
    id,
    type: "text",
    name,
    frames: nodeFrames,
    props: textProps(text, fontSize, fontWeight, color, extras.props),
    responsiveProps: extras.responsiveProps,
    extensions: editorExtensions("block", extras.extensions),
  });

const addButton = (
  builder: NoirSceneBuilder,
  parentId: string,
  id: string,
  label: string,
  nodeFrames: Frames,
  options: {
    background?: string;
    color?: string;
    border?: string;
    radius?: number;
    fontSize?: number;
    extensions?: Record<string, unknown>;
    visibility?: NodeConfig["visibility"];
  } = {},
) =>
  builder.add(parentId, {
    id,
    type: "button",
    name: `${label} action`,
    frames: nodeFrames,
    props: {
      label,
      background: options.background ?? "transparent",
      color: options.color ?? "#111111",
      border: options.border ?? "1px solid currentColor",
      fontFamily: bodyFont,
      fontSize: options.fontSize ?? 13,
      fontWeight: 650,
    },
    radius: options.radius ?? 999,
    extensions: editorExtensions("block", options.extensions),
    visibility: options.visibility,
  });

const addNavLink = (
  builder: NoirSceneBuilder,
  parentId: string,
  id: string,
  label: string,
  target: "home" | "products" | "about" | "contact",
  x: number,
) =>
  addButton(
    builder,
    parentId,
    id,
    label,
    frames(
      { x, y: 22, width: 104, height: 40, zIndex: 10 },
      { x: 250, y: 20, width: 94, height: 38, zIndex: 10 },
      { x: 18, y: 18, width: 354, height: 48, zIndex: 10 },
    ),
    {
      background: label === "Home" ? "#F7F7F5" : "transparent",
      color: label === "Home" ? "#111111" : "#F7F7F5",
      border:
        label === "Home"
          ? "1px solid #F7F7F5"
          : "1px solid rgba(255,255,255,0.18)",
      extensions: {
        sectionType: "header",
        blockType: "navigation-link",
        navigationTarget: target,
        navigationSurfaceVisibility: { desktop: true, tablet: false, mobile: false },
      },
      visibility: { desktop: true, tablet: false, mobile: false },
    },
  );

const addMobileNavLink = (
  builder: NoirSceneBuilder,
  parentId: string,
  id: string,
  label: string,
  target: "home" | "products" | "about" | "contact",
  index: number,
  accent: string,
) =>
  addButton(
    builder,
    parentId,
    id,
    label,
    frames(
      { x: 0, y: 0, width: 1, height: 1, zIndex: 1 },
      { x: 24, y: 18 + index * 56, width: 720, height: 48, zIndex: 10 },
      { x: 18, y: 16 + index * 56, width: 354, height: 48, zIndex: 10 },
    ),
    {
      background: target === "home" ? accent : "transparent",
      color: target === "home" ? "#111111" : "#F7F7F5",
      border: "1px solid rgba(255,255,255,0.16)",
      radius: 12,
      fontSize: 14,
      visibility: { desktop: false, tablet: true, mobile: true },
      extensions: {
        sectionType: "header",
        blockType: "navigation-link",
        navigationKey: target,
        navigationTarget: target,
        navigationSurfaceVisibility: { desktop: false, tablet: true, mobile: true },
      },
    },
  );

const addHeader = (
  builder: NoirSceneBuilder,
  storeName: string,
  accent: string,
) => {
  const section = builder.add("noir-root", {
    id: "noir-header",
    type: "section",
    name: "Noir global header",
    frames: frames(
      { x: 0, y: 0, width: 1440, height: 84, zIndex: 100 },
      { x: 0, y: 0, width: 768, height: 78, zIndex: 100 },
      { x: 0, y: 0, width: 390, height: 72, zIndex: 100 },
    ),
    fills: solid("#101010"),
    props: { overflow: "visible", background: "#101010", sticky: true },
    extensions: editorExtensions("section", {
      sectionType: "header",
      canonicalSectionType: "site-header",
      global: false,
      sectionScope: "local",
      sectionInstanceId: "noir-header",
    }),
  });

  addText(
    builder,
    section.id,
    "noir-brand",
    "Noir Chrono logo",
    storeName,
    frames(
      { x: 58, y: 26, width: 230, height: 32, zIndex: 20 },
      { x: 28, y: 23, width: 185, height: 30, zIndex: 20 },
      { x: 18, y: 22, width: 190, height: 28, zIndex: 20 },
    ),
    22,
    800,
    "#F7F7F5",
    {
      responsiveProps: {
        mobile: { fontSize: 18 },
      },
      extensions: {
        dynamicBinding: {
          source: "store",
          field: "business_name",
          target: "text",
        },
        navigationTarget: "home",
        ariaLabel: "Home",
      },
    },
  );

  addNavLink(builder, section.id, "noir-nav-home", "Home", "home", 380);
  addNavLink(
    builder,
    section.id,
    "noir-nav-products",
    "Products",
    "products",
    492,
  );
  addNavLink(
    builder,
    section.id,
    "noir-nav-about",
    "About",
    "about",
    604,
  );
  addNavLink(
    builder,
    section.id,
    "noir-nav-contact",
    "Contact",
    "contact",
    716,
  );

  const iconFrames = (desktopX: number, tabletX: number, mobileX: number) =>
    frames(
      { x: desktopX, y: 22, width: 40, height: 40, zIndex: 20 },
      { x: tabletX, y: 19, width: 40, height: 40, zIndex: 20 },
      { x: mobileX, y: 16, width: 40, height: 40, zIndex: 20 },
    );
  addButton(
    builder,
    section.id,
    "noir-search",
    "Search",
    iconFrames(1180, 574, 210),
    {
      background: "transparent",
      color: "#F7F7F5",
      border: "1px solid rgba(255,255,255,0.18)",
      extensions: { action: "open-search" },
    },
  );
  addButton(
    builder,
    section.id,
    "noir-account",
    "Account",
    iconFrames(1230, 622, 256),
    {
      background: "transparent",
      color: "#F7F7F5",
      border: "1px solid rgba(255,255,255,0.18)",
      extensions: { action: "open-account" },
    },
  );
  addButton(
    builder,
    section.id,
    "noir-cart",
    "Cart",
    iconFrames(1280, 670, 302),
    {
      background: "transparent",
      color: "#F7F7F5",
      border: "1px solid rgba(255,255,255,0.18)",
      extensions: { action: "open-cart" },
    },
  );
  addButton(
    builder,
    section.id,
    "noir-menu-trigger",
    "Menu",
    iconFrames(1330, 718, 348),
    {
      background: "transparent",
      color: "#F7F7F5",
      border: "1px solid rgba(255,255,255,0.18)",
      visibility: { desktop: false, tablet: true, mobile: true },
      extensions: {
        action: "toggle-mobile-menu",
        blockType: "mobile-menu-trigger",
      },
    },
  );

  const mobileMenu = builder.add(section.id, {
    id: "noir-mobile-menu",
    type: "container",
    name: "Noir mobile navigation",
    frames: frames(
      { x: 0, y: 84, width: 1, height: 1, zIndex: 1000 },
      { x: 0, y: 78, width: 768, height: 260, zIndex: 1000 },
      { x: 0, y: 72, width: 390, height: 260, zIndex: 1000 },
    ),
    fills: solid("#161616"),
    strokes: stroke("rgba(255,255,255,0.12)"),
    props: { overflow: "hidden" },
    visibility: { desktop: false, tablet: true, mobile: true },
    extensions: editorExtensions("block", {
      runtimeVisibility: "mobile-menu",
      blockType: "mobile-menu",
      navigationSurfaceLayout: {
        mode: "vertical-list",
        tablet: { paddingTop: 18, gap: 8 },
        mobile: { paddingTop: 16, gap: 8 },
      },
    }),
  });
  [
    ["Home", "home"],
    ["Products", "products"],
    ["About", "about"],
    ["Contact", "contact"],
  ].forEach(([label, target], index) => {
    addMobileNavLink(
      builder,
      mobileMenu.id,
      `noir-mobile-nav-${target}`,
      label,
      target as "home" | "products" | "about" | "contact",
      index,
      accent,
    );
  });
};

const addHero = (
  builder: NoirSceneBuilder,
  accent: string,
) => {
  const section = builder.add("noir-root", {
    id: "noir-hero",
    type: "section",
    name: "Modern watch hero",
    frames: frames(
      { x: 0, y: 84, width: 1440, height: 690, zIndex: 10 },
      { x: 0, y: 78, width: 768, height: 610, zIndex: 10 },
      { x: 0, y: 72, width: 390, height: 760, zIndex: 10 },
    ),
    fills: solid("#101010"),
    props: { overflow: "hidden", background: "#101010" },
    extensions: editorExtensions("section", {
      sectionType: "watch-hero",
      canonicalSectionType: "immersive-product-hero",
    }),
  });

  addText(
    builder,
    section.id,
    "noir-hero-title",
    "Hero heading",
    "Modern Watch Style",
    frames(
      { x: 58, y: 34, width: 1120, height: 100, zIndex: 30 },
      { x: 36, y: 32, width: 680, height: 82, zIndex: 30 },
      { x: 20, y: 28, width: 350, height: 108, zIndex: 30 },
    ),
    76,
    600,
    "#F5F4F2",
    {
      props: { semanticTag: "h1", lineHeight: 0.98 },
      responsiveProps: {
        tablet: { fontSize: 52 },
        mobile: { fontSize: 46, lineHeight: 0.95 },
      },
    },
  );
  addText(
    builder,
    section.id,
    "noir-hero-kicker",
    "Hero subtitle",
    "Shop the Latest Watch Trends",
    frames(
      { x: 62, y: 148, width: 420, height: 40, zIndex: 32 },
      { x: 38, y: 126, width: 330, height: 34, zIndex: 32 },
      { x: 22, y: 146, width: 330, height: 32, zIndex: 32 },
    ),
    20,
    400,
    accent,
    {
      props: {
        fontFamily: bodyFont,
        fontStyle: "italic",
      },
      responsiveProps: { mobile: { fontSize: 16 } },
    },
  );
  builder.add(section.id, {
    id: "noir-hero-image",
    type: "image",
    name: "Hero watch image",
    frames: frames(
      { x: 390, y: 126, width: 780, height: 520, zIndex: 12 },
      { x: 230, y: 150, width: 500, height: 400, zIndex: 12 },
      { x: 28, y: 198, width: 334, height: 338, zIndex: 12 },
    ),
    props: {
      src: watchHero,
      alt: "Silver and rose-gold modern watch",
      objectFit: "cover",
      objectPosition: "56% 50%",
      loading: "eager",
    },
    radius: 8,
    extensions: editorExtensions("block", {
      sectionType: "watch-hero",
      blockType: "hero-media",
    }),
  });
  builder.add(section.id, {
    id: "noir-hero-grid",
    type: "shape",
    name: "Hero technical grid",
    frames: frames(
      { x: 58, y: 206, width: 1280, height: 430, zIndex: 4 },
      { x: 34, y: 180, width: 700, height: 380, zIndex: 4 },
      { x: 18, y: 190, width: 354, height: 370, zIndex: 4 },
    ),
    fills: [
      {
        type: "gradient",
        value:
          "linear-gradient(rgba(255,255,255,.035) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,.035) 1px,transparent 1px)",
      },
    ],
    props: { backgroundSize: "80px 80px" },
    extensions: editorExtensions("block", {
      sectionType: "watch-hero",
      blockType: "decoration",
    }),
  });
  builder.add(section.id, {
    id: "noir-hero-card",
    type: "container",
    name: "Hero trend card",
    frames: frames(
      { x: 60, y: 300, width: 285, height: 180, zIndex: 45 },
      { x: 38, y: 340, width: 190, height: 144, zIndex: 45 },
      { x: 22, y: 548, width: 208, height: 116, zIndex: 45 },
    ),
    fills: [
      {
        type: "gradient",
        value: "linear-gradient(135deg,#3C2827 0%,#171717 70%)",
      },
    ],
    strokes: stroke("rgba(255,255,255,0.18)"),
    effects: shadow("rgba(0,0,0,0.45)"),
    radius: 24,
    props: { overflow: "hidden" },
    extensions: editorExtensions("block", {
      sectionType: "watch-hero",
      blockType: "feature-card",
    }),
  });
  addText(
    builder,
    "noir-hero-card",
    "noir-hero-card-copy",
    "Trend card copy",
    "Shop Elegant\nWristwatches",
    frames(
      { x: 22, y: 92, width: 180, height: 62, zIndex: 3 },
      { x: 16, y: 72, width: 130, height: 52, zIndex: 3 },
      { x: 16, y: 54, width: 150, height: 48, zIndex: 3 },
    ),
    18,
    500,
    "#F7F7F5",
    { responsiveProps: { tablet: { fontSize: 14 }, mobile: { fontSize: 13 } } },
  );
  addButton(
    builder,
    "noir-hero-card",
    "noir-hero-card-play",
    "Play",
    frames(
      { x: 212, y: 106, width: 52, height: 52, zIndex: 4 },
      { x: 142, y: 82, width: 40, height: 40, zIndex: 4 },
      { x: 164, y: 56, width: 36, height: 36, zIndex: 4 },
    ),
    {
      background: "#FFFFFF",
      color: "#111111",
      border: "0",
      radius: 999,
      fontSize: 10,
      extensions: {
        action: "scroll-to-node",
        targetNodeId: "noir-products",
      },
    },
  );

  const stats = [
    ["2.5k+", "Products"],
    ["12+", "Years Experience"],
    ["400+", "Clients"],
  ];
  stats.forEach(([value, label], index) => {
    const x = 62 + index * 112;
    addText(
      builder,
      section.id,
      `noir-stat-${index}`,
      `${label} statistic`,
      value,
      frames(
        { x, y: 540, width: 102, height: 34, zIndex: 42 },
        { x: 38 + index * 98, y: 508, width: 88, height: 30, zIndex: 42 },
        { x: 22 + index * 116, y: 690, width: 104, height: 28, zIndex: 42 },
      ),
      24,
      650,
      "#F7F7F5",
      { responsiveProps: { mobile: { fontSize: 19 } } },
    );
    addText(
      builder,
      section.id,
      `noir-stat-label-${index}`,
      `${label} label`,
      label,
      frames(
        { x, y: 576, width: 102, height: 24, zIndex: 42 },
        { x: 38 + index * 98, y: 540, width: 88, height: 20, zIndex: 42 },
        { x: 22 + index * 116, y: 718, width: 104, height: 18, zIndex: 42 },
      ),
      9,
      500,
      "#A8A5A3",
      { props: { fontFamily: bodyFont } },
    );
  });
  addButton(
    builder,
    section.id,
    "noir-scroll-button",
    "Down",
    frames(
      { x: 1250, y: 560, width: 82, height: 82, zIndex: 50 },
      { x: 660, y: 500, width: 70, height: 70, zIndex: 50 },
      { x: 302, y: 590, width: 62, height: 62, zIndex: 50 },
    ),
    {
      background: "#111111",
      color: "#FFFFFF",
      border: "4px solid #FFFFFF",
      radius: 999,
      fontSize: 12,
      extensions: {
        action: "scroll-to-node",
        targetNodeId: "noir-products",
      },
    },
  );
};

const productBinding = (
  productId: string | null,
  field: string,
  target: "text" | "src",
  format?: "currency",
) => ({
  source: "product",
  field,
  target,
  ...(productId ? { productId } : {}),
  ...(format ? { format } : {}),
});

const addProductCard = (
  builder: NoirSceneBuilder,
  sectionId: string,
  index: number,
  item: StoreSceneItem | undefined,
  accent: string,
) => {
  const productId = itemId(item);
  const slotId = `noir-product-slot-${index}`;
  const desktopX = 28 + index * 351;
  const tabletX = index % 2 === 0 ? 24 : 394;
  const tabletY = index < 2 ? 154 : 556;
  const mobileY = 126 + index * 322;
  const card = builder.add(sectionId, {
    id: `noir-product-card-${index + 1}`,
    type: "container",
    name: `Watch product card ${index + 1}`,
    frames: frames(
      { x: desktopX, y: 158, width: 332, height: 430, zIndex: 20 + index },
      { x: tabletX, y: tabletY, width: 350, height: 376, zIndex: 20 + index },
      { x: 24, y: mobileY, width: 342, height: 294, zIndex: 20 + index },
    ),
    fills: solid("#151515"),
    strokes: stroke("rgba(17,17,17,0.08)"),
    effects: shadow(),
    radius: 28,
    props: { overflow: "hidden" },
    extensions: editorExtensions("block", {
      sectionType: "watch-products",
      blockType: "product-card",
      productSlotId: slotId,
      ...(productId ? { productId } : {}),
    }),
  });
  const sharedExtensions = {
    sectionType: "watch-products",
    productSlotId: slotId,
    ...(productId ? { productId } : {}),
  };
  builder.add(card.id, {
    id: `${card.id}-image`,
    type: "image",
    name: `Product ${index + 1} image`,
    frames: frames(
      { x: 0, y: 0, width: 332, height: 430, zIndex: 1 },
      { x: 0, y: 0, width: 350, height: 376, zIndex: 1 },
      { x: 0, y: 0, width: 342, height: 294, zIndex: 1 },
    ),
    props: {
      src: item?.image_url || (index % 2 === 0 ? watchHero : watchLight),
      alt: safeText(item?.name, "Modern automatic watch"),
      objectFit: "cover",
      objectPosition: index % 2 === 0 ? "62% 50%" : "50% 45%",
    },
    radius: 28,
    extensions: editorExtensions("block", {
      ...sharedExtensions,
      dynamicBinding: productBinding(productId, "image_url", "src"),
    }),
  });
  builder.add(card.id, {
    id: `${card.id}-scrim`,
    type: "shape",
    name: `Product ${index + 1} image overlay`,
    frames: frames(
      { x: 0, y: 225, width: 332, height: 205, zIndex: 2 },
      { x: 0, y: 190, width: 350, height: 186, zIndex: 2 },
      { x: 0, y: 152, width: 342, height: 142, zIndex: 2 },
    ),
    fills: [
      {
        type: "gradient",
        value: "linear-gradient(transparent,rgba(0,0,0,.88))",
      },
    ],
    radius: 28,
    extensions: editorExtensions("block", {
      ...sharedExtensions,
      blockType: "overlay",
    }),
  });
  addText(
    builder,
    card.id,
    `${card.id}-title`,
    `Product ${index + 1} title`,
    safeText(item?.name, "Automatic Watch"),
    frames(
      { x: 22, y: 332, width: 235, height: 38, zIndex: 5 },
      { x: 20, y: 284, width: 250, height: 34, zIndex: 5 },
      { x: 18, y: 218, width: 230, height: 30, zIndex: 5 },
    ),
    17,
    500,
    "#FFFFFF",
    {
      responsiveProps: { mobile: { fontSize: 15 } },
      extensions: {
        ...sharedExtensions,
        dynamicBinding: productBinding(productId, "name", "text"),
      },
    },
  );
  addText(
    builder,
    card.id,
    `${card.id}-price`,
    `Product ${index + 1} price`,
    item?.price_cents
      ? `$${(item.price_cents / 100).toFixed(2)}`
      : `$${(255 + index * 65).toFixed(2)}`,
    frames(
      { x: 22, y: 382, width: 110, height: 28, zIndex: 5 },
      { x: 20, y: 328, width: 110, height: 24, zIndex: 5 },
      { x: 18, y: 258, width: 110, height: 22, zIndex: 5 },
    ),
    12,
    650,
    "#FFFFFF",
    {
      props: { fontFamily: bodyFont },
      extensions: {
        ...sharedExtensions,
        dynamicBinding: productBinding(
          productId,
          "price_cents",
          "text",
          "currency",
        ),
      },
    },
  );
  addText(
    builder,
    card.id,
    `${card.id}-discount`,
    `Product ${index + 1} discount`,
    index === 1 ? "NEW" : "25%",
    frames(
      { x: 18, y: 18, width: 64, height: 30, zIndex: 8 },
      { x: 18, y: 18, width: 64, height: 30, zIndex: 8 },
      { x: 16, y: 16, width: 60, height: 28, zIndex: 8 },
    ),
    11,
    650,
    "#FFFFFF",
    {
      props: {
        textAlign: "center",
        background: "rgba(17,17,17,.72)",
      },
      extensions: sharedExtensions,
    },
  );
  addButton(
    builder,
    card.id,
    `${card.id}-favorite`,
    "Favorite",
    frames(
      { x: 270, y: 18, width: 44, height: 44, zIndex: 8 },
      { x: 288, y: 18, width: 44, height: 44, zIndex: 8 },
      { x: 282, y: 16, width: 42, height: 42, zIndex: 8 },
    ),
    {
      background: "rgba(17,17,17,.66)",
      color: "#FFFFFF",
      border: "1px solid rgba(255,255,255,.28)",
      radius: 999,
      fontSize: 9,
      extensions: {
        ...sharedExtensions,
        action: "toggle-wishlist",
      },
    },
  );
  addButton(
    builder,
    card.id,
    `${card.id}-add`,
    "Add To Cart",
    frames(
      { x: 178, y: 378, width: 136, height: 34, zIndex: 8 },
      { x: 196, y: 322, width: 136, height: 34, zIndex: 8 },
      { x: 188, y: 252, width: 136, height: 32, zIndex: 8 },
    ),
    {
      background: accent,
      color: "#111111",
      border: "0",
      radius: 999,
      fontSize: 11,
      extensions: {
        ...sharedExtensions,
        action: "add-to-cart",
      },
    },
  );
};

const addProducts = (
  builder: NoirSceneBuilder,
  items: StoreSceneItem[],
  accent: string,
) => {
  const section = builder.add("noir-root", {
    id: "noir-products",
    type: "section",
    name: "What's new watches",
    frames: frames(
      { x: 0, y: 774, width: 1440, height: 690, zIndex: 20 },
      { x: 0, y: 688, width: 768, height: 980, zIndex: 20 },
      { x: 0, y: 832, width: 390, height: 1450, zIndex: 20 },
    ),
    fills: solid("#F7F7F5"),
    props: { overflow: "hidden", background: "#F7F7F5" },
    extensions: editorExtensions("section", {
      sectionType: "watch-products",
      canonicalSectionType: "featured-product-collection",
      dataSource: "products",
    }),
  });
  addText(
    builder,
    section.id,
    "noir-products-heading",
    "Products heading",
    "See What's New",
    frames(
      { x: 30, y: 70, width: 520, height: 62, zIndex: 5 },
      { x: 28, y: 62, width: 430, height: 56, zIndex: 5 },
      { x: 22, y: 42, width: 300, height: 50, zIndex: 5 },
    ),
    48,
    600,
    "#111111",
    {
      responsiveProps: {
        tablet: { fontSize: 40 },
        mobile: { fontSize: 34 },
      },
    },
  );
  addButton(
    builder,
    section.id,
    "noir-shop-all",
    "Shop all",
    frames(
      { x: 1260, y: 72, width: 132, height: 46, zIndex: 5 },
      { x: 604, y: 62, width: 124, height: 44, zIndex: 5 },
      { x: 262, y: 44, width: 104, height: 40, zIndex: 5 },
    ),
    {
      color: "#111111",
      background: "transparent",
      border: "0",
      extensions: { navigationTarget: "products" },
    },
  );
  [0, 1, 2, 3].forEach((index) =>
    addProductCard(builder, section.id, index, items[index], accent),
  );
  addButton(
    builder,
    section.id,
    "noir-products-prev",
    "Previous",
    frames(
      { x: 1246, y: 612, width: 54, height: 54, zIndex: 8 },
      { x: 630, y: 890, width: 48, height: 48, zIndex: 8 },
      { x: 244, y: 1386, width: 48, height: 48, zIndex: 8 },
    ),
    {
      extensions: {
        action: "step-node-set",
        targetNodeIds: [
          "noir-product-card-1",
          "noir-product-card-2",
          "noir-product-card-3",
          "noir-product-card-4",
        ],
        direction: -1,
      },
    },
  );
  addButton(
    builder,
    section.id,
    "noir-products-next",
    "Next",
    frames(
      { x: 1310, y: 612, width: 82, height: 54, zIndex: 8 },
      { x: 684, y: 890, width: 48, height: 48, zIndex: 8 },
      { x: 302, y: 1386, width: 64, height: 48, zIndex: 8 },
    ),
    {
      extensions: {
        action: "step-node-set",
        targetNodeIds: [
          "noir-product-card-1",
          "noir-product-card-2",
          "noir-product-card-3",
          "noir-product-card-4",
        ],
        direction: 1,
      },
    },
  );
};

const addCollections = (
  builder: NoirSceneBuilder,
  items: StoreSceneItem[],
  accent: string,
) => {
  const featured = items[0];
  const productId = itemId(featured);
  const slotId = "noir-featured-collection-slot";
  const section = builder.add("noir-root", {
    id: "noir-collections",
    type: "section",
    name: "New watch collections",
    frames: frames(
      { x: 0, y: 1464, width: 1440, height: 680, zIndex: 30 },
      { x: 0, y: 1668, width: 768, height: 650, zIndex: 30 },
      { x: 0, y: 2282, width: 390, height: 760, zIndex: 30 },
    ),
    fills: solid("#FFFFFF"),
    props: { overflow: "hidden", background: "#FFFFFF" },
    extensions: editorExtensions("section", {
      sectionType: "watch-collections",
      canonicalSectionType: "featured-product-collection",
    }),
  });
  addText(
    builder,
    section.id,
    "noir-collections-heading",
    "Collections heading",
    "New Collections",
    frames(
      { x: 28, y: 54, width: 520, height: 62, zIndex: 10 },
      { x: 28, y: 46, width: 440, height: 54, zIndex: 10 },
      { x: 22, y: 38, width: 340, height: 46, zIndex: 10 },
    ),
    46,
    600,
    "#111111",
    {
      responsiveProps: {
        tablet: { fontSize: 38 },
        mobile: { fontSize: 32 },
      },
    },
  );
  ["New", "Classic", "Sport", "Modern"].forEach((label, index) =>
    addButton(
      builder,
      section.id,
      `noir-collection-tab-${index}`,
      label,
      frames(
        {
          x: 760 + index * 150,
          y: 52,
          width: 138,
          height: 44,
          zIndex: 10,
        },
        {
          x: 250 + index * 120,
          y: 108,
          width: 110,
          height: 40,
          zIndex: 10,
        },
        {
          x: 22 + (index % 2) * 176,
          y: 98 + Math.floor(index / 2) * 48,
          width: 166,
          height: 40,
          zIndex: 10,
        },
      ),
      {
        background: index === 1 ? "#111111" : "#FFFFFF",
        color: index === 1 ? "#FFFFFF" : "#111111",
        border: "1px solid #BDB9B6",
        extensions: {
          action: "browse-products",
          query: label,
        },
      },
    ),
  );
  builder.add(section.id, {
    id: "noir-collection-accent-a",
    type: "shape",
    name: "Collection blush backdrop one",
    frames: frames(
      { x: 450, y: 190, width: 590, height: 360, rotation: -7, zIndex: 2 },
      { x: 152, y: 210, width: 470, height: 310, rotation: -7, zIndex: 2 },
      { x: 42, y: 238, width: 306, height: 350, rotation: -6, zIndex: 2 },
    ),
    fills: solid(`${accent}55`),
    radius: 28,
    extensions: editorExtensions("block", {
      sectionType: "watch-collections",
      blockType: "decoration",
    }),
  });
  builder.add(section.id, {
    id: "noir-collection-accent-b",
    type: "shape",
    name: "Collection blush backdrop two",
    frames: frames(
      { x: 470, y: 176, width: 580, height: 370, rotation: 7, zIndex: 3 },
      { x: 170, y: 196, width: 450, height: 320, rotation: 7, zIndex: 3 },
      { x: 54, y: 230, width: 292, height: 360, rotation: 6, zIndex: 3 },
    ),
    fills: solid(`${accent}33`),
    radius: 28,
    extensions: editorExtensions("block", {
      sectionType: "watch-collections",
      blockType: "decoration",
    }),
  });
  builder.add(section.id, {
    id: "noir-collection-image-shell",
    type: "container",
    name: "Featured collection frame",
    frames: frames(
      { x: 410, y: 170, width: 650, height: 420, zIndex: 6 },
      { x: 138, y: 190, width: 492, height: 348, zIndex: 6 },
      { x: 34, y: 220, width: 322, height: 392, zIndex: 6 },
    ),
    fills: solid("#111111"),
    radius: 30,
    props: { overflow: "hidden" },
    extensions: editorExtensions("block", {
      sectionType: "watch-collections",
      blockType: "featured-frame",
      productSlotId: slotId,
      ...(productId ? { productId } : {}),
    }),
  });
  builder.add("noir-collection-image-shell", {
    id: "noir-collection-image",
    type: "image",
    name: "Featured collection watch",
    frames: frames(
      { x: 0, y: 0, width: 650, height: 420, zIndex: 1 },
      { x: 0, y: 0, width: 492, height: 348, zIndex: 1 },
      { x: 0, y: 0, width: 322, height: 392, zIndex: 1 },
    ),
    props: {
      src: featured?.image_url || watchLight,
      alt: safeText(featured?.name, "Classic rose-gold automatic watch"),
      objectFit: "cover",
      objectPosition: "50% 48%",
    },
    radius: 30,
    extensions: editorExtensions("block", {
      sectionType: "watch-collections",
      productSlotId: slotId,
      ...(productId ? { productId } : {}),
      dynamicBinding: productBinding(productId, "image_url", "src"),
    }),
  });
  addText(
    builder,
    "noir-collection-image-shell",
    "noir-collection-material",
    "Watch material label",
    "Mineral",
    frames(
      { x: 40, y: 325, width: 150, height: 42, zIndex: 5 },
      { x: 30, y: 272, width: 130, height: 38, zIndex: 5 },
      { x: 22, y: 324, width: 118, height: 36, zIndex: 5 },
    ),
    12,
    500,
    "#FFFFFF",
    {
      props: {
        textAlign: "center",
        background: "rgba(17,17,17,.72)",
      },
      extensions: {
        productSlotId: slotId,
        ...(productId ? { productId } : {}),
      },
    },
  );
  addButton(
    builder,
    section.id,
    "noir-collection-prev",
    "Previous",
    frames(
      { x: 32, y: 340, width: 70, height: 54, zIndex: 12 },
      { x: 38, y: 340, width: 58, height: 50, zIndex: 12 },
      { x: 22, y: 640, width: 64, height: 48, zIndex: 12 },
    ),
    {
      extensions: {
        action: "browse-products",
        query: "New",
      },
    },
  );
  addButton(
    builder,
    section.id,
    "noir-collection-next",
    "Next",
    frames(
      { x: 1338, y: 340, width: 70, height: 54, zIndex: 12 },
      { x: 672, y: 340, width: 58, height: 50, zIndex: 12 },
      { x: 304, y: 640, width: 64, height: 48, zIndex: 12 },
    ),
    {
      extensions: {
        action: "browse-products",
        query: "Modern",
      },
    },
  );
};

const addStory = (
  builder: NoirSceneBuilder,
  accent: string,
) => {
  const section = builder.add("noir-root", {
    id: "noir-story",
    type: "section",
    name: "Find your ideal watch",
    frames: frames(
      { x: 0, y: 2144, width: 1440, height: 560, zIndex: 40 },
      { x: 0, y: 2318, width: 768, height: 660, zIndex: 40 },
      { x: 0, y: 3042, width: 390, height: 860, zIndex: 40 },
    ),
    fills: solid("#FFFFFF"),
    props: { overflow: "hidden", background: "#FFFFFF" },
    extensions: editorExtensions("section", {
      sectionType: "watch-story",
      canonicalSectionType: "image-with-text",
    }),
  });
  builder.add(section.id, {
    id: "noir-story-shell",
    type: "container",
    name: "Ideal watch editorial panel",
    frames: frames(
      { x: 28, y: 54, width: 1384, height: 450, zIndex: 2 },
      { x: 24, y: 18, width: 720, height: 624, zIndex: 2 },
      { x: 18, y: 36, width: 354, height: 792, zIndex: 2 },
    ),
    fills: solid("#111111"),
    radius: 30,
    props: { overflow: "hidden" },
    extensions: editorExtensions("block", {
      sectionType: "watch-story",
      blockType: "story-shell",
    }),
  });
  addText(
    builder,
    "noir-story-shell",
    "noir-story-heading",
    "Story heading",
    "Find your ideal\nwatch here",
    frames(
      { x: 66, y: 128, width: 690, height: 160, zIndex: 6 },
      { x: 44, y: 64, width: 560, height: 140, zIndex: 6 },
      { x: 24, y: 36, width: 306, height: 118, zIndex: 6 },
    ),
    68,
    500,
    "#F7F7F5",
    {
      responsiveProps: {
        tablet: { fontSize: 52 },
        mobile: { fontSize: 38 },
      },
    },
  );
  addText(
    builder,
    "noir-story-shell",
    "noir-story-copy",
    "Story statement",
    "We stand out through precise craft, modern materials and timeless silhouettes designed for every hour.",
    frames(
      { x: 66, y: 52, width: 490, height: 54, zIndex: 6 },
      { x: 44, y: 232, width: 430, height: 56, zIndex: 6 },
      { x: 24, y: 170, width: 304, height: 80, zIndex: 6 },
    ),
    12,
    400,
    "#D5D2CF",
    {
      props: { fontFamily: bodyFont, lineHeight: 1.45 },
      responsiveProps: { mobile: { fontSize: 11 } },
    },
  );
  addText(
    builder,
    "noir-story-shell",
    "noir-story-subheading",
    "Story subheading",
    "From Classic to contemporary",
    frames(
      { x: 70, y: 332, width: 480, height: 42, zIndex: 6 },
      { x: 44, y: 312, width: 420, height: 40, zIndex: 6 },
      { x: 24, y: 270, width: 290, height: 36, zIndex: 6 },
    ),
    23,
    400,
    "#F7F7F5",
    {
      props: { fontFamily: bodyFont, fontStyle: "italic" },
      responsiveProps: { mobile: { fontSize: 16 } },
    },
  );
  addButton(
    builder,
    "noir-story-shell",
    "noir-story-arrow",
    "Explore",
    frames(
      { x: 580, y: 322, width: 66, height: 54, zIndex: 8 },
      { x: 490, y: 304, width: 62, height: 50, zIndex: 8 },
      { x: 268, y: 316, width: 60, height: 48, zIndex: 8 },
    ),
    {
      color: "#FFFFFF",
      border: "1px solid #FFFFFF",
      extensions: { navigationTarget: "products" },
    },
  );
  builder.add("noir-story-shell", {
    id: "noir-story-image",
    type: "image",
    name: "Story watch detail",
    frames: frames(
      { x: 885, y: 0, width: 499, height: 172, zIndex: 5 },
      { x: 430, y: 370, width: 290, height: 198, zIndex: 5 },
      { x: 0, y: 392, width: 354, height: 176, zIndex: 5 },
    ),
    props: {
      src: watchLight,
      alt: "Rose-gold watch detail",
      objectFit: "cover",
      objectPosition: "50% 42%",
    },
    radius: 26,
    extensions: editorExtensions("block", {
      sectionType: "watch-story",
      blockType: "image",
    }),
  });
  builder.add("noir-story-shell", {
    id: "noir-story-trend-card",
    type: "container",
    name: "Latest trend story card",
    frames: frames(
      { x: 885, y: 172, width: 499, height: 150, zIndex: 6 },
      { x: 0, y: 370, width: 410, height: 198, zIndex: 6 },
      { x: 0, y: 568, width: 354, height: 122, zIndex: 6 },
    ),
    fills: solid(accent),
    radius: 26,
    extensions: editorExtensions("block", {
      sectionType: "watch-story",
      blockType: "feature-card",
    }),
  });
  addText(
    builder,
    "noir-story-trend-card",
    "noir-story-trend-title",
    "Trend feature title",
    "Shop the Latest Watch Trends",
    frames(
      { x: 28, y: 24, width: 390, height: 48, zIndex: 2 },
      { x: 24, y: 24, width: 350, height: 48, zIndex: 2 },
      { x: 20, y: 18, width: 310, height: 38, zIndex: 2 },
    ),
    22,
    500,
    "#111111",
    { responsiveProps: { mobile: { fontSize: 17 } } },
  );
  addText(
    builder,
    "noir-story-trend-card",
    "noir-story-trend-copy",
    "Trend feature copy",
    "Precise proportions, elegant surfaces and dependable movement.",
    frames(
      { x: 28, y: 84, width: 400, height: 44, zIndex: 2 },
      { x: 24, y: 84, width: 350, height: 44, zIndex: 2 },
      { x: 20, y: 64, width: 310, height: 42, zIndex: 2 },
    ),
    12,
    400,
    "#3A302F",
    { props: { fontFamily: bodyFont, lineHeight: 1.35 } },
  );
  builder.add("noir-story-shell", {
    id: "noir-story-tags",
    type: "container",
    name: "Watch brand tags",
    frames: frames(
      { x: 885, y: 322, width: 499, height: 128, zIndex: 6 },
      { x: 0, y: 568, width: 720, height: 56, zIndex: 6 },
      { x: 0, y: 690, width: 354, height: 102, zIndex: 6 },
    ),
    fills: solid("#F8D9D6"),
    radius: 26,
    extensions: editorExtensions("block", {
      sectionType: "watch-story",
      blockType: "tags",
    }),
  });
  ["Zenith", "Rolex", "Cartier", "Omega", "Seiko"].forEach(
    (label, index) =>
      addButton(
        builder,
        "noir-story-tags",
        `noir-story-tag-${index}`,
        label,
        frames(
          {
            x: 24 + (index % 3) * 145,
            y: 24 + Math.floor(index / 3) * 45,
            width: 130,
            height: 34,
            zIndex: 2,
          },
          {
            x: 24 + index * 130,
            y: 16,
            width: 118,
            height: 34,
            zIndex: 2,
          },
          {
            x: 18 + (index % 3) * 106,
            y: 16 + Math.floor(index / 3) * 40,
            width: 96,
            height: 30,
            zIndex: 2,
          },
        ),
        {
          color: "#111111",
          border: "1px solid #8E7977",
          fontSize: 10,
          extensions: {
            action: "browse-products",
            query: label,
          },
        },
      ),
  );
};

const addCategories = (
  builder: NoirSceneBuilder,
  items: StoreSceneItem[],
  accent: string,
) => {
  const featured = items[1] ?? items[0];
  const productId = itemId(featured);
  const slotId = "noir-category-feature-slot";
  const section = builder.add("noir-root", {
    id: "noir-categories",
    type: "section",
    name: "Watch category guide",
    frames: frames(
      { x: 0, y: 2704, width: 1440, height: 650, zIndex: 50 },
      { x: 0, y: 2978, width: 768, height: 720, zIndex: 50 },
      { x: 0, y: 3902, width: 390, height: 920, zIndex: 50 },
    ),
    fills: solid("#FFFFFF"),
    props: { overflow: "hidden", background: "#FFFFFF" },
    extensions: editorExtensions("section", {
      sectionType: "watch-categories",
      canonicalSectionType: "rich-text",
    }),
  });
  const rows = [
    ["New Arrivals", "Fresh silhouettes and modern finishes."],
    ["Best Sellers", "The watches customers return to."],
    ["Most Popular", "Refined essentials for every day."],
    ["Luxury", "Precision materials and timeless craft."],
  ];
  rows.forEach(([title, copy], index) => {
    const y = 78 + index * 122;
    addText(
      builder,
      section.id,
      `noir-category-${index}`,
      `${title} category`,
      title,
      frames(
        { x: 58, y, width: 340, height: 48, zIndex: 4 },
        { x: 38, y: 58 + index * 116, width: 300, height: 44, zIndex: 4 },
        { x: 22, y: 42 + index * 104, width: 210, height: 40, zIndex: 4 },
      ),
      28,
      500,
      "#111111",
      {
        responsiveProps: {
          tablet: { fontSize: 24 },
          mobile: { fontSize: 21 },
        },
        extensions: {
          action: "browse-products",
          query: title,
        },
      },
    );
    addText(
      builder,
      section.id,
      `noir-category-copy-${index}`,
      `${title} description`,
      copy,
      frames(
        { x: 390, y: y + 4, width: 300, height: 44, zIndex: 4 },
        {
          x: 318,
          y: 60 + index * 116,
          width: 240,
          height: 42,
          zIndex: 4,
        },
        { x: 222, y: 44 + index * 104, width: 142, height: 46, zIndex: 4 },
      ),
      11,
      400,
      "#575351",
      {
        props: { fontFamily: bodyFont, lineHeight: 1.45 },
        responsiveProps: { mobile: { fontSize: 9 } },
      },
    );
    builder.add(section.id, {
      id: `noir-category-line-${index}`,
      type: "shape",
      name: `${title} divider`,
      frames: frames(
        { x: 58, y: y + 72, width: 650, height: 1, zIndex: 3 },
        {
          x: 38,
          y: 58 + index * 116 + 72,
          width: 520,
          height: 1,
          zIndex: 3,
        },
        {
          x: 22,
          y: 42 + index * 104 + 68,
          width: 342,
          height: 1,
          zIndex: 3,
        },
      ),
      fills: solid("#B6B2AF"),
      extensions: editorExtensions("block", {
        sectionType: "watch-categories",
        blockType: "divider",
      }),
    });
  });
  builder.add(section.id, {
    id: "noir-category-image-backdrop",
    type: "shape",
    name: "Category image blush backdrop",
    frames: frames(
      { x: 900, y: 62, width: 430, height: 510, zIndex: 2 },
      { x: 510, y: 182, width: 220, height: 450, zIndex: 2 },
      { x: 48, y: 504, width: 318, height: 350, zIndex: 2 },
    ),
    fills: solid(accent),
    radius: 30,
    extensions: editorExtensions("block", {
      sectionType: "watch-categories",
      blockType: "decoration",
    }),
  });
  builder.add(section.id, {
    id: "noir-category-image",
    type: "image",
    name: "Category watch image",
    frames: frames(
      { x: 845, y: 62, width: 450, height: 510, zIndex: 4 },
      { x: 488, y: 156, width: 220, height: 450, zIndex: 4 },
      { x: 24, y: 478, width: 330, height: 350, zIndex: 4 },
    ),
    props: {
      src: featured?.image_url || watchLight,
      alt: safeText(featured?.name, "Classic watch collection"),
      objectFit: "cover",
      objectPosition: "50% 45%",
    },
    radius: 30,
    extensions: editorExtensions("block", {
      sectionType: "watch-categories",
      productSlotId: slotId,
      ...(productId ? { productId } : {}),
      dynamicBinding: productBinding(productId, "image_url", "src"),
    }),
  });
  addText(
    builder,
    section.id,
    "noir-category-image-label",
    "Category image label",
    "Classic Watch",
    frames(
      { x: 875, y: 88, width: 150, height: 34, zIndex: 6 },
      { x: 506, y: 176, width: 150, height: 32, zIndex: 6 },
      { x: 42, y: 498, width: 140, height: 30, zIndex: 6 },
    ),
    12,
    500,
    "#FFFFFF",
    {
      props: {
        textAlign: "center",
        background: "rgba(17,17,17,.72)",
      },
      extensions: {
        productSlotId: slotId,
        ...(productId ? { productId } : {}),
      },
    },
  );
};

const addFooter = (
  builder: NoirSceneBuilder,
  storeName: string,
  accent: string,
) => {
  const section = builder.add("noir-root", {
    id: "noir-footer",
    type: "section",
    name: "Noir global footer",
    frames: frames(
      { x: 0, y: 3354, width: 1440, height: 620, zIndex: 60 },
      { x: 0, y: 3698, width: 768, height: 660, zIndex: 60 },
      { x: 0, y: 4822, width: 390, height: 820, zIndex: 60 },
    ),
    fills: solid("#FFFFFF"),
    props: { overflow: "hidden", background: "#FFFFFF" },
    extensions: editorExtensions("section", {
      sectionType: "footer",
      canonicalSectionType: "site-footer",
      global: false,
      sectionScope: "local",
      sectionInstanceId: "noir-footer",
    }),
  });
  builder.add(section.id, {
    id: "noir-footer-shell",
    type: "container",
    name: "Footer dark panel",
    frames: frames(
      { x: 28, y: 52, width: 1384, height: 500, zIndex: 2 },
      { x: 24, y: 48, width: 720, height: 558, zIndex: 2 },
      { x: 18, y: 36, width: 354, height: 720, zIndex: 2 },
    ),
    fills: solid("#111111"),
    radius: 30,
    props: { overflow: "visible" },
    extensions: editorExtensions("block", {
      sectionType: "footer",
      blockType: "footer-shell",
    }),
  });
  addText(
    builder,
    "noir-footer-shell",
    "noir-footer-heading",
    "Footer heading",
    "Let's Work\nTogether",
    frames(
      { x: 76, y: 70, width: 760, height: 160, zIndex: 5 },
      { x: 42, y: 54, width: 620, height: 144, zIndex: 5 },
      { x: 24, y: 42, width: 306, height: 126, zIndex: 5 },
    ),
    72,
    500,
    "#F7F7F5",
    {
      responsiveProps: {
        tablet: { fontSize: 58 },
        mobile: { fontSize: 42 },
      },
    },
  );
  addText(
    builder,
    "noir-footer-shell",
    "noir-footer-intro",
    "Footer introduction",
    "A modern watch store built around exact details, dependable service and objects worth keeping.",
    frames(
      { x: 840, y: 120, width: 410, height: 70, zIndex: 5 },
      { x: 42, y: 218, width: 520, height: 60, zIndex: 5 },
      { x: 24, y: 188, width: 306, height: 82, zIndex: 5 },
    ),
    12,
    400,
    "#D6D2CF",
    { props: { fontFamily: bodyFont, lineHeight: 1.45 } },
  );
  addButton(
    builder,
    "noir-footer-shell",
    "noir-footer-arrow",
    "Visit",
    frames(
      { x: 1130, y: -38, width: 104, height: 104, zIndex: 10 },
      { x: 590, y: -30, width: 90, height: 90, zIndex: 10 },
      { x: 246, y: -24, width: 82, height: 82, zIndex: 10 },
    ),
    {
      background: accent,
      color: "#111111",
      border: "8px solid #FFFFFF",
      radius: 999,
      fontSize: 12,
      extensions: { navigationTarget: "contact" },
    },
  );
  addText(
    builder,
    "noir-footer-shell",
    "noir-footer-brand",
    "Footer brand",
    storeName,
    frames(
      { x: 76, y: 310, width: 300, height: 40, zIndex: 5 },
      { x: 42, y: 334, width: 250, height: 38, zIndex: 5 },
      { x: 24, y: 308, width: 260, height: 36, zIndex: 5 },
    ),
    22,
    650,
    accent,
    {
      extensions: {
        dynamicBinding: {
          source: "store",
          field: "business_name",
          target: "text",
        },
      },
    },
  );
  const footerColumns = [
    ["Address", "876, 5th street\nNew York, USA"],
    ["Call Us", "+0223 4836 3028\n+0991 8394 9030"],
    ["Our Policies", "Privacy Policies\nTerms of use\nRefund Policy"],
  ];
  footerColumns.forEach(([title, copy], index) => {
    const x = 430 + index * 310;
    addText(
      builder,
      "noir-footer-shell",
      `noir-footer-column-title-${index}`,
      `${title} title`,
      title,
      frames(
        { x, y: 304, width: 220, height: 32, zIndex: 5 },
        {
          x: 300 + (index % 2) * 200,
          y: 330 + Math.floor(index / 2) * 100,
          width: 190,
          height: 30,
          zIndex: 5,
        },
        {
          x: 24 + (index % 2) * 166,
          y: 378 + Math.floor(index / 2) * 118,
          width: 150,
          height: 28,
          zIndex: 5,
        },
      ),
      13,
      600,
      "#FFFFFF",
      { props: { fontFamily: bodyFont } },
    );
    addText(
      builder,
      "noir-footer-shell",
      `noir-footer-column-copy-${index}`,
      `${title} content`,
      copy,
      frames(
        { x, y: 346, width: 230, height: 76, zIndex: 5 },
        {
          x: 300 + (index % 2) * 200,
          y: 364 + Math.floor(index / 2) * 100,
          width: 190,
          height: 72,
          zIndex: 5,
        },
        {
          x: 24 + (index % 2) * 166,
          y: 412 + Math.floor(index / 2) * 118,
          width: 150,
          height: 78,
          zIndex: 5,
        },
      ),
      10,
      400,
      "#D6D2CF",
      { props: { fontFamily: bodyFont, lineHeight: 1.7 } },
    );
  });
  builder.add("noir-footer-shell", {
    id: "noir-footer-strip",
    type: "shape",
    name: "Footer accent strip",
    frames: frames(
      { x: 0, y: 438, width: 1384, height: 62, zIndex: 3 },
      { x: 0, y: 496, width: 720, height: 62, zIndex: 3 },
      { x: 0, y: 650, width: 354, height: 70, zIndex: 3 },
    ),
    fills: solid(accent),
    extensions: editorExtensions("block", {
      sectionType: "footer",
      blockType: "accent-strip",
    }),
  });
  addText(
    builder,
    "noir-footer-shell",
    "noir-footer-copyright",
    "Footer copyright",
    "2026 Noir Chrono. All rights reserved.",
    frames(
      { x: 76, y: 459, width: 360, height: 24, zIndex: 6 },
      { x: 36, y: 517, width: 320, height: 24, zIndex: 6 },
      { x: 24, y: 672, width: 306, height: 24, zIndex: 6 },
    ),
    10,
    500,
    "#111111",
    { props: { fontFamily: bodyFont } },
  );
};

const applyInitialChromeDefaults = (source: SceneTree): SceneTree => {
  const settings = themeChromeSystem.getSettings(source);
  settings.icons.account.color = "#F7F7F5";
  settings.icons.cart.color = "#F7F7F5";
  settings.icons.search.color = "#F7F7F5";
  Object.keys(settings.navigationIcons).forEach((id) => {
    settings.navigationIcons[id] = null;
  });
  settings.mobileMenu.animation = "slideIn";
  return themeChromeSystem.applySettings(source, settings);
};

export const buildNoirChronoScene = (
  profile: StoreSceneProfile,
  items: StoreSceneItem[] = [],
): SceneTree => {
  const builder = new NoirSceneBuilder();
  const accent = safeText(profile.store_color, "#F5AAA5");
  const storeName = safeText(profile.business_name, "Noir Chrono");

  builder.add(null, {
    id: "noir-root",
    type: "section",
    name: "Noir Chrono storefront",
    frames: frames(
      { x: 0, y: 0, width: 1440, height: 3974, zIndex: 0 },
      { x: 0, y: 0, width: 768, height: 4358, zIndex: 0 },
      { x: 0, y: 0, width: 390, height: 5642, zIndex: 0 },
    ),
    fills: solid("#FFFFFF"),
    props: { overflow: "visible" },
    extensions: editorExtensions("page", {
      template: "noir-chrono",
      themeId: "noir-chrono",
      navigation: createDefaultStoreNavigationDocument(),
      canvasBackground: "#D8D6D4",
      responsiveBaseWidth: 1440,
      responsiveWidths: { desktop: 1440, tablet: 768, mobile: 390 },
      structuredPage: true,
      structuredLayoutPolicy: "authored-responsive",
      designTokens: {
        colors: {
          primary: accent,
          secondary: "#111111",
          background: "#F7F7F5",
          surface: "#FFFFFF",
          text: "#111111",
          mutedText: "#6B6867",
          border: "#D9D7D4",
          success: "#2D8A65",
          warning: "#B56A19",
          error: "#C94141",
        },
        typography: {
          headingFont: displayFont,
          bodyFont,
          baseSize: 16,
          headingScale: 1.32,
          bodyWeight: 400,
          headingWeight: 600,
          lineHeight: 1.45,
          letterSpacing: 0,
        },
        layout: {
          maxWidth: 1440,
          desktopPadding: 28,
          tabletPadding: 24,
          mobilePadding: 18,
        },
        buttons: {
          radius: 999,
          borderWidth: 1,
          minHeight: 44,
          mobileFullWidth: false,
        },
        cards: {
          radius: 28,
          borderWidth: 1,
          imageRatio: "4 / 5",
          internalSpacing: 18,
        },
      },
    }),
  });

  addHeader(builder, storeName, accent);
  addHero(builder, accent);
  addProducts(builder, items, accent);
  addCollections(builder, items, accent);
  addStory(builder, accent);
  addCategories(builder, items, accent);
  addFooter(builder, storeName, accent);

  let scene = structuredLayoutSystem.reflowScene(
    validateSceneTree({ rootNodeId: "noir-root", nodes: builder.nodes }),
  );
  scene = applyInitialChromeDefaults(themeChromeSystem.ensureScene(scene));
  assertValidSceneTreeStructure(scene);
  return scene;
};

const productSlots = [
  "noir-product-slot-0",
  "noir-product-slot-1",
  "noir-product-slot-2",
  "noir-product-slot-3",
  "noir-featured-collection-slot",
  "noir-category-feature-slot",
] as const;

export const reconcileNoirChronoProducts = (
  sceneTree: SceneTree,
  _profile: StoreSceneProfile,
  items: StoreSceneItem[] = [],
): SceneTree => {
  const root = sceneTree.rootNodeId
    ? sceneTree.nodes[sceneTree.rootNodeId]
    : undefined;
  if (root?.extensions?.template !== "noir-chrono") {
    return cloneSceneTree(sceneTree);
  }
  const scene = themeChromeSystem.ensureScene(
    ensureNoirResponsiveLayoutContract(sceneTree),
  );
  const availableIds = new Set(items.map(itemId).filter(Boolean) as string[]);

  productSlots.forEach((slotId, index) => {
    const anchor = Object.values(scene.nodes).find(
      (node) => node.extensions?.productSlotId === slotId,
    );
    if (!anchor) return;
    const persisted = productReferenceId(anchor);
    const fallbackItem =
      slotId === "noir-featured-collection-slot"
        ? items[0]
        : slotId === "noir-category-feature-slot"
          ? items[1] ?? items[0]
          : items[index];
    const nextProductId =
      persisted && availableIds.has(persisted)
        ? persisted
        : itemId(fallbackItem);
    const slotNodeIds = Object.values(scene.nodes)
      .filter((node) => node.extensions?.productSlotId === slotId)
      .map((node) => node.id);
    synchronizeProductReference(
      scene,
      slotNodeIds,
      nextProductId,
      slotId,
    );
  });

  const next = structuredLayoutSystem.reflowScene(scene);
  assertValidSceneTreeStructure(next);
  return next;
};
