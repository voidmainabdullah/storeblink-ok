import { describe, expect, it } from "vitest";
import { createSceneNode } from "@/engine/scene-graph/nodeFactory";
import type { SceneTree } from "@/types";
import {
  SemanticPathExtractionError,
  extractSemanticPaths,
} from "./SemanticPathExtractor";

const createScene = (): SceneTree => {
  const root = createSceneNode({
    id: "root",
    type: "container",
    name: "Page",
    extensions: { editorKind: "page" },
  }, null, 1);
  const section = createSceneNode({
    id: "hero",
    type: "section",
    name: "Whatever the merchant calls it",
    extensions: { editorKind: "section", canonicalSectionType: "hero" },
  }, root.id, 1);
  const heading = createSceneNode({
    id: "heading-random-id",
    type: "text",
    name: "Large title",
    extensions: { editorKind: "block", blockType: "heading" },
  }, section.id, 1);
  const label = createSceneNode({
    id: "internal-label",
    type: "text",
    name: "Nested label",
    extensions: { editorKind: "internal", semanticRole: "label" },
  }, heading.id, 1);
  root.childIds = [section.id];
  section.childIds = [heading.id];
  heading.childIds = [label.id];
  return {
    rootNodeId: root.id,
    nodes: {
      [root.id]: root,
      [section.id]: section,
      [heading.id]: heading,
      [label.id]: label,
    },
  };
};

describe("extractSemanticPaths", () => {
  it("extracts canonical paths without using ids, names, or node order", () => {
    const result = extractSemanticPaths(createScene(), "home");
    expect(result.byNodeId).toEqual({
      root: "home.root",
      hero: "home.hero",
      "heading-random-id": "home.hero.heading",
      "internal-label": "home.hero.heading.label",
    });
    expect(result.byPath["home.hero.heading"]).toBe("heading-random-id");
  });

  it("uses the not-found namespace for 404 scenes", () => {
    const result = extractSemanticPaths(createScene(), "404");
    expect(result.byNodeId.root).toBe("not-found.root");
    expect(result.byNodeId.hero).toBe("not-found.hero");
  });

  it("fails closed when two nodes map to the same semantic path", () => {
    const scene = createScene();
    const duplicate = createSceneNode({
      id: "heading-two",
      type: "text",
      name: "Another title",
      extensions: { editorKind: "block", blockType: "heading" },
    }, "hero", 1);
    scene.nodes[duplicate.id] = duplicate;
    scene.nodes.hero.childIds.push(duplicate.id);
    try {
      extractSemanticPaths(scene, "home");
      throw new Error("expected extraction to fail");
    } catch (error) {
      expect(error).toBeInstanceOf(SemanticPathExtractionError);
      expect((error as SemanticPathExtractionError).issues)
        .toEqual(expect.arrayContaining([expect.objectContaining({ code: "ambiguous" })]));
    }
  });

  it("fails closed for an internal node without an explicit semantic role", () => {
    const scene = createScene();
    delete scene.nodes["internal-label"].extensions?.semanticRole;
    expect(() => extractSemanticPaths(scene, "home")).toThrow(SemanticPathExtractionError);
    try {
      extractSemanticPaths(scene, "home");
    } catch (error) {
      expect((error as SemanticPathExtractionError).issues)
        .toEqual(expect.arrayContaining([expect.objectContaining({
          code: "unmapped",
          nodeId: "internal-label",
        })]));
    }
  });

  it("rejects explicit paths from a different route namespace", () => {
    const scene = createScene();
    scene.nodes.hero.extensions = {
      ...scene.nodes.hero.extensions,
      semanticPath: "product.hero",
    };
    expect(() => extractSemanticPaths(scene, "home")).toThrow(/must start with home/);
  });
});
