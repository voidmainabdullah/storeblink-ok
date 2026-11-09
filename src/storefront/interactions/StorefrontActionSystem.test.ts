import { describe, expect, it } from "vitest";
import { createSceneNode } from "@/engine/scene-graph";
import { StorefrontActionSystem } from "./StorefrontActionSystem";

describe("StorefrontActionSystem", () => {
  const system = new StorefrontActionSystem();

  it("resolves supported storefront actions from typed node metadata", () => {
    const node = createSceneNode(
      {
        id: "next",
        type: "button",
        name: "Next",
        extensions: {
          action: "step-node-set",
          targetNodeIds: ["one", "two", "two", ""],
          direction: -1,
        },
      },
      null,
    );

    expect(system.resolve(node)).toEqual({
      type: "step-node-set",
      targetNodeIds: ["one", "two"],
      direction: -1,
      groupId: "one|two",
    });
  });

  it("resolves the shared category menu action", () => {
    const node = createSceneNode({
      id: "categories",
      type: "button",
      name: "Categories",
      extensions: { action: "open-category-menu" },
    }, null);

    expect(system.resolve(node)).toEqual({ type: "open-category-menu" });
  });

  it("rejects incomplete or unknown actions", () => {
    const incomplete = createSceneNode(
      {
        id: "scroll",
        type: "button",
        name: "Scroll",
        extensions: { action: "scroll-to-node" },
      },
      null,
    );
    const unknown = createSceneNode(
      {
        id: "unknown",
        type: "button",
        name: "Unknown",
        extensions: { action: "execute-script" },
      },
      null,
    );

    expect(system.resolve(incomplete)).toBeNull();
    expect(system.resolve(unknown)).toBeNull();
  });
});
