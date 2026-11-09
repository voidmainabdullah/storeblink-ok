import { describe, expect, it } from "vitest";
import { assertValidSceneTreeStructure } from "@/engine/validation";
import { sectionRegistry } from "@/document/sections";
import { responsiveSystem } from "@/layout/responsive";
import { themeFunctionalitySystem } from "@/theme-engine/functionality";
import { sparkFashionThemeManifest } from "../manifest";
import {
  buildSparkFashionTemplateScene,
  reconcileSparkFashionProducts,
  sparkFashionDefaultSectionOrder,
} from "../templates/home";

const product = {
  id: "look-one",
  name: "Merchant-only title",
  image_url: "https://example.com/merchant-only.webp",
  price_cents: 14900,
};

describe("Spark Fashion theme", () => {
  it("publishes a valid manifest and the complete homepage structure", () => {
    expect(sparkFashionThemeManifest.id).toBe("spark-fashion");
    expect(sparkFashionThemeManifest.templates[0].requiredSectionTypes).toEqual([
      "site-header",
      "site-footer",
    ]);
    expect(sparkFashionDefaultSectionOrder).toHaveLength(9);
  });

  it("builds independent responsive nodes without persisting catalog payloads", () => {
    const scene = buildSparkFashionTemplateScene(
      { business_name: "Mode House" },
      [product],
    );

    assertValidSceneTreeStructure(scene);
    expect(scene.nodes["spark-root"].extensions).toMatchObject({
      themeId: "spark-fashion",
      template: "spark-fashion",
      structuredPage: true,
    });
    expect(scene.nodes["spark-root"].childIds.map(
      (id) => scene.nodes[id].extensions?.canonicalSectionType,
    )).toEqual(sparkFashionDefaultSectionOrder);
    expect(sectionRegistry.validateScene(scene).issues).toEqual([]);
    expect(scene.nodes["spark-product-card-look-one-image"].extensions?.dynamicBinding).toMatchObject({
      source: "product",
      field: "image_url",
      productId: "look-one",
    });
    expect(JSON.stringify(scene)).not.toContain(product.name);
    expect(JSON.stringify(scene)).not.toContain(product.image_url);
  });

  it.each([320, 375, 390, 430, 640, 768, 1024, 1200, 1440])(
    "fits the root and mobile navigation at %ipx",
    (width) => {
      const scene = buildSparkFashionTemplateScene({}, [product]);
      const breakpoint = responsiveSystem.breakpointForWidth(width);
      const root = responsiveSystem.resolveNodeForWidth(scene.nodes["spark-root"], width, breakpoint);
      const menu = responsiveSystem.resolveNodeForWidth(scene.nodes["spark-menu"], width, breakpoint);
      const expectedWidth = breakpoint === "desktop" ? Math.min(1200, width) : width;

      expect(root.transform.width).toBeCloseTo(expectedWidth);
      expect(root.transform.x).toBe(0);
      expect(menu.transform.x + menu.transform.width).toBeLessThanOrEqual(expectedWidth);
      expect(menu.meta.hidden).toBe(breakpoint === "desktop");
    },
  );

  it("connects every button to a route or runtime action", () => {
    const scene = themeFunctionalitySystem.ensureScene(
      buildSparkFashionTemplateScene({}, [product, { ...product, id: "look-two" }]),
    );
    const audit = themeFunctionalitySystem.audit(scene);

    expect(audit.inactiveButtons).toEqual([]);
    expect(audit.carousels).toContainEqual(expect.objectContaining({
      sectionId: "spark-products",
      itemIds: ["spark-product-card-look-one", "spark-product-card-look-two"],
    }));
  });

  it("reconciles the live catalog while preserving merchant presentation edits", () => {
    const source = buildSparkFashionTemplateScene({}, [product]);
    const card = source.nodes["spark-product-card-look-one"];
    const title = source.nodes["spark-product-card-look-one-title"];
    card.name = "Featured by merchant";
    card.style.cornerRadius = 22;
    card.transform = {
      ...card.transform,
      x: 73,
      y: 418,
      width: 286,
      height: 462,
      rotation: 4,
    };
    card.layout = responsiveSystem.updateLayout(card, "mobile", {
      transform: {
        ...responsiveSystem.resolveNode(card, "mobile").transform,
        x: 31,
        y: 207,
        width: 328,
        height: 488,
      },
      manualTransform: true,
    });
    title.transform = {
      ...title.transform,
      x: 19,
      y: 337,
      width: 211,
      height: 49,
    };
    title.layout = responsiveSystem.updateLayout(title, "tablet", {
      transform: {
        ...responsiveSystem.resolveNode(title, "tablet").transform,
        x: 23,
        y: 211,
        width: 194,
        height: 52,
      },
      manualTransform: true,
    });
    const presentationIds = [card.id, ...card.childIds];
    const presentation = Object.fromEntries(
      presentationIds.map((id) => [id, {
        transform: structuredClone(source.nodes[id].transform),
        layout: structuredClone(source.nodes[id].layout),
      }]),
    );

    const next = reconcileSparkFashionProducts(source, {}, [
      product,
      { ...product, id: "look-two" },
    ]);

    assertValidSceneTreeStructure(next);
    expect(next.nodes["spark-product-card-look-one"].name).toBe("Featured by merchant");
    expect(next.nodes["spark-product-card-look-one"].style.cornerRadius).toBe(22);
    presentationIds.forEach((id) => {
      expect(next.nodes[id].transform, `${id} desktop transform`).toEqual(presentation[id].transform);
      expect(next.nodes[id].layout, `${id} responsive layout`).toEqual(presentation[id].layout);
    });
    expect(next.nodes["spark-product-card-look-two"]).toBeDefined();
    expect(next.nodes["spark-products-empty-title"]).toBeUndefined();
  });
});
