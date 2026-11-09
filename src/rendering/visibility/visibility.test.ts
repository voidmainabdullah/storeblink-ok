import { describe, expect, it } from "vitest";
import { DEFAULT_LAYOUT, DEFAULT_STYLE, DEFAULT_TRANSFORM, type SceneNode } from "@/types";
import { getAABB, rectsIntersect } from "@/rendering/geometry";
import { shouldRenderNode } from "./index";

const createNode = (overrides: Partial<SceneNode> = {}): SceneNode => ({
  id: "node-1",
  type: "shape",
  name: "Shape",
  parentId: "root",
  childIds: [],
  props: {},
  style: DEFAULT_STYLE,
  layout: DEFAULT_LAYOUT,
  transform: DEFAULT_TRANSFORM,
  meta: { locked: false, hidden: false, createdAt: 1, updatedAt: 1 },
  ...overrides,
});

describe("visibility culling", () => {
  it("computes scaled document bounds from node transform data", () => {
    const node = createNode({
      transform: {
        ...DEFAULT_TRANSFORM,
        x: 20,
        y: 30,
        width: 100,
        height: 50,
        scaleX: 2,
        scaleY: 0.5,
        transformOrigin: [0, 0],
      },
    });

    expect(getAABB(node)).toEqual({ x: 20, y: 30, width: 200, height: 25 });
  });

  it("skips hidden and offscreen child nodes", () => {
    const visibleRegion = { x: 0, y: 0, width: 200, height: 200 };
    expect(shouldRenderNode(createNode({ transform: { ...DEFAULT_TRANSFORM, x: 50, y: 50 } }), visibleRegion)).toBe(true);
    expect(shouldRenderNode(createNode({ transform: { ...DEFAULT_TRANSFORM, x: 250, y: 250 } }), visibleRegion)).toBe(false);
    expect(shouldRenderNode(createNode({ meta: { locked: false, hidden: true, createdAt: 1, updatedAt: 1 } }), visibleRegion)).toBe(false);
  });

  it("detects rectangle intersection without owning hit testing", () => {
    expect(rectsIntersect({ x: 0, y: 0, width: 10, height: 10 }, { x: 9, y: 9, width: 5, height: 5 })).toBe(true);
    expect(rectsIntersect({ x: 0, y: 0, width: 10, height: 10 }, { x: 10, y: 10, width: 5, height: 5 })).toBe(false);
  });
});
