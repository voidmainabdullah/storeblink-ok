import { describe, expect, it } from "vitest";
import { buildBasicTemplateScene } from "@/editor/engine/basicTemplate";
import { navigationSystem } from "./NavigationSystem";

describe("NavigationSystem", () => {
  it("migrates one ordered navigation document from repeated theme nodes", () => {
    const scene = buildBasicTemplateScene({ business_name: "Store" }, []);
    const ensured = navigationSystem.ensureScene(scene);
    const document = navigationSystem.getDocument(ensured);

    expect(document.items.map((item) => item.id)).toEqual([
      "home",
      "products",
      "about",
      "contact",
    ]);
    expect(ensured.nodes[ensured.rootNodeId!].extensions?.navigation).toEqual(document);
  });

  it("synchronizes a changed navigation node through every existing surface", () => {
    const scene = navigationSystem.ensureScene(
      buildBasicTemplateScene({ business_name: "Store" }, []),
    );
    scene.nodes["basic-nav-products"].props.label = "Shop";
    const next = navigationSystem.synchronizeNode(scene, "basic-nav-products");
    const productNodes = Object.values(next.nodes).filter(
      (node) => node.extensions?.navigationKey === "products",
    );

    expect(navigationSystem.getDocument(next).items.find((item) => item.id === "products")?.label)
      .toBe("Shop");
    expect(productNodes).toHaveLength(3);
    expect(productNodes.every((node) => node.props.label === "Shop")).toBe(true);
  });

  it("materializes an added item into desktop, mobile, and footer surfaces", () => {
    const scene = navigationSystem.ensureScene(
      buildBasicTemplateScene({ business_name: "Store" }, []),
    );
    const document = navigationSystem.getDocument(scene);
    document.items.push({
      id: "shipping",
      label: "Shipping",
      target: { type: "external", value: "https://example.com/shipping" },
      parentId: null,
      sortOrder: document.items.length,
      openInNewTab: true,
      isVisible: true,
      visibility: { desktop: true, tablet: true, mobile: true },
    });
    const next = navigationSystem.applyDocument(scene, document);

    expect(
      Object.values(next.nodes).filter(
        (node) => node.extensions?.navigationKey === "shipping",
      ),
    ).toHaveLength(3);
  });

  it("marks missing section anchors as broken without throwing", () => {
    const scene = navigationSystem.ensureScene(
      buildBasicTemplateScene({ business_name: "Store" }, []),
    );
    const document = navigationSystem.getDocument(scene);
    document.items.push({
      id: "missing-section",
      label: "Missing",
      target: { type: "section", sectionId: "deleted-section" },
      parentId: null,
      sortOrder: 99,
      openInNewTab: false,
      isVisible: true,
      visibility: { desktop: true, tablet: true, mobile: true },
    });
    const next = navigationSystem.applyDocument(scene, document);

    expect(navigationSystem.resolve(next, { storeSlug: "demo" }).at(-1)?.link)
      .toMatchObject({ broken: true, hidden: true, href: null });
  });

  it("rejects unsafe or incomplete targets before scene mutation", () => {
    expect(
      navigationSystem.validateTarget({
        type: "external",
        value: "javascript:alert(1)",
      }),
    ).toMatchObject({ valid: false });
    expect(
      navigationSystem.validateTarget({ type: "product", entityId: "" }),
    ).toMatchObject({ valid: false });
    expect(
      navigationSystem.validateTarget({
        type: "route",
        routeKey: "products",
      }),
    ).toEqual({
      valid: true,
      target: { type: "route", routeKey: "products" },
    });
  });

  it("materializes child items on every surface and removes their subtree", () => {
    const scene = navigationSystem.ensureScene(
      buildBasicTemplateScene({ business_name: "Store" }, []),
    );
    const document = navigationSystem.getDocument(scene);
    document.items.push({
      id: "home-child",
      label: "Home details",
      target: { type: "route", routeKey: "about" },
      parentId: "home",
      sortOrder: document.items.length,
      openInNewTab: false,
      isVisible: true,
      visibility: { desktop: true, tablet: true, mobile: true },
    });
    const withChild = navigationSystem.applyDocument(scene, document);

    expect(
      Object.values(withChild.nodes).filter(
        (node) => node.extensions?.navigationKey === "home-child",
      ),
    ).toHaveLength(3);

    const withoutParent = navigationSystem.removeItem(withChild, "home");
    expect(
      navigationSystem.getDocument(withoutParent).items.some(
        (item) => item.id === "home" || item.id === "home-child",
      ),
    ).toBe(false);
  });
});
