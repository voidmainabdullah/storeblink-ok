import { describe, expect, it } from "vitest";
import { buildBasicTemplateScene } from "@/editor/engine/basicTemplate";
import { buildAtelierTemplateScene } from "@/themes/atelier/templates/home";
import { themeChromeNodeSlot } from "@/theme-engine/chrome";
import {
  canTransformNode,
  shouldPreserveAspectRatio,
} from "./capabilities";

describe("global transform capability", () => {
  it.each([
    ["basic", () => buildBasicTemplateScene({}, [])],
    ["atelier", () => buildAtelierTemplateScene({}, [])],
  ])("enables ordinary %s theme nodes and its responsive logo", (_id, createScene) => {
    const scene = createScene();
    const editable = Object.values(scene.nodes).find(
      (node) =>
        node.parentId &&
        themeChromeNodeSlot(node) === null &&
        !node.meta.locked &&
        node.transform.width > 0 &&
        node.transform.height > 0,
    );
    const logo = Object.values(scene.nodes).find(
      (node) => themeChromeNodeSlot(node) === "logo",
    );

    expect(canTransformNode(editable)).toBe(true);
    expect(canTransformNode(logo)).toBe(true);
    expect(shouldPreserveAspectRatio(logo)).toBe(true);
  });

  it("does not allow locked nodes to expose transform controls", () => {
    const scene = buildBasicTemplateScene({}, []);
    const node = structuredClone(scene.nodes["basic-hero-heading"]);
    node.meta.locked = true;

    expect(canTransformNode(node)).toBe(false);
  });
});
