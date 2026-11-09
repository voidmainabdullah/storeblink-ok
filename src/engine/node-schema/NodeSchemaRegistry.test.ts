import { describe, expect, it } from "vitest";
import { createSceneGraph, createSceneNode } from "@/engine/scene-graph";
import { createBuiltInNodeSchemaRegistry, NodeSchemaValidationError } from "./index";

describe("NodeSchemaRegistry", () => {
  it("registers every built-in type plus a custom-node contract", () => {
    const registry = createBuiltInNodeSchemaRegistry();
    expect(registry.list().map((schema) => schema.type)).toEqual([
      "text",
      "image",
      "button",
      "container",
      "section",
      "shape",
      "svg",
      "video",
      "custom:*",
    ]);
    expect(registry.require("image").capabilities.croppable).toBe(true);
    expect(registry.require("custom:commerce-card").capabilities.acceptsChildren).toBe(true);
  });

  it("rejects invalid roots, child ownership, and typed property values", () => {
    const registry = createBuiltInNodeSchemaRegistry();
    const text = createSceneNode({ type: "text", name: "Text", props: { fontSize: -2 } }, null);
    const rootResult = registry.validateRelationship(null, text);
    const nodeResult = registry.validateNode(text);
    expect(rootResult.valid).toBe(false);
    expect(nodeResult.valid).toBe(false);

    const child = createSceneNode({ type: "shape", name: "Shape" }, text.id);
    expect(registry.validateRelationship(text, child).valid).toBe(false);
  });

  it("enforces schemas at the mutable Scene Graph boundary", () => {
    const registry = createBuiltInNodeSchemaRegistry();
    const graph = createSceneGraph({ nodeSchemaRegistry: registry });
    const root = graph.createNode({ id: "root", type: "section", name: "Root" });
    const text = graph.createNode({ id: "text", type: "text", name: "Text", props: { text: "Hello" } }, root.id);
    const shape = graph.createNode({ id: "shape", type: "shape", name: "Shape" }, root.id);

    expect(() => graph.moveNode(shape.id, text.id)).toThrow(NodeSchemaValidationError);
    expect(() => graph.updateNode(text.id, { props: { fontSize: -1 } })).toThrow(NodeSchemaValidationError);
    expect(graph.validateTree()).toEqual({ valid: true, errors: [] });
  });
});
