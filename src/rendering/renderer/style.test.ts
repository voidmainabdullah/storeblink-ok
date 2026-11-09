import { describe, expect, it } from "vitest";
import { DEFAULT_LAYOUT, DEFAULT_TRANSFORM, type SceneNode } from "@/types";
import { getNodeDomId, getNodeVisualStyle } from "./style";

const node = {
  id: "shape",
  type: "shape",
  name: "Shape",
  parentId: null,
  childIds: [],
  props: {},
  layout: DEFAULT_LAYOUT,
  transform: DEFAULT_TRANSFORM,
  meta: { locked: false, hidden: false, createdAt: 1, updatedAt: 1 },
  style: {
    fills: [{ type: "solid", color: "#ff0000", opacity: 0.5 }],
    strokes: [{ color: "#000000", width: 2, opacity: 0.4, position: "outside", style: "dashed" }],
    effects: [
      { type: "shadow", value: { kind: "inner-shadow", x: 1, y: 2, blur: 3, color: "#000000" } },
      { type: "blur", value: { kind: "background-blur", radius: 8 } },
    ],
    opacity: 0.8,
    cornerRadius: 12,
  },
} satisfies SceneNode;

describe("renderer style resolution", () => {
  it("renders fill opacity, outside stroke, inner shadow, and background blur", () => {
    const style = getNodeVisualStyle(node);
    expect(style.background).toContain("color-mix");
    expect(style.outline).toContain("dashed");
    expect(style.boxShadow).toContain("inset");
    expect(style.backdropFilter).toBe("blur(8px)");
    expect(style.borderRadius).toBe(12);
  });

  it("splits centered strokes across the node edge", () => {
    const style = getNodeVisualStyle({
      ...node,
      style: {
        ...node.style,
        strokes: [{ color: "#000000", width: 4, position: "center", style: "solid" }],
      },
    });

    expect(style.border).toContain("2px");
    expect(style.outline).toContain("2px");
  });

  it("exposes persisted anchors as DOM ids", () => {
    expect(getNodeDomId({ ...node, extensions: { anchor: "featured-products" } })).toBe("featured-products");
    expect(getNodeDomId({ ...node, extensions: { anchor: " " } })).toBeUndefined();
    expect(
      getNodeDomId({
        ...node,
        type: "section",
        extensions: { sectionInstanceId: "hero:primary" },
      }),
    ).toBe("section-hero-primary");
  });

  it("composites visible fills in declared top-to-bottom order", () => {
    const style = getNodeVisualStyle({
      ...node,
      style: {
        ...node.style,
        fills: [
          { type: "solid", color: "#ff0000", opacity: 0.5 },
          { type: "solid", color: "#0000ff" },
        ],
      },
    });

    expect(style.backgroundImage).toContain("#ff0000");
    expect(style.backgroundImage).toContain("#0000ff");
    expect(style.backgroundImage?.indexOf("#ff0000"))
      .toBeLessThan(style.backgroundImage?.indexOf("#0000ff") ?? -1);
  });
});
