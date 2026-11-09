import { describe, expect, it } from "vitest";
import { createSceneNode } from "@/engine/scene-graph";
import { ResponsiveRuleRegistry } from "./ResponsiveRuleRegistry";

describe("ResponsiveRuleRegistry", () => {
  it("resolves built-in safety rules and semantic intent overrides", () => {
    const registry = new ResponsiveRuleRegistry();
    const text = createSceneNode({
      type: "text",
      name: "Title",
      layout: {
        mode: "absolute",
        responsiveIntent: { minimumReadableSize: 15, narrowBehavior: "wrap" },
      },
    }, null);

    expect(registry.resolve(text)).toMatchObject({
      minimumFontSize: 15,
      wrappingPolicy: "text",
      stackingPolicy: "wrap-on-narrow",
    });
  });

  it("supports custom node rules without changing built-in defaults", () => {
    const registry = new ResponsiveRuleRegistry();
    const unregister = registry.register({
      type: "custom:map",
      safeMinWidth: 240,
      safeMinHeight: 180,
      wrappingPolicy: "none",
      stackingPolicy: "stack-on-narrow",
      preserveAspectRatio: true,
      breakpointBehavior: "reflow",
      containerBehavior: "fluid",
    });
    const custom = createSceneNode({ type: "custom:map", name: "Map" }, null);

    expect(registry.resolve(custom).safeMinWidth).toBe(240);
    unregister();
    expect(registry.resolve(custom).safeMinWidth).toBe(1);
  });
});
