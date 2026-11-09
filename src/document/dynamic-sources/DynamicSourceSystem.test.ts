import { describe, expect, it } from "vitest";
import { createSceneNode } from "@/engine/scene-graph";
import {
  createProductReferenceChanges,
  DynamicSourceSystem,
} from "./DynamicSourceSystem";

describe("DynamicSourceSystem", () => {
  it("resolves live product fields without mutating the source node", () => {
    const system = new DynamicSourceSystem();
    const source = createSceneNode(
      {
        id: "price",
        type: "text",
        name: "Price",
        props: { text: "$0.00" },
        extensions: {
          dynamicBinding: {
            source: "product",
            field: "price_cents",
            target: "text",
            productId: "p1",
            format: "currency",
          },
        },
      },
      null,
      1,
    );

    const resolved = system.resolveNode(source, {
      currency: "USD",
      products: [{ id: "p1", price_cents: 1299 }],
    });

    expect(resolved.props.text).toMatch(/12\.99/);
    expect(source.props.text).toBe("$0.00");
  });

  it("resolves product images stored as uploaded image records", () => {
    const system = new DynamicSourceSystem();
    const node = createSceneNode(
      {
        id: "product-image",
        type: "image",
        name: "Product image",
        props: {},
        extensions: {
          dynamicBinding: {
            source: "product",
            field: "image_url",
            target: "src",
            productId: "product-1",
          },
        },
      },
      null,
      1,
    );

    const resolved = system.resolveNode(node, {
      products: [{ id: "product-1", images: [{ url: "https://example.com/uploaded.jpg" }] }],
    });

    expect(resolved.props.src).toBe("https://example.com/uploaded.jpg");
  });

  it("marks a missing reference safely instead of throwing", () => {
    const system = new DynamicSourceSystem();
    const source = createSceneNode(
      {
        id: "title",
        type: "text",
        name: "Title",
        props: { text: "Product" },
        extensions: {
          dynamicBinding: { source: "product", field: "name", target: "text", productId: "missing" },
        },
      },
      null,
      1,
    );

    expect(system.resolveNode(source, { products: [] }).props).toMatchObject({
      text: "Product",
      dynamicSourceMissing: true,
    });
  });

  it("updates every node in a product slot as one command payload", () => {
    const root = createSceneNode({ id: "root", type: "section", name: "Root" }, null, 1);
    const title = createSceneNode(
      {
        id: "title",
        type: "text",
        name: "Title",
        extensions: {
          productId: "p1",
          productSlotId: "featured-slot",
          dynamicBinding: {
            source: "product",
            field: "name",
            target: "text",
            productId: "p1",
          },
        },
      },
      root.id,
      1,
    );
    const action = createSceneNode(
      {
        id: "action",
        type: "button",
        name: "View product",
        extensions: { productId: "p1", productSlotId: "featured-slot" },
      },
      root.id,
      1,
    );
    const unrelated = createSceneNode(
      {
        id: "unrelated",
        type: "button",
        name: "Other product",
        extensions: { productId: "p1", productSlotId: "other-slot" },
      },
      root.id,
      1,
    );
    root.childIds = [title.id, action.id, unrelated.id];

    const changes = createProductReferenceChanges(
      {
        rootNodeId: root.id,
        nodes: {
          [root.id]: root,
          [title.id]: title,
          [action.id]: action,
          [unrelated.id]: unrelated,
        },
      },
      title.id,
      "p2",
    );

    expect(changes.map((change) => change.nodeId)).toEqual(["title", "action"]);
    expect(changes[0].after).toMatchObject({
      productId: "p2",
      dynamicBinding: { productId: "p2" },
    });
    expect(changes[1].after).toMatchObject({ productId: "p2" });
  });
});
