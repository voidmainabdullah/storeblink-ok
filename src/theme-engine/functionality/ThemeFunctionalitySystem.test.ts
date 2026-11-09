import { describe, expect, it } from "vitest";
import { createSceneNode } from "@/engine/scene-graph";
import type { SceneTree } from "@/types";
import { themeFunctionalitySystem } from "./ThemeFunctionalitySystem";

const fixture = (): SceneTree => {
  const root = createSceneNode({
    id: "root",
    type: "section",
    name: "Page",
    transform: { width: 1200, height: 1200 },
  }, null);
  const section = createSceneNode({
    id: "products",
    type: "section",
    name: "Products",
    transform: { width: 1200, height: 500 },
  }, root.id);
  const first = createSceneNode({
    id: "card-one",
    type: "container",
    name: "First product",
    transform: { x: 20, y: 100, width: 260, height: 320 },
    extensions: { blockType: "product-card", productId: "one" },
  }, section.id);
  const second = createSceneNode({
    id: "card-two",
    type: "container",
    name: "Second product",
    transform: { x: 300, y: 100, width: 260, height: 320 },
    extensions: { blockType: "product-card", productId: "two" },
  }, section.id);
  const search = createSceneNode({
    id: "search",
    type: "button",
    name: "Search",
    props: { label: "Search" },
  }, root.id);
  const custom = createSceneNode({
    id: "custom",
    type: "button",
    name: "External button",
    props: { label: "Partner", href: "https://example.com/shop" },
  }, root.id);
  root.childIds = [search.id, custom.id, section.id];
  section.childIds = [first.id, second.id];
  return {
    rootNodeId: root.id,
    nodes: Object.fromEntries([root, section, first, second, search, custom].map((node) => [node.id, node])),
  };
};

describe("ThemeFunctionalitySystem", () => {
  it("materializes editable carousel and category controls for a canonical product section", () => {
    const scene = themeFunctionalitySystem.ensureScene(fixture());
    const audit = themeFunctionalitySystem.audit(scene);

    expect(audit.carousels).toHaveLength(1);
    expect(audit.carousels[0]).toMatchObject({
      sectionId: "products",
      itemIds: ["card-one", "card-two"],
      previousControlId: expect.any(String),
      nextControlId: expect.any(String),
      categoryControlId: expect.any(String),
    });
    for (const id of [
      audit.carousels[0].previousControlId,
      audit.carousels[0].nextControlId,
      audit.carousels[0].categoryControlId,
    ]) {
      expect(scene.nodes[id as string]).toMatchObject({
        type: "button",
        extensions: { generatedBy: "ThemeFunctionalitySystem" },
      });
    }
  });

  it("normalizes search and custom redirect buttons without duplicating generated controls", () => {
    const first = themeFunctionalitySystem.ensureScene(fixture());
    const second = themeFunctionalitySystem.ensureScene(first);

    expect(second.nodes.search.extensions?.action).toBe("open-search");
    expect(second.nodes.custom.extensions?.navigationTarget).toEqual({
      type: "external",
      value: "https://example.com/shop",
    });
    expect(second.nodes.products.childIds.filter((id) =>
      id.startsWith("theme-function-products-"),
    )).toHaveLength(3);
  });
});
