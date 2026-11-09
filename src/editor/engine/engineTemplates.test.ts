import { describe, expect, it } from "vitest";
import { assertValidSceneTreeStructure } from "@/engine/validation";
import { sectionRegistry } from "@/document/sections";
import { createProductReferenceChanges } from "@/document/dynamic-sources";
import { responsiveSystem } from "@/layout/responsive";
import { themeFunctionalitySystem } from "@/theme-engine/functionality";
import {
  ENGINE_SCENE_TEMPLATES,
  buildBasicCustomPageScene,
  buildBasicTemplateScene,
  buildEngineTemplateScene,
  getEngineSceneTemplateId,
  loadEngineTemplateScene,
  preloadEngineTemplatePackages,
  reconcileBasicTemplateProducts,
  reconcileEngineTemplateScene,
} from "./engineTemplates";

describe("Engine scene templates", () => {
  const relinkProduct = (scene: ReturnType<typeof buildBasicTemplateScene>, nodeId: string, productId: string) => {
    createProductReferenceChanges(scene, nodeId, productId).forEach((change) => {
      scene.nodes[change.nodeId].extensions = change.after;
    });
  };

  it("does not expose the removed Threadtemplate package", () => {
    expect(ENGINE_SCENE_TEMPLATES.map((template) => template.id)).not.toContain("threadtemplate");
  });

  it("registers the structured Basic Store template", () => {
    expect(ENGINE_SCENE_TEMPLATES).toContainEqual(
      expect.objectContaining({
        id: "basic",
        name: "Basic Store",
      }),
    );
  });

  it("discovers Atelier through the universal theme manifest registry", () => {
    expect(ENGINE_SCENE_TEMPLATES).toContainEqual(
      expect.objectContaining({
        id: "atelier",
        name: "Atelier",
        previewImage: expect.stringContaining("atelier-hero"),
        badge: "New",
      }),
    );
    expect(ENGINE_SCENE_TEMPLATES[0]?.id).toBe("noir-chrono");
  });

  it("discovers and loads Noir Chrono without manual editor registration", async () => {
    expect(ENGINE_SCENE_TEMPLATES).toContainEqual(
      expect.objectContaining({
        id: "noir-chrono",
        name: "Noir Chrono",
        previewImage: expect.stringContaining("noir-watch-hero"),
        badge: "New",
      }),
    );
    const scene = await loadEngineTemplateScene(
      "noir-chrono",
      { business_name: "Aevum" },
      [{ id: "watch-one", name: "Vector One" }],
    );
    expect(getEngineSceneTemplateId(scene)).toBe("noir-chrono");
    expect(scene.nodes["noir-product-card-1"].extensions?.productId).toBe(
      "watch-one",
    );
  });

  it("loads visible templates through their registered theme packages", async () => {
    await preloadEngineTemplatePackages();
    const scene = await loadEngineTemplateScene(
      "atelier",
      { business_name: "North Store" },
      [],
    );

    expect(getEngineSceneTemplateId(scene)).toBe("atelier");
    expect(scene.nodes[scene.rootNodeId!].name).toBe("Atelier storefront");
  }, 15_000);

  it("applies shared commerce functionality to every discovered theme", async () => {
    await preloadEngineTemplatePackages();
    for (const template of ENGINE_SCENE_TEMPLATES) {
      const scene = await loadEngineTemplateScene(template.id, {}, [
        { id: "one", name: "One", category: "Classic" },
        { id: "two", name: "Two", category: "Modern" },
        { id: "three", name: "Three", category: "Sport" },
      ]);
      const audit = themeFunctionalitySystem.audit(scene);
      expect(audit.settings).toMatchObject({
        productCarousel: { enabled: true },
        search: { enabled: true, predictive: true },
        categories: { enabled: true, showDropdown: true },
      });
      expect(audit.carousels.length, `${template.id} product carousel`).toBeGreaterThan(0);
      audit.carousels.forEach((carousel) => {
        expect(carousel.previousControlId, `${template.id} previous control`).toBeTruthy();
        expect(carousel.nextControlId, `${template.id} next control`).toBeTruthy();
        expect(carousel.categoryControlId, `${template.id} category control`).toBeTruthy();
      });
      expect(Object.values(scene.nodes).some((node) =>
        node.extensions?.action === "open-search",
      ), `${template.id} advanced search trigger`).toBe(true);
    }
  }, 30_000);

  it("reconciles persisted scenes through the active theme package", async () => {
    const source = await loadEngineTemplateScene("atelier", {}, []);
    const scene = await reconcileEngineTemplateScene(source, {}, [
      { id: "live-product", name: "Live product" },
    ]);

    expect(scene.nodes["atelier-product-card-live-product"]).toBeDefined();
  });

  it("builds Basic Store as a valid Page -> Section -> Block document", () => {
    const scene = buildBasicTemplateScene({ business_name: "North Store", store_color: "#146c43" }, []);

    assertValidSceneTreeStructure(scene);
    expect(scene.nodes["basic-root"].extensions).toMatchObject({
      template: "basic",
      structuredPage: true,
    });
    expect(scene.nodes["basic-root"].childIds.map((id) => scene.nodes[id].extensions?.sectionType)).toEqual([
      "header",
      "hero",
      "product-grid",
      "rich-text",
      "footer",
    ]);
    expect(sectionRegistry.validateScene(scene)).toMatchObject({ valid: true });
  });

  it("ships real mobile geometry and hamburger visibility", () => {
    const scene = buildEngineTemplateScene("basic", {}, []);
    const mobileRoot = responsiveSystem.resolveNode(scene.nodes["basic-root"], "mobile");
    const mobileMenuButton = responsiveSystem.resolveNode(scene.nodes["basic-menu-icon"], "mobile");
    const mobileDesktopLink = responsiveSystem.resolveNode(scene.nodes["basic-nav-products"], "mobile");

    expect(mobileRoot.transform).toMatchObject({ width: 390 });
    expect(mobileMenuButton.meta.hidden).toBe(false);
    expect(mobileDesktopLink.meta.hidden).toBe(true);
    const mobileImage = responsiveSystem.resolveNode(scene.nodes["basic-hero-image"], "mobile");
    const mobileCta = responsiveSystem.resolveNode(scene.nodes["basic-hero-cta"], "mobile");
    expect(mobileImage.transform.x).toBe(24);
    expect(mobileImage.transform.y).toBeGreaterThan(mobileCta.transform.y + mobileCta.transform.height);
  });

  it("persists product IDs and dynamic bindings without copying catalog payloads", () => {
    const scene = buildBasicTemplateScene(
      {},
      [{
        id: "prod-live-1",
        name: "DO NOT COPY THIS PRODUCT NAME",
        category: "Live category",
        description: "Live description",
        image_url: "https://example.com/live.jpg",
        price_cents: 12900,
      }],
    );
    const serialized = JSON.stringify(scene);

    expect(serialized).not.toContain("DO NOT COPY THIS PRODUCT NAME");
    expect(serialized).not.toContain("Live description");
    expect(scene.nodes["basic-product-card-prod-live-1"].extensions).toMatchObject({ productId: "prod-live-1" });
    expect(scene.nodes["basic-product-card-prod-live-1-title"].extensions).toMatchObject({
      dynamicBinding: {
        source: "product",
        field: "name",
        productId: "prod-live-1",
      },
    });
  });

  it("reconciles an existing Basic product grid with the current live catalog", () => {
    const emptyScene = buildBasicTemplateScene({}, []);
    const scene = reconcileBasicTemplateProducts(emptyScene, {}, [
      { id: "one", name: "First product", image_url: "https://example.com/one.jpg" },
      { id: "two", name: "Second product", image_url: "https://example.com/two.jpg" },
    ]);

    expect(scene.nodes["basic-products-empty"]).toBeUndefined();
    expect(scene.nodes["basic-product-card-one-image"].extensions?.dynamicBinding).toMatchObject({
      productId: "one",
      field: "image_url",
    });
    expect(scene.nodes["basic-product-card-two-image"].extensions?.dynamicBinding).toMatchObject({
      productId: "two",
      field: "image_url",
    });
    expect(JSON.stringify(scene)).not.toContain("https://example.com/one.jpg");
    expect(JSON.stringify(scene)).not.toContain("https://example.com/two.jpg");
  });

  it("preserves edited product-card nodes when the live catalog identity is unchanged", () => {
    const source = buildBasicTemplateScene({}, [{ id: "one", name: "First product" }]);
    source.nodes["basic-product-card-one"].style.cornerRadius = 24;
    source.nodes["basic-product-card-one"].name = "Featured card";

    const reconciled = reconcileBasicTemplateProducts(source, {}, [
      { id: "one", name: "Renamed in catalog", image_url: "https://example.com/renamed.jpg" },
    ]);

    expect(reconciled.nodes["basic-product-card-one"].style.cornerRadius).toBe(24);
    expect(reconciled.nodes["basic-product-card-one"].name).toBe("Featured card");
  });

  it("preserves exact Basic card and child geometry when the catalog grows", () => {
    const source = buildBasicTemplateScene({}, [{ id: "one", name: "First product" }]);
    const card = source.nodes["basic-product-card-one"];
    const title = source.nodes["basic-product-card-one-title"];
    const desktopCardTransform = {
      ...card.transform,
      x: 91,
      y: 381,
      width: 271,
      height: 433,
      rotation: 6,
    };
    card.transform = desktopCardTransform;
    card.layout = responsiveSystem.updateLayout(card, "desktop", {
      transform: desktopCardTransform,
      manualTransform: true,
    });
    card.layout = responsiveSystem.updateLayout(card, "mobile", {
      transform: {
        ...responsiveSystem.resolveNode(card, "mobile").transform,
        x: 29,
        y: 199,
        width: 331,
        height: 469,
      },
      manualTransform: true,
    });
    const desktopTitleTransform = {
      ...title.transform,
      x: 17,
      y: 318,
      width: 203,
      height: 47,
    };
    title.transform = desktopTitleTransform;
    title.layout = responsiveSystem.updateLayout(title, "desktop", {
      transform: desktopTitleTransform,
      manualTransform: true,
    });
    title.layout = responsiveSystem.updateLayout(title, "tablet", {
      transform: {
        ...responsiveSystem.resolveNode(title, "tablet").transform,
        x: 15,
        y: 207,
        width: 181,
        height: 43,
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

    const reconciled = reconcileBasicTemplateProducts(source, {}, [
      { id: "one", name: "First product" },
      { id: "two", name: "Second product" },
    ]);

    presentationIds.forEach((id) => {
      expect(reconciled.nodes[id].transform, `${id} desktop transform`).toEqual(presentation[id].transform);
      expect(reconciled.nodes[id].layout, `${id} responsive layout`).toEqual(presentation[id].layout);
    });
    expect(reconciled.nodes["basic-product-card-two"]).toBeDefined();
  });

  it("preserves a linked Basic product through catalog reconciliation", () => {
    const products = [{ id: "one" }, { id: "two" }];
    const source = buildBasicTemplateScene({}, products);
    relinkProduct(source, "basic-product-card-one", "two");

    const reconciled = reconcileBasicTemplateProducts(source, {}, products);

    expect(reconciled.nodes["basic-product-card-one"].extensions).toMatchObject({
      productId: "two",
      productSlotId: "basic-product-card-one",
    });
    expect(reconciled.nodes["basic-product-card-one-title"].extensions?.dynamicBinding).toMatchObject({
      productId: "two",
    });
    expect(reconciled.nodes["basic-product-card-one-cta"].extensions).toMatchObject({
      productId: "two",
    });
  });

  it("keeps global navigation, account, and cart on a custom Basic page", () => {
    const scene = buildBasicCustomPageScene(
      { business_name: "North Store" },
      "Lookbook",
      "lookbook",
    );

    expect(scene.nodes["basic-root"].extensions).toMatchObject({
      pageKind: "custom",
      pageSlug: "lookbook",
    });
    expect(scene.nodes["basic-header"]).toBeDefined();
    expect(scene.nodes["basic-account-icon"].extensions).toMatchObject({ action: "open-account" });
    expect(scene.nodes["basic-cart-icon"].extensions).toMatchObject({ action: "open-cart" });
    expect(scene.nodes["basic-story-heading"].props.text).toBe("Lookbook");
    expect(scene.nodes["basic-footer"]).toBeDefined();
  });

});
