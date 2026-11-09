import { describe, expect, it } from "vitest";
import { createProductReferenceChanges } from "@/document/dynamic-sources";
import { assertValidSceneTreeStructure } from "@/engine/validation";
import { sectionRegistry } from "@/document/sections";
import { responsiveSystem } from "@/layout/responsive";
import { atelierThemeManifest } from "../manifest";
import {
  atelierDefaultSectionOrder,
  buildAtelierTemplateScene,
  reconcileAtelierProducts,
} from "../templates/home";

describe("Atelier theme", () => {
  it("publishes a valid manifest and all nine canonical homepage sections", () => {
    expect(atelierThemeManifest.id).toBe("atelier");
    expect(atelierThemeManifest.capabilities.productHotspots).toBe(true);
    expect(atelierDefaultSectionOrder).toHaveLength(9);
    expect(atelierThemeManifest.templates[0].requiredSectionTypes).toEqual([
      "site-header",
      "site-footer",
    ]);
  });

  it("builds an independently editable, responsive Scene Graph", () => {
    const scene = buildAtelierTemplateScene(
      { business_name: "North Objects" },
      [{ id: "chair-1", name: "DO NOT PERSIST", image_url: "https://example.com/chair.jpg", price_cents: 210000 }],
    );

    assertValidSceneTreeStructure(scene);
    expect(scene.nodes["atelier-root"].extensions).toMatchObject({
      themeId: "atelier",
      template: "atelier",
      structuredPage: true,
    });
    expect(scene.nodes["atelier-root"].childIds.map(
      (id) => scene.nodes[id].extensions?.canonicalSectionType,
    )).toEqual(atelierDefaultSectionOrder);
    expect(sectionRegistry.validateScene(scene).issues).toEqual([]);
    expect(scene.nodes["atelier-product-card-chair-1-image"].extensions?.dynamicBinding).toMatchObject({
      source: "product",
      field: "image_url",
      productId: "chair-1",
    });
    expect(JSON.stringify(scene)).not.toContain("DO NOT PERSIST");
    expect(JSON.stringify(scene)).not.toContain("https://example.com/chair.jpg");
  });

  it("ships real tablet and mobile geometry", () => {
    const scene = buildAtelierTemplateScene();
    const mobileRoot = responsiveSystem.resolveNode(scene.nodes["atelier-root"], "mobile");
    const mobileHero = responsiveSystem.resolveNode(scene.nodes["atelier-hero-image"], "mobile");
    const mobileMenu = responsiveSystem.resolveNode(scene.nodes["atelier-menu"], "mobile");
    const tabletMenu = responsiveSystem.resolveNode(scene.nodes["atelier-menu"], "tablet");
    const desktopMenu = responsiveSystem.resolveNode(scene.nodes["atelier-menu"], "desktop");
    const mobileHeading = responsiveSystem.resolveNode(
      scene.nodes["atelier-intro-heading"],
      "mobile",
    );
    const mobileHeader = responsiveSystem.resolveNode(scene.nodes["atelier-header"], "mobile");
    const mobileIntro = responsiveSystem.resolveNode(scene.nodes["atelier-intro"], "mobile");
    const mobileDesktopNav = responsiveSystem.resolveNode(
      scene.nodes["atelier-nav-home"],
      "mobile",
    );

    expect(mobileRoot.transform).toMatchObject({ width: 390, height: 6818 });
    expect(mobileHero.transform.width).toBe(362);
    expect(mobileMenu.transform.width).toBe(38);
    expect(mobileMenu.type).toBe("svg");
    expect(mobileMenu.extensions?.action).toBe("toggle-mobile-menu");
    expect(mobileMenu.meta.hidden).toBe(false);
    expect(tabletMenu.meta.hidden).toBe(false);
    expect(desktopMenu.transform.width).toBe(1);
    expect(desktopMenu.meta.hidden).toBe(true);
    expect(mobileDesktopNav.meta.hidden).toBe(true);
    expect(mobileHeading.props.fontSize).toBe(48);
    expect(mobileHeader.transform.zIndex).toBeGreaterThan(mobileIntro.transform.zIndex);
    expect(scene.nodes["atelier-logo"].props.whiteSpace).toBe("nowrap");
    expect(
      responsiveSystem.resolveNode(scene.nodes["atelier-announcement-two"], "mobile").meta.hidden,
    ).toBe(true);
  });

  it.each([320, 375, 390, 430, 639, 640, 768, 820, 1024, 1200, 1440])(
    "fits the storefront root and navigation at %ipx",
    (width) => {
      const scene = buildAtelierTemplateScene();
      const breakpoint = responsiveSystem.breakpointForWidth(width);
      const root = responsiveSystem.resolveNodeForWidth(
        scene.nodes["atelier-root"],
        width,
        breakpoint,
      );
      const menu = responsiveSystem.resolveNodeForWidth(
        scene.nodes["atelier-menu"],
        width,
        breakpoint,
      );
      const expectedWidth = breakpoint === "desktop" ? Math.min(1200, width) : width;

      expect(root.transform.width).toBeCloseTo(expectedWidth);
      expect(root.transform.x).toBe(0);
      expect(menu.transform.x + menu.transform.width).toBeLessThanOrEqual(expectedWidth);
      expect(menu.meta.hidden).toBe(breakpoint === "desktop");
    },
  );

  it("reconciles live catalog identity while preserving edited card presentation", () => {
    const source = buildAtelierTemplateScene({}, [{ id: "one" }]);
    const card = source.nodes["atelier-product-card-one"];
    const image = source.nodes["atelier-product-card-one-image"];
    card.name = "Merchant featured card";
    card.style.cornerRadius = 16;
    card.transform = {
      ...card.transform,
      x: 87,
      y: 436,
      width: 304,
      height: 478,
      rotation: -3,
    };
    card.layout = responsiveSystem.updateLayout(card, "mobile", {
      transform: {
        ...responsiveSystem.resolveNode(card, "mobile").transform,
        x: 27,
        y: 219,
        width: 336,
        height: 501,
      },
      manualTransform: true,
    });
    image.transform = {
      ...image.transform,
      x: 13,
      y: 17,
      width: 278,
      height: 319,
    };
    image.layout = responsiveSystem.updateLayout(image, "tablet", {
      transform: {
        ...responsiveSystem.resolveNode(image, "tablet").transform,
        x: 11,
        y: 19,
        width: 263,
        height: 241,
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

    const next = reconcileAtelierProducts(source, {}, [{ id: "one" }, { id: "two" }]);

    expect(next.nodes["atelier-product-card-one"].name).toBe("Merchant featured card");
    expect(next.nodes["atelier-product-card-one"].style.cornerRadius).toBe(16);
    presentationIds.forEach((id) => {
      expect(next.nodes[id].transform, `${id} desktop transform`).toEqual(presentation[id].transform);
      expect(next.nodes[id].layout, `${id} responsive layout`).toEqual(presentation[id].layout);
    });
    expect(next.nodes["atelier-product-card-two"]).toBeDefined();
    expect(next.nodes["atelier-products"].childIds).toContain("atelier-product-card-two");
  });

  it("preserves merchant product links when the storefront hydrates", () => {
    const products = [{ id: "one" }, { id: "two" }];
    const source = buildAtelierTemplateScene({}, products);
    createProductReferenceChanges(source, "atelier-product-card-one", "two").forEach((change) => {
      source.nodes[change.nodeId].extensions = change.after;
    });

    const next = reconcileAtelierProducts(source, {}, products);

    expect(next.nodes["atelier-product-card-one"].extensions).toMatchObject({
      productId: "two",
      productSlotId: "atelier-product-card-one",
    });
    expect(next.nodes["atelier-product-card-one-title"].extensions?.dynamicBinding).toMatchObject({
      productId: "two",
    });
    expect(next.nodes["atelier-product-card-one-action"].extensions).toMatchObject({
      productId: "two",
    });
  });

  it("replaces the empty state when the first live product is published", () => {
    const source = buildAtelierTemplateScene();
    const next = reconcileAtelierProducts(source, {}, [{ id: "first-live" }]);

    assertValidSceneTreeStructure(next);
    expect(next.nodes["atelier-products-empty"]).toBeUndefined();
    expect(next.nodes["atelier-products-empty-bg"]).toBeUndefined();
    expect(next.nodes["atelier-product-card-first-live"]).toBeDefined();
  });
});
