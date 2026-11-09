import { createSceneNode, cloneSceneTree } from "@/engine/scene-graph";
import {
  CURRENT_ENGINE_DOCUMENT_VERSION,
  ENGINE_DOCUMENT_VERSION_KEY,
} from "@/engine/migration";
import { validateSceneTree } from "@/engine/validation";
import {
  ENGINE_PAGE_DOCUMENT_THEME_KEY,
  getStorefrontPageDocument,
  type StorefrontPageDocument,
} from "@/document/pages";
import {
  DEFAULT_THEME,
  resolveTheme,
  SECTION_LABELS,
  type CustomBlock,
  type SectionKey,
  type StoreTheme,
  type TextOverlay,
} from "@/lib/storeTheme";
import type { SceneNode, SceneTree, StyleData } from "@/types";

export const ENGINE_SCENE_THEME_KEY = "engine_scene";

export type EngineSceneTheme = {
  [ENGINE_DOCUMENT_VERSION_KEY]: typeof CURRENT_ENGINE_DOCUMENT_VERSION;
  [ENGINE_SCENE_THEME_KEY]: SceneTree;
  [ENGINE_PAGE_DOCUMENT_THEME_KEY]?: StorefrontPageDocument;
};

export type StoreSceneProfile = {
  business_name?: string | null;
  store_tagline?: string | null;
  store_about?: string | null;
  store_color?: string | null;
  store_banner_url?: string | null;
  theme?: unknown;
};

export type StoreSceneItem = {
  id?: string | number | null;
  name?: string | null;
  category?: string | null;
  description?: string | null;
  image_url?: string | null;
  images?: unknown;
  price_cents?: number | null;
  original_price_cents?: number | null;
  stock?: number | null;
  is_published?: boolean | null;
  sold_count?: number | null;
  created_at?: string | null;
};

const timestamp = 1_780_000_000_000;

const solid = (color: string): StyleData["fills"] => [{ type: "solid", color }];
const stroke = (color: string, width = 1): StyleData["strokes"] => [{ color, width, style: "solid" }];

const safeText = (value: unknown, fallback: string) => {
  const text = typeof value === "string" ? value.trim() : "";
  return text || fallback;
};

const node = (
  input: Parameters<typeof createSceneNode>[0],
  parentId: string | null,
): SceneNode => createSceneNode(input, parentId, timestamp);

const append = (parent: SceneNode, child: SceneNode) => {
  parent.childIds.push(child.id);
  return child;
};

const sectionNode = (
  id: string,
  name: string,
  y: number,
  height: number,
  theme: StoreTheme,
  parentId: string,
): SceneNode =>
  node(
    {
      id,
      type: "section",
      name,
      props: { overflow: "visible" },
      transform: { x: 0, y, width: 1200, height, zIndex: Math.round(y) },
      style: {
        fills: solid(theme.surface),
        strokes: stroke("rgba(17,24,39,0.08)"),
        effects: [],
        opacity: 1,
        cornerRadius: theme.radius,
      },
      extensions: { section: id.replace("section-", "") },
    },
    parentId,
  );

const textNode = (
  id: string,
  name: string,
  text: string,
  parentId: string,
  transform: Partial<SceneNode["transform"]>,
  color: string,
  fontSize: number,
  fontWeight = 600,
): SceneNode =>
  node(
    {
      id,
      type: "text",
      name,
      props: { text, color, fontSize, fontWeight, lineHeight: 1.16 },
      transform,
      style: { fills: [], strokes: [], effects: [], opacity: 1 },
    },
    parentId,
  );

const buttonNode = (
  id: string,
  name: string,
  label: string,
  parentId: string,
  transform: Partial<SceneNode["transform"]>,
  theme: StoreTheme,
): SceneNode =>
  node(
    {
      id,
      type: "button",
      name,
      props: { label, background: theme.accent, color: theme.buttonText, fontSize: 16, fontWeight: 800 },
      transform,
      style: { fills: [], strokes: [], effects: [], opacity: 1, cornerRadius: Math.min(12, theme.radius) },
    },
    parentId,
  );

const customBlockNode = (block: CustomBlock, y: number, theme: StoreTheme, parentId: string): SceneNode => {
  const base = {
    id: `custom-${block.id}`,
    name: `${SECTION_LABELS[block.section]} / ${block.kind}`,
    transform: { x: 76, y, width: 360, height: 72, zIndex: Math.round(y) },
    extensions: { customBlockId: block.id, section: block.section, kind: block.kind },
  };
  if (block.kind === "image") {
    return node(
      {
        ...base,
        type: "image",
        props: { src: block.props.src, alt: block.props.alt ?? block.props.text ?? "Image block" },
        transform: { ...base.transform, width: 420, height: 210 },
        style: { fills: solid("#e5e7eb"), strokes: [], effects: [], opacity: 1, cornerRadius: theme.radius },
      },
      parentId,
    );
  }
  if (block.kind === "button") {
    return buttonNode(base.id, base.name, safeText(block.props.text, "Button"), parentId, base.transform, theme);
  }
  if (block.kind === "divider") {
    return node(
      {
        ...base,
        type: "shape",
        transform: { ...base.transform, height: 2 },
        style: { fills: solid(theme.accent), strokes: [], effects: [], opacity: 1 },
      },
      parentId,
    );
  }
  if (block.kind === "spacer") {
    return node(
      {
        ...base,
        type: "shape",
        transform: { ...base.transform, height: Number(block.props.height ?? 48) },
        style: { fills: solid("rgba(13,153,255,0.08)"), strokes: stroke("rgba(13,153,255,0.25)"), effects: [], opacity: 1, cornerRadius: 4 },
      },
      parentId,
    );
  }
  return textNode(base.id, base.name, safeText(block.props.text, block.kind === "heading" ? "Heading" : "Text block"), parentId, base.transform, theme.text, block.kind === "heading" ? 28 : 18, block.kind === "heading" ? 800 : 500);
};

const overlayNode = (overlay: TextOverlay, parentId: string, theme: StoreTheme): SceneNode =>
  textNode(
    `text-overlay-${overlay.id}`,
    "Text overlay",
    safeText(overlay.text, "Overlay text"),
    parentId,
    {
      x: Math.round((overlay.x / 100) * 1200),
      y: Math.round((overlay.y / 100) * 360),
      width: 420,
      height: Math.max(32, overlay.fontSize * 1.4),
      zIndex: 40,
      rotation: overlay.rotate ?? 0,
    },
    overlay.color || theme.text,
    overlay.fontSize || 32,
    overlay.fontWeight || 700,
  );

export const getSavedEngineScene = (rawTheme: unknown): SceneTree | null => {
  if (!rawTheme || typeof rawTheme !== "object") return null;
  const theme = rawTheme as Record<string, unknown>;
  let candidate = theme[ENGINE_SCENE_THEME_KEY];
  if (!candidate) {
    const document = theme[ENGINE_PAGE_DOCUMENT_THEME_KEY];
    if (document && typeof document === "object") {
      const rawDocument = document as Partial<StorefrontPageDocument>;
      candidate = rawDocument.pages?.find((page) => page.id === rawDocument.homePageId)?.scene;
    }
  }
  if (!candidate) return null;
  try {
    return cloneSceneTree(validateSceneTree(candidate));
  } catch {
    return null;
  }
};

export const getRequiredEngineScene = (rawTheme: unknown, context = "profile"): SceneTree => {
  const scene = getSavedEngineScene(rawTheme);
  if (!scene) {
    throw new Error(
      `${context} is missing theme.${ENGINE_SCENE_THEME_KEY}. Run the Engine Scene migration before loading the engine-only store runtime.`,
    );
  }
  return scene;
};

export const buildStoreSceneTree = (
  profile: StoreSceneProfile,
  items: StoreSceneItem[] = [],
): SceneTree => {
  const saved = getSavedEngineScene(profile.theme);
  if (saved) return saved;

  const theme = resolveTheme(profile.theme, profile.store_color ?? undefined);
  const businessName = safeText(profile.business_name, "My store");
  const tagline = safeText(profile.store_tagline, "Design your storefront visually");
  const about = safeText(profile.store_about, "Tell customers what makes this store different.");
  const root = node(
    {
      id: "store-root",
      type: "section",
      name: "Storefront",
      props: { overflow: "visible" },
      transform: { x: 0, y: 0, width: 1200, height: 1760, zIndex: 0 },
      style: { fills: solid(theme.bg), strokes: [], effects: [], opacity: 1 },
      extensions: { source: "store-profile" },
    },
    null,
  );

  const nodes: SceneNode[] = [root];
  const add = (parent: SceneNode, child: SceneNode) => {
    append(parent, child);
    nodes.push(child);
    return child;
  };

  const hero = add(root, sectionNode("section-hero", "Hero / banner", 40, 360, theme, root.id));
  hero.style = {
    fills: profile.store_banner_url
      ? [{ type: "image", src: profile.store_banner_url }]
      : [{ type: "gradient", value: `linear-gradient(135deg, ${theme.accent} 0%, #111827 100%)` }],
    strokes: [],
    effects: [{ type: "shadow", value: { x: 0, y: 22, blur: 54, spread: -30, color: "rgba(15,23,42,0.28)" } }],
    opacity: 1,
    cornerRadius: theme.radius,
  };
  add(hero, textNode("hero-title", "Hero title", businessName, hero.id, { x: 74, y: 78, width: 560, height: 96, zIndex: 3 }, "#ffffff", 56, 850));
  add(hero, textNode("hero-tagline", "Hero tagline", tagline, hero.id, { x: 78, y: 190, width: 520, height: 64, zIndex: 4 }, "rgba(255,255,255,0.88)", 22, 600));
  add(hero, buttonNode("hero-cta", "Hero button", theme.text_overrides.heroCta ?? "Shop now", hero.id, { x: 80, y: 278, width: 168, height: 54, zIndex: 5 }, theme));
  (theme.text_overlays ?? []).forEach((overlay) => add(hero, overlayNode(overlay, hero.id, theme)));

  const aboutSection = add(root, sectionNode("section-about", "About the store", 440, 260, theme, root.id));
  add(aboutSection, textNode("about-title", "About title", theme.text_overrides.aboutTitle ?? "About the store", aboutSection.id, { x: 72, y: 52, width: 420, height: 54, zIndex: 1 }, theme.text, 34, 820));
  add(aboutSection, textNode("about-copy", "About copy", about, aboutSection.id, { x: 72, y: 118, width: 820, height: 84, zIndex: 2 }, theme.text, 18, 500));

  const productSection = add(root, sectionNode("section-products", "Products", 740, 460, theme, root.id));
  add(productSection, textNode("products-title", "Products title", theme.text_overrides.allProductsTitle ?? "All products", productSection.id, { x: 72, y: 48, width: 420, height: 54, zIndex: 1 }, theme.text, 34, 820));
  const productItems = items.slice(0, 6);
  if (!productItems.length) {
    add(productSection, textNode("products-empty-state", "Products empty state", "No products have been added yet.", productSection.id, { x: 72, y: 132, width: 520, height: 44, zIndex: 4 }, "rgba(15,23,42,0.62)", 18, 600));
  }
  productItems.forEach((item, index) => {
    const x = 72 + (index % 3) * 350;
    const y = 126 + Math.floor(index / 3) * 154;
    const card = add(
      productSection,
      node(
        {
          id: `product-card-${item.id ?? index}`,
          type: "container",
          name: safeText(item.name, `Product ${index + 1}`),
          props: { overflow: "hidden" },
          transform: { x, y, width: 300, height: 126, zIndex: 10 + index },
          style: { fills: solid(theme.surface), strokes: stroke("rgba(17,24,39,0.10)"), effects: [], opacity: 1, cornerRadius: theme.radius },
          extensions: { productId: item.id ?? index },
        },
        productSection.id,
      ),
    );
    add(card, textNode(`product-title-${item.id ?? index}`, "Product name", safeText(item.name, `Product ${index + 1}`), card.id, { x: 18, y: 22, width: 230, height: 32, zIndex: 1 }, theme.text, 18, 800));
    add(card, textNode(`product-category-${item.id ?? index}`, "Product category", safeText(item.category, "Catalog"), card.id, { x: 18, y: 62, width: 230, height: 28, zIndex: 2 }, "rgba(15,23,42,0.62)", 13, 600));
  });

  const newsletter = add(root, sectionNode("section-newsletter", "Newsletter", 1240, 220, theme, root.id));
  add(newsletter, textNode("newsletter-title", "Newsletter title", theme.text_overrides.newsletterTitle ?? "Stay updated", newsletter.id, { x: 72, y: 48, width: 420, height: 48, zIndex: 1 }, theme.text, 30, 820));
  add(newsletter, textNode("newsletter-copy", "Newsletter copy", theme.text_overrides.newsletterCopy ?? DEFAULT_THEME.text_overrides.newsletterCopy!, newsletter.id, { x: 72, y: 104, width: 620, height: 42, zIndex: 2 }, theme.text, 17, 500));
  add(newsletter, buttonNode("newsletter-cta", "Newsletter button", theme.text_overrides.newsletterCta ?? "Join", newsletter.id, { x: 840, y: 82, width: 160, height: 52, zIndex: 3 }, theme));

  const footer = add(root, sectionNode("section-footer", "Footer", 1500, 180, theme, root.id));
  footer.style = { fills: solid("#111827"), strokes: [], effects: [], opacity: 1, cornerRadius: theme.radius };
  add(footer, textNode("footer-note", "Footer note", theme.text_overrides.footerNote ?? "All rights reserved.", footer.id, { x: 72, y: 64, width: 620, height: 38, zIndex: 1 }, "#ffffff", 16, 600));

  let customY = 88;
  (theme.custom_blocks ?? []).forEach((block) => {
    const section = nodes.find((candidate) => candidate.id === `section-${block.section}`) ?? root;
    const child = customBlockNode(block, customY, theme, section.id);
    add(section, child);
    customY += child.transform.height + 18;
  });

  return {
    rootNodeId: root.id,
    nodes: Object.fromEntries(nodes.map((entry) => [entry.id, entry])),
  };
};

export const createEngineSceneTheme = (
  sceneTree: SceneTree,
  pageDocument?: StorefrontPageDocument,
): EngineSceneTheme => {
  if (!pageDocument) {
    return {
      [ENGINE_DOCUMENT_VERSION_KEY]: CURRENT_ENGINE_DOCUMENT_VERSION,
      [ENGINE_SCENE_THEME_KEY]: cloneSceneTree(sceneTree),
    };
  }
  const document = getStorefrontPageDocument(
    { [ENGINE_PAGE_DOCUMENT_THEME_KEY]: pageDocument },
    sceneTree,
  );
  const homeScene =
    document.pages.find((page) => page.id === document.homePageId)?.scene ?? sceneTree;
  return {
    [ENGINE_DOCUMENT_VERSION_KEY]: CURRENT_ENGINE_DOCUMENT_VERSION,
    [ENGINE_SCENE_THEME_KEY]: cloneSceneTree(homeScene),
    [ENGINE_PAGE_DOCUMENT_THEME_KEY]: document,
  };
};
