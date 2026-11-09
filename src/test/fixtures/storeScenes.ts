import { createSceneNode } from "@/engine/scene-graph";
import type { ResponsiveBreakpoint } from "@/stores/responsive.store";
import type { SceneNode, SceneTree, TransformData } from "@/types";

const FIXTURE_TIME = 1_700_000_000_000;

const transform = (
  x: number,
  y: number,
  width: number,
  height: number,
  zIndex = 0,
): TransformData => ({
  x,
  y,
  width,
  height,
  rotation: 0,
  scaleX: 1,
  scaleY: 1,
  skewX: 0,
  skewY: 0,
  transformOrigin: [0.5, 0.5],
  zIndex,
});

const responsiveFrames = (
  desktop: TransformData,
  tablet: TransformData,
  mobile: TransformData,
) => ({
  desktop: { transform: desktop },
  tablet: { transform: tablet },
  mobile: { transform: mobile },
}) satisfies Partial<Record<ResponsiveBreakpoint, { transform: TransformData }>>;

class FixtureSceneBuilder {
  readonly nodes: Record<string, SceneNode> = {};

  add(
    parentId: string | null,
    input: Parameters<typeof createSceneNode>[0],
  ): SceneNode {
    const node = createSceneNode(input, parentId, FIXTURE_TIME);
    this.nodes[node.id] = node;
    if (parentId) this.nodes[parentId].childIds.push(node.id);
    return node;
  }

  scene(rootNodeId: string): SceneTree {
    return { rootNodeId, nodes: this.nodes };
  }
}

const createRoot = (builder: FixtureSceneBuilder, id: string, height: number) =>
  builder.add(null, {
    id,
    type: "section",
    name: "Store page",
    transform: transform(0, 0, 1200, height),
    style: { fills: [{ type: "solid", color: "#FFFFFF" }] },
    extensions: {
      editorKind: "page",
      structured: true,
      responsiveWidths: { desktop: 1200, tablet: 768, mobile: 390 },
    },
  });

export const createEmptyStoreScene = (): SceneTree => {
  const builder = new FixtureSceneBuilder();
  const root = createRoot(builder, "fixture-empty-root", 800);
  return builder.scene(root.id);
};

export const createNormalStoreScene = (): SceneTree => {
  const builder = new FixtureSceneBuilder();
  const root = createRoot(builder, "fixture-normal-root", 1600);
  const hero = builder.add(root.id, {
    id: "fixture-normal-hero",
    type: "section",
    name: "Hero",
    transform: transform(48, 48, 1104, 520),
    style: { fills: [{ type: "solid", color: "#F4F4F0" }], cornerRadius: 16 },
    extensions: { editorKind: "section", structured: true },
  });
  builder.add(hero.id, {
    id: "fixture-normal-heading",
    type: "text",
    name: "Hero heading",
    transform: transform(64, 96, 430, 144, 1),
    props: { text: "A dependable storefront fixture", fontSize: 48, fontWeight: 700 },
    style: { fills: [{ type: "solid", color: "#151515" }] },
  });
  builder.add(hero.id, {
    id: "fixture-normal-image",
    type: "image",
    name: "Hero image",
    transform: transform(570, 48, 486, 424, 1),
    props: { src: "/placeholder.svg", alt: "Fixture product" },
    style: { cornerRadius: 12 },
  });
  return builder.scene(root.id);
};

export const createLargeStoreScene = (nodeCount = 1_000): SceneTree => {
  const builder = new FixtureSceneBuilder();
  const root = createRoot(builder, "fixture-large-root", Math.max(2_000, nodeCount * 42));
  for (let index = 0; index < nodeCount; index += 1) {
    builder.add(root.id, {
      id: `fixture-large-node-${index}`,
      type: index % 5 === 0 ? "shape" : "text",
      name: `Catalog block ${index + 1}`,
      transform: transform(32 + (index % 4) * 284, 40 + Math.floor(index / 4) * 40, 260, 32, index),
      props: index % 5 === 0
        ? { shape: "rectangle" }
        : { text: `Fixture content ${index + 1}`, fontSize: 14 },
      style: index % 5 === 0
        ? { fills: [{ type: "solid", color: "#E5E7EB" }] }
        : { fills: [{ type: "solid", color: "#111827" }] },
    });
  }
  return builder.scene(root.id);
};

export const createMobileHeavyStoreScene = (): SceneTree => {
  const builder = new FixtureSceneBuilder();
  const root = createRoot(builder, "fixture-mobile-root", 2400);
  root.layout.responsive = responsiveFrames(
    transform(0, 0, 1200, 2400),
    transform(0, 0, 768, 2600),
    transform(0, 0, 390, 4200),
  );
  for (let index = 0; index < 48; index += 1) {
    const desktop = transform(40 + (index % 4) * 280, 48 + Math.floor(index / 4) * 168, 252, 144, index);
    const tablet = transform(24 + (index % 2) * 372, 40 + Math.floor(index / 2) * 154, 348, 130, index);
    const mobile = transform(16, 32 + index * 82, 358, 66, index);
    builder.add(root.id, {
      id: `fixture-mobile-node-${index}`,
      type: "text",
      name: `Responsive block ${index + 1}`,
      transform: desktop,
      layout: { mode: "absolute", responsive: responsiveFrames(desktop, tablet, mobile) },
      props: { text: `Responsive content ${index + 1}`, fontSize: 18 },
      style: { fills: [{ type: "solid", color: "#202020" }] },
    });
  }
  return builder.scene(root.id);
};

export const createSvgStoreScene = (): SceneTree => {
  const builder = new FixtureSceneBuilder();
  const root = createRoot(builder, "fixture-svg-root", 800);
  builder.add(root.id, {
    id: "fixture-svg-logo",
    type: "svg",
    name: "Safe vector logo",
    transform: transform(80, 80, 240, 80, 1),
    props: {
      markup: '<svg viewBox="0 0 120 40"><rect width="120" height="40" rx="8" fill="#111111"/><path d="M20 12h80v16H20z" fill="#FFFFFF"/></svg>',
    },
  });
  return builder.scene(root.id);
};

export const createLegacyStoreScene = (): SceneTree => {
  const builder = new FixtureSceneBuilder();
  const root = createRoot(builder, "fixture-legacy-root", 900);
  builder.add(root.id, {
    id: "fixture-legacy-svg",
    type: "svg",
    name: "Legacy untrusted vector",
    transform: transform(40, 40, 240, 120, 1),
    props: {
      markup: '<svg viewBox="0 0 80 40" onload="alert(1)"><script>alert(1)</script><foreignObject><iframe src="https://evil.test"/></foreignObject><path d="M0 0h80v40H0z" onclick="alert(1)" fill="#111"/></svg>',
    },
    extensions: { legacyNodeVersion: 1 },
  });
  return builder.scene(root.id);
};

export const createProductHeavyStoreScene = (productCount = 200): SceneTree => {
  const builder = new FixtureSceneBuilder();
  const root = createRoot(builder, "fixture-products-root", Math.max(2_000, Math.ceil(productCount / 4) * 310));
  for (let index = 0; index < productCount; index += 1) {
    const productId = `fixture-product-${index}`;
    const card = builder.add(root.id, {
      id: `fixture-card-${index}`,
      type: "container",
      name: `Product card ${index + 1}`,
      transform: transform(32 + (index % 4) * 284, 40 + Math.floor(index / 4) * 300, 260, 276, index),
      style: { fills: [{ type: "solid", color: "#FFFFFF" }], cornerRadius: 8 },
      extensions: { productId, productSlotId: `fixture-slot-${index}` },
    });
    builder.add(card.id, {
      id: `fixture-product-image-${index}`,
      type: "image",
      name: `Product ${index + 1} image`,
      transform: transform(0, 0, 260, 196, 1),
      extensions: {
        productId,
        productSlotId: `fixture-slot-${index}`,
        dynamicBinding: { source: "product", field: "image_url", target: "src", productId },
      },
    });
    builder.add(card.id, {
      id: `fixture-product-name-${index}`,
      type: "text",
      name: `Product ${index + 1} name`,
      transform: transform(12, 210, 236, 24, 2),
      props: { text: "Product", fontSize: 15 },
      extensions: {
        productId,
        productSlotId: `fixture-slot-${index}`,
        dynamicBinding: { source: "product", field: "name", target: "text", productId },
      },
    });
  }
  return builder.scene(root.id);
};

export const STORE_SCENE_FIXTURES = {
  empty: createEmptyStoreScene,
  normal: createNormalStoreScene,
  large: createLargeStoreScene,
  mobileHeavy: createMobileHeavyStoreScene,
  svg: createSvgStoreScene,
  legacy: createLegacyStoreScene,
  productHeavy: createProductHeavyStoreScene,
} as const;
