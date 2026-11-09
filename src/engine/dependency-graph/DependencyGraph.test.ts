import { describe, expect, it } from "vitest";
import { createSceneNode } from "@/engine/scene-graph";
import { createDependencyGraph } from "./index";

describe("DependencyGraph", () => {
  it("indexes scene asset, product, collection, component, and template dependencies", () => {
    const graph = createDependencyGraph();
    const root = createSceneNode({
      id: "root",
      type: "section",
      name: "Root",
      extensions: {
        template: "basic",
        themeChrome: { version: 1 },
        navigation: {
          version: 1,
          items: [
            {
              id: "journal-link",
              target: { type: "page", entityId: "journal" },
            },
          ],
        },
      },
    }, null);
    const image = createSceneNode({
      id: "image",
      type: "image",
      name: "Image",
      props: { assetId: "asset-1" },
      extensions: { productId: "product-1", collectionId: "collection-1" },
      meta: { componentId: "component-1" },
    }, root.id);
    root.childIds.push(image.id);

    graph.rebuildScene({ rootNodeId: root.id, nodes: { root, image } });

    expect(graph.getDependencies({ kind: "node", id: image.id }).map((edge) => edge.relation).sort()).toEqual([
      "binds-collection",
      "binds-product",
      "uses-asset",
    ]);
    expect(graph.getDependents({ kind: "product", id: "product-1" })[0]?.source.id).toBe("image");
    expect(graph.getDependencies({ kind: "component-instance", id: image.id })[0]?.target.id).toBe("component-1");
    expect(graph.getDependencies({ kind: "node", id: root.id })[0]?.target).toEqual({ kind: "template", id: "basic" });
    expect(
      graph.getDependencies({ kind: "navigation", id: "root:primary" })[0],
    ).toMatchObject({
      target: { kind: "page", id: "journal" },
      relation: "links-page",
    });
    expect(graph.getDependencies({ kind: "template", id: "basic" })[0]).toMatchObject({
      target: { kind: "shared-chrome", id: "root:theme-chrome" },
      relation: "uses-shared-chrome",
    });
  });

  it("returns transitive impact without looping over cycles", () => {
    const graph = createDependencyGraph();
    graph.link({ source: { kind: "node", id: "card" }, target: { kind: "product", id: "p1" }, relation: "binds-product" });
    graph.link({ source: { kind: "page", id: "home" }, target: { kind: "node", id: "card" }, relation: "custom:contains" });
    graph.link({ source: { kind: "node", id: "card" }, target: { kind: "page", id: "home" }, relation: "custom:cycle" });

    const impact = graph.getImpact({ kind: "product", id: "p1" });
    expect(impact.directDependents[0]?.source).toEqual({ kind: "node", id: "card" });
    expect(impact.transitiveDependents).toEqual([
      { kind: "node", id: "card" },
      { kind: "page", id: "home" },
    ]);
  });
});
