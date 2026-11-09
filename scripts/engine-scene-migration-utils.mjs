import fs from "node:fs";
import path from "node:path";
import process from "node:process";

export const ENGINE_SCENE_THEME_KEY = "engine_scene";

const timestamp = 1_780_000_000_000;

const DEFAULT_SECTION_ORDER = [
  "hero",
  "trustStrip",
  "about",
  "flashDeals",
  "specialSections",
  "allProducts",
  "newsletter",
  "footer",
];

const DEFAULT_THEME = {
  accent: "#5669ff",
  bg: "#F5F5F7",
  surface: "#FFFFFF",
  text: "#0F172A",
  buttonText: "#FFFFFF",
  radius: 12,
  density: "cozy",
  font: "system",
  compact: false,
  sections: {
    topBar: true,
    search: true,
    categories: true,
    hero: true,
    trustStrip: true,
    about: true,
    flashDeals: true,
    specialSections: true,
    allProducts: true,
    newsletter: true,
    footer: true,
  },
  section_order: DEFAULT_SECTION_ORDER,
  text_overrides: {
    heroCta: "Shop now",
    allProductsTitle: "All Products",
    aboutTitle: "About the store",
    newsletterTitle: "Stay updated",
    newsletterCopy: "Get exclusive offers in your inbox.",
    newsletterCta: "Join",
    footerNote: "All rights reserved.",
  },
  overlays: [],
  custom_blocks: [],
  text_overlays: [],
};

export const loadLocalEnv = () => {
  const envPath = path.resolve(process.cwd(), ".env");
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) continue;
    const index = trimmed.indexOf("=");
    const key = trimmed.slice(0, index).trim();
    const rawValue = trimmed.slice(index + 1).trim();
    if (!key || process.env[key]) continue;
    process.env[key] = rawValue.replace(/^["']|["']$/g, "");
  }
};

export const getSupabaseConfig = () => {
  loadLocalEnv();
  const url = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL;
  const serviceKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY ??
    process.env.SUPABASE_SERVICE_KEY ??
    process.env.SUPABASE_SECRET_KEY;
  if (!url) throw new Error("Missing SUPABASE_URL or VITE_SUPABASE_URL.");
  if (!serviceKey) {
    throw new Error(
      "Missing SUPABASE_SERVICE_ROLE_KEY. Engine Scene migration/verification must run with a service-role key.",
    );
  }
  return { url, serviceKey };
};

const cloneJson = (value) => JSON.parse(JSON.stringify(value));

const solid = (color) => [{ type: "solid", color }];
const stroke = (color, width = 1) => [{ color, width, style: "solid" }];

const safeText = (value, fallback) => {
  const text = typeof value === "string" ? value.trim() : "";
  return text || fallback;
};

const resolveTheme = (raw, accentFallback) => {
  const input = raw && typeof raw === "object" ? raw : {};
  const persistedOrder = Array.isArray(input.section_order) ? input.section_order : [];
  const order = [];
  const seen = new Set();
  for (const key of persistedOrder) {
    if (DEFAULT_SECTION_ORDER.includes(key) && !seen.has(key)) {
      order.push(key);
      seen.add(key);
    }
  }
  for (const key of DEFAULT_SECTION_ORDER) {
    if (!seen.has(key)) order.push(key);
  }

  return {
    ...DEFAULT_THEME,
    ...input,
    accent: input.accent ?? accentFallback ?? DEFAULT_THEME.accent,
    sections: { ...DEFAULT_THEME.sections, ...(input.sections ?? {}) },
    section_order: order,
    text_overrides: { ...DEFAULT_THEME.text_overrides, ...(input.text_overrides ?? {}) },
    overlays: Array.isArray(input.overlays) ? input.overlays : [],
    custom_blocks: Array.isArray(input.custom_blocks) ? input.custom_blocks : [],
    text_overlays: Array.isArray(input.text_overlays) ? input.text_overlays : [],
  };
};

const createNode = (input, parentId) => ({
  id: input.id,
  type: input.type,
  name: input.name,
  parentId,
  childIds: [],
  props: input.props ?? {},
  style: { fills: [], strokes: [], effects: [], opacity: 1, ...(input.style ?? {}) },
  layout: { mode: "absolute", ...(input.layout ?? {}) },
  transform: {
    x: 0,
    y: 0,
    width: 100,
    height: 100,
    rotation: 0,
    scaleX: 1,
    scaleY: 1,
    skewX: 0,
    skewY: 0,
    transformOrigin: [0.5, 0.5],
    zIndex: 0,
    ...(input.transform ?? {}),
  },
  meta: { locked: false, hidden: false, createdAt: timestamp, updatedAt: timestamp, ...(input.meta ?? {}) },
  ...(input.extensions ? { extensions: input.extensions } : {}),
});

const append = (nodes, parent, child) => {
  parent.childIds.push(child.id);
  nodes.push(child);
  return child;
};

const sectionNode = (id, name, y, height, theme, parentId) =>
  createNode(
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
    },
    parentId,
  );

const textNode = (id, name, text, parentId, transform, color, fontSize, fontWeight = 600) =>
  createNode(
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

const buttonNode = (id, name, label, parentId, transform, theme) =>
  createNode(
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

export const buildStoreSceneTree = (profile, items = []) => {
  const saved = getSavedEngineScene(profile.theme);
  if (saved) return saved;

  const theme = resolveTheme(profile.theme, profile.store_color);
  const businessName = safeText(profile.business_name, "My store");
  const tagline = safeText(profile.store_tagline, "Design your storefront visually");
  const about = safeText(profile.store_about, "Tell customers what makes this store different.");
  const root = createNode(
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
  const nodes = [root];

  const hero = append(nodes, root, sectionNode("section-hero", "Hero / banner", 40, 360, theme, root.id));
  hero.style = {
    fills: profile.store_banner_url
      ? [{ type: "image", src: profile.store_banner_url }]
      : [{ type: "gradient", value: `linear-gradient(135deg, ${theme.accent} 0%, #111827 100%)` }],
    strokes: [],
    effects: [{ type: "shadow", value: { x: 0, y: 22, blur: 54, spread: -30, color: "rgba(15,23,42,0.28)" } }],
    opacity: 1,
    cornerRadius: theme.radius,
  };
  append(nodes, hero, textNode("hero-title", "Hero title", businessName, hero.id, { x: 74, y: 78, width: 560, height: 96, zIndex: 3 }, "#ffffff", 56, 850));
  append(nodes, hero, textNode("hero-tagline", "Hero tagline", tagline, hero.id, { x: 78, y: 190, width: 520, height: 64, zIndex: 4 }, "rgba(255,255,255,0.88)", 22, 600));
  append(nodes, hero, buttonNode("hero-cta", "Hero button", theme.text_overrides.heroCta ?? "Shop now", hero.id, { x: 80, y: 278, width: 168, height: 54, zIndex: 5 }, theme));

  const aboutSection = append(nodes, root, sectionNode("section-about", "About the store", 440, 260, theme, root.id));
  append(nodes, aboutSection, textNode("about-title", "About title", theme.text_overrides.aboutTitle ?? "About the store", aboutSection.id, { x: 72, y: 52, width: 420, height: 54, zIndex: 1 }, theme.text, 34, 820));
  append(nodes, aboutSection, textNode("about-copy", "About copy", about, aboutSection.id, { x: 72, y: 118, width: 820, height: 84, zIndex: 2 }, theme.text, 18, 500));

  const productSection = append(nodes, root, sectionNode("section-products", "Products", 740, 460, theme, root.id));
  append(nodes, productSection, textNode("products-title", "Products title", theme.text_overrides.allProductsTitle ?? "All products", productSection.id, { x: 72, y: 48, width: 420, height: 54, zIndex: 1 }, theme.text, 34, 820));
  const productItems = items.slice(0, 6);
  if (!productItems.length) {
    append(nodes, productSection, textNode("products-empty-state", "Products empty state", "No products have been added yet.", productSection.id, { x: 72, y: 132, width: 520, height: 44, zIndex: 4 }, "rgba(15,23,42,0.62)", 18, 600));
  }
  productItems.forEach((item, index) => {
    const x = 72 + (index % 3) * 350;
    const y = 126 + Math.floor(index / 3) * 154;
    const itemId = item.id ?? index;
    const card = append(
      nodes,
      productSection,
      createNode(
        {
          id: `product-card-${itemId}`,
          type: "container",
          name: safeText(item.name, `Product ${index + 1}`),
          props: { overflow: "hidden" },
          transform: { x, y, width: 300, height: 126, zIndex: 10 + index },
          style: { fills: solid(theme.surface), strokes: stroke("rgba(17,24,39,0.10)"), effects: [], opacity: 1, cornerRadius: theme.radius },
          extensions: { productId: itemId },
        },
        productSection.id,
      ),
    );
    append(nodes, card, textNode(`product-title-${itemId}`, "Product name", safeText(item.name, `Product ${index + 1}`), card.id, { x: 18, y: 22, width: 230, height: 32, zIndex: 1 }, theme.text, 18, 800));
    append(nodes, card, textNode(`product-category-${itemId}`, "Product category", safeText(item.category, "Catalog"), card.id, { x: 18, y: 62, width: 230, height: 28, zIndex: 2 }, "rgba(15,23,42,0.62)", 13, 600));
  });

  const newsletter = append(nodes, root, sectionNode("section-newsletter", "Newsletter", 1240, 220, theme, root.id));
  append(nodes, newsletter, textNode("newsletter-title", "Newsletter title", theme.text_overrides.newsletterTitle ?? "Stay updated", newsletter.id, { x: 72, y: 48, width: 420, height: 48, zIndex: 1 }, theme.text, 30, 820));
  append(nodes, newsletter, textNode("newsletter-copy", "Newsletter copy", theme.text_overrides.newsletterCopy ?? DEFAULT_THEME.text_overrides.newsletterCopy, newsletter.id, { x: 72, y: 104, width: 620, height: 42, zIndex: 2 }, theme.text, 17, 500));
  append(nodes, newsletter, buttonNode("newsletter-cta", "Newsletter button", theme.text_overrides.newsletterCta ?? "Join", newsletter.id, { x: 840, y: 82, width: 160, height: 52, zIndex: 3 }, theme));

  const footer = append(nodes, root, sectionNode("section-footer", "Footer", 1500, 180, theme, root.id));
  footer.style = { fills: solid("#111827"), strokes: [], effects: [], opacity: 1, cornerRadius: theme.radius };
  append(nodes, footer, textNode("footer-note", "Footer note", theme.text_overrides.footerNote ?? "All rights reserved.", footer.id, { x: 72, y: 64, width: 620, height: 38, zIndex: 1 }, "#ffffff", 16, 600));

  const tree = {
    rootNodeId: root.id,
    nodes: Object.fromEntries(nodes.map((entry) => [entry.id, entry])),
  };
  validateEngineScene(tree);
  return tree;
};

export const validateEngineScene = (tree) => {
  if (!tree || typeof tree !== "object") throw new Error("Scene is not an object.");
  if (typeof tree.rootNodeId !== "string" || !tree.rootNodeId) throw new Error("Scene rootNodeId is missing.");
  if (!tree.nodes || typeof tree.nodes !== "object") throw new Error("Scene nodes map is missing.");
  if (!tree.nodes[tree.rootNodeId]) throw new Error(`Scene root node ${tree.rootNodeId} is missing.`);

  const visited = new Set();
  const visit = (nodeId) => {
    if (visited.has(nodeId)) throw new Error(`Scene contains a cycle at ${nodeId}.`);
    const node = tree.nodes[nodeId];
    if (!node) throw new Error(`Scene references missing node ${nodeId}.`);
    visited.add(nodeId);
    if (node.id !== nodeId) throw new Error(`Node map key ${nodeId} does not match node id ${node.id}.`);
    if (!node.type || !node.name || !node.transform || !node.style || !node.layout || !node.meta) {
      throw new Error(`Node ${nodeId} is missing required scene fields.`);
    }
    if (!Array.isArray(node.childIds)) throw new Error(`Node ${nodeId} childIds must be an array.`);
    for (const childId of node.childIds) {
      if (tree.nodes[childId]?.parentId !== nodeId) throw new Error(`Child ${childId} does not point back to ${nodeId}.`);
      visit(childId);
    }
    visited.delete(nodeId);
  };

  const reachable = new Set();
  const collect = (nodeId) => {
    const node = tree.nodes[nodeId];
    if (!node || reachable.has(nodeId)) return;
    reachable.add(nodeId);
    node.childIds.forEach(collect);
  };
  visit(tree.rootNodeId);
  collect(tree.rootNodeId);
  for (const nodeId of Object.keys(tree.nodes)) {
    if (!reachable.has(nodeId)) throw new Error(`Node ${nodeId} is not reachable from root.`);
  }
  return true;
};

export const getSavedEngineScene = (rawTheme) => {
  if (!rawTheme || typeof rawTheme !== "object") return null;
  const candidate = rawTheme[ENGINE_SCENE_THEME_KEY];
  if (!candidate) return null;
  validateEngineScene(candidate);
  return cloneJson(candidate);
};

export const createEngineSceneTheme = (sceneTree) => {
  validateEngineScene(sceneTree);
  return { [ENGINE_SCENE_THEME_KEY]: cloneJson(sceneTree) };
};
