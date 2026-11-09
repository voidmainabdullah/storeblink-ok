import { describe, expect, it } from "vitest";
import { assertValidSceneTreeStructure } from "@/engine/validation";
import { createProductReferenceChanges } from "@/document/dynamic-sources";
import { responsiveSystem } from "@/layout/responsive";
import { layoutEngine } from "@/layout/engine";
import {
  themeChromeNodeSlot,
  themeChromeSystem,
} from "@/theme-engine/chrome";
import { canTransformNode } from "@/interaction/transform";
import themeManifest from "../manifest";
import {
  buildNoirChronoScene,
  reconcileNoirChronoProducts,
} from "../templates/home";

describe("Noir Chrono theme", () => {
  it("exposes a complete automatically discoverable manifest", () => {
    expect(themeManifest).toMatchObject({
      id: "noir-chrono",
      name: "Noir Chrono",
      previewImage: expect.stringContaining("noir-watch-hero"),
      editor: { catalogOrder: 5, badge: "New" },
    });
    expect(themeManifest.templates.map((template) => template.pageType)).toEqual(
      expect.arrayContaining(["home", "product", "collection", "page"]),
    );
  });

  it("builds the reference storefront as a valid independent-node Scene Graph", () => {
    const scene = buildNoirChronoScene(
      { business_name: "Aevum", store_color: "#F5AAA5" },
      [],
    );

    assertValidSceneTreeStructure(scene);
    expect(scene.nodes["noir-root"].extensions).toMatchObject({
      template: "noir-chrono",
      themeId: "noir-chrono",
      structuredPage: true,
      structuredLayoutPolicy: "authored-responsive",
      responsiveWidths: { desktop: 1440, tablet: 768, mobile: 390 },
    });
    expect(scene.nodes["noir-root"].childIds).toHaveLength(7);
    expect(Object.keys(scene.nodes).length).toBeGreaterThan(90);
    expect(scene.nodes["noir-hero-title"].type).toBe("text");
    expect(scene.nodes["noir-hero-image"].type).toBe("image");
    expect(scene.nodes["noir-footer-arrow"].type).toBe("button");
    expect(scene.nodes["noir-mobile-menu"].childIds).toEqual([
      "noir-mobile-nav-home",
      "noir-mobile-nav-products",
      "noir-mobile-nav-about",
      "noir-mobile-nav-contact",
    ]);
    expect(scene.nodes["noir-menu-trigger"].extensions?.action).toBe(
      "toggle-mobile-menu",
    );
    expect(scene.nodes["noir-product-card-1-add"].extensions?.action).toBe(
      "add-to-cart",
    );
    expect(
      responsiveSystem.resolveNode(scene.nodes["noir-header"], "mobile")
        .transform.zIndex,
    ).toBe(100);
    expect(
      scene.nodes["noir-mobile-menu"].childIds.map(
        (nodeId) =>
          responsiveSystem.resolveNode(scene.nodes[nodeId], "mobile").transform.y,
      ),
    ).toEqual([16, 72, 128, 184]);
  });

  it("ships desktop, tablet, and mobile geometry without sharing widths", () => {
    const scene = buildNoirChronoScene({}, []);
    expect(
      responsiveSystem.resolveNode(scene.nodes["noir-root"], "desktop").transform
        .width,
    ).toBe(1440);
    expect(
      responsiveSystem.resolveNode(scene.nodes["noir-root"], "tablet").transform
        .width,
    ).toBe(768);
    expect(
      responsiveSystem.resolveNode(scene.nodes["noir-root"], "mobile").transform
        .width,
    ).toBe(390);
    const mobileCard = responsiveSystem.resolveNode(
      scene.nodes["noir-product-card-4"],
      "mobile",
    );
    expect(mobileCard.transform.x).toBe(24);
    expect(mobileCard.transform.width).toBe(342);
    expect(mobileCard.transform.y).toBeGreaterThan(
      responsiveSystem.resolveNode(
        scene.nodes["noir-product-card-1"],
        "mobile",
      ).transform.y,
    );
    const runtime = layoutEngine.resolveSceneForViewport(scene, 390).scene;
    expect(runtime.nodes["noir-mobile-nav-products"].transform.y).toBe(72);
    expect(runtime.nodes["noir-hero-title"].transform).toMatchObject(
      responsiveSystem.resolveNode(scene.nodes["noir-hero-title"], "mobile")
        .transform,
    );
  });

  it("repairs legacy structured reflow damage without replacing the scene", () => {
    const scene = buildNoirChronoScene({}, []);
    delete scene.nodes["noir-root"].extensions?.structuredLayoutPolicy;
    const productsLink = scene.nodes["noir-mobile-nav-products"];
    const mobileLink = responsiveSystem.resolveNode(productsLink, "mobile");
    productsLink.layout = responsiveSystem.updateLayout(productsLink, "mobile", {
      transform: { ...mobileLink.transform, y: 18 },
    });
    const header = scene.nodes["noir-header"];
    const mobileHeader = responsiveSystem.resolveNode(header, "mobile");
    header.layout = responsiveSystem.updateLayout(header, "mobile", {
      transform: { ...mobileHeader.transform, zIndex: 10 },
    });

    const repaired = reconcileNoirChronoProducts(scene, {}, []);

    expect(repaired.nodes["noir-root"].extensions?.structuredLayoutPolicy).toBe(
      "authored-responsive",
    );
    expect(
      responsiveSystem.resolveNode(
        repaired.nodes["noir-mobile-nav-products"],
        "mobile",
      ).transform.y,
    ).toBe(72);
    expect(
      responsiveSystem.resolveNode(repaired.nodes["noir-header"], "mobile")
        .transform.zIndex,
    ).toBe(100);
  });

  it("uses the shared Theme Chrome contract without theme-specific editor code", () => {
    const scene = buildNoirChronoScene({}, []);
    const settings = themeChromeSystem.getSettings(scene);
    const slots = Object.values(scene.nodes).map(themeChromeNodeSlot);

    expect(slots).toEqual(
      expect.arrayContaining([
        "account",
        "cart",
        "search",
        "nav-link",
        "mobile-menu-trigger",
        "mobile-menu",
        "logo",
        "logo-fallback",
      ]),
    );
    expect(settings.icons.cart.color).toBe("#F7F7F5");
    expect(
      Object.values(settings.navigationIcons).every((icon) => icon === null),
    ).toBe(true);
    const logo = Object.values(scene.nodes).find(
      (node) => themeChromeNodeSlot(node) === "logo",
    );
    expect(canTransformNode(scene.nodes["noir-hero-title"])).toBe(true);
    expect(canTransformNode(logo)).toBe(true);
  });

  it("binds live product data and preserves an explicit product relink", () => {
    const products = [
      {
        id: "watch-one",
        name: "Vector One",
        image_url: "https://example.com/one.webp",
        price_cents: 25500,
      },
      {
        id: "watch-two",
        name: "Vector Two",
        image_url: "https://example.com/two.webp",
        price_cents: 32000,
      },
    ];
    const scene = buildNoirChronoScene({}, products);
    const image = scene.nodes["noir-product-card-1-image"];
    const title = scene.nodes["noir-product-card-1-title"];

    expect(image.extensions?.dynamicBinding).toMatchObject({
      source: "product",
      field: "image_url",
      target: "src",
      productId: "watch-one",
    });
    expect(title.extensions?.dynamicBinding).toMatchObject({
      source: "product",
      field: "name",
      productId: "watch-one",
    });

    createProductReferenceChanges(
      scene,
      "noir-product-card-1",
      "watch-two",
    ).forEach((change) => {
      scene.nodes[change.nodeId].extensions = change.after;
    });
    const card = scene.nodes["noir-product-card-1"];
    const imageNode = scene.nodes["noir-product-card-1-image"];
    card.transform = {
      ...card.transform,
      x: 103,
      y: 287,
      width: 319,
      height: 451,
      rotation: 5,
    };
    card.layout = responsiveSystem.updateLayout(card, "mobile", {
      transform: {
        ...responsiveSystem.resolveNode(card, "mobile").transform,
        x: 33,
        y: 177,
        width: 324,
        height: 472,
      },
      manualTransform: true,
    });
    imageNode.transform = {
      ...imageNode.transform,
      x: 14,
      y: 12,
      width: 291,
      height: 302,
    };
    imageNode.layout = responsiveSystem.updateLayout(imageNode, "tablet", {
      transform: {
        ...responsiveSystem.resolveNode(imageNode, "tablet").transform,
        x: 12,
        y: 15,
        width: 267,
        height: 249,
      },
      manualTransform: true,
    });
    const presentationIds = [card.id, ...card.childIds];
    const presentation = Object.fromEntries(
      presentationIds.map((id) => [id, {
        transform: structuredClone(scene.nodes[id].transform),
        layout: structuredClone(scene.nodes[id].layout),
      }]),
    );
    const reconciled = reconcileNoirChronoProducts(scene, {}, [
      ...products,
      { id: "watch-three", name: "Vector Three" },
    ]);
    expect(reconciled.nodes["noir-product-card-1"].extensions?.productId).toBe(
      "watch-two",
    );
    expect(
      (
        reconciled.nodes["noir-product-card-1-image"].extensions
          ?.dynamicBinding as Record<string, unknown>
      ).productId,
    ).toBe("watch-two");
    presentationIds.forEach((id) => {
      expect(reconciled.nodes[id].transform, `${id} desktop transform`).toEqual(presentation[id].transform);
      expect(reconciled.nodes[id].layout, `${id} responsive layout`).toEqual(presentation[id].layout);
    });
  });
});
