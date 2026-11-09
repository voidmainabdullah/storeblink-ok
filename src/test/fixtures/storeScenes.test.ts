import { describe, expect, it } from "vitest";
import { validateSceneTree } from "@/engine/validation";
import { STORE_SCENE_FIXTURES } from "./storeScenes";

describe("production regression scene fixtures", () => {
  it("provides valid empty, normal, large, mobile, SVG, legacy, and product-heavy stores", () => {
    for (const [name, factory] of Object.entries(STORE_SCENE_FIXTURES)) {
      const scene = factory();
      const validated = validateSceneTree(scene);
      expect(validated.rootNodeId, name).toBe(scene.rootNodeId);
      expect(validated.nodes[validated.rootNodeId!], name).toBeDefined();
    }
  });

  it("normalizes executable legacy SVG content before the fixture enters the engine", () => {
    const validated = validateSceneTree(STORE_SCENE_FIXTURES.legacy());
    const svg = validated.nodes["fixture-legacy-svg"];
    const markup = String((svg.props.svg as { markup: string }).markup);

    expect(svg.props).not.toHaveProperty("markup");
    expect(markup).toContain("<path");
    expect(markup).not.toMatch(/script|foreignObject|iframe|evil\.test|onload|onclick/i);
  });
});
