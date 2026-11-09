import { describe, expect, it } from "vitest";
import {
  add,
  applyMatrix,
  composeMatrix,
  distance,
  getAABB,
  getOBB,
  pointInPolygon,
  pointInRect,
  rectsIntersect,
  scale,
  subtract,
  unionBounds,
} from "./index";
import { DEFAULT_LAYOUT, DEFAULT_STYLE, DEFAULT_TRANSFORM, type SceneNode, type TransformData } from "@/types";

const createNode = (transform: Partial<TransformData>): SceneNode => ({
  id: "node",
  type: "shape",
  name: "Shape",
  parentId: null,
  childIds: [],
  props: {},
  style: DEFAULT_STYLE,
  layout: DEFAULT_LAYOUT,
  transform: { ...DEFAULT_TRANSFORM, ...transform },
  meta: { locked: false, hidden: false, createdAt: 1, updatedAt: 1 },
});

describe("geometry system", () => {
  it("runs vector operations without DOM state", () => {
    expect(add({ x: 1, y: 2 }, { x: 3, y: 4 })).toEqual({ x: 4, y: 6 });
    expect(subtract({ x: 8, y: 6 }, { x: 3, y: 1 })).toEqual({ x: 5, y: 5 });
    expect(scale({ x: 3, y: -4 }, 2)).toEqual({ x: 6, y: -8 });
    expect(distance({ x: 0, y: 0 }, { x: 3, y: 4 })).toBe(5);
  });

  it("computes AABB and OBB for rotated nodes", () => {
    const node = createNode({
      x: 0,
      y: 0,
      width: 100,
      height: 50,
      rotation: 90,
      transformOrigin: [0.5, 0.5],
    });

    const obb = getOBB(node);
    expect(obb[0].x).toBeCloseTo(75);
    expect(obb[0].y).toBeCloseTo(-25);
    expect(obb[2].x).toBeCloseTo(25);
    expect(obb[2].y).toBeCloseTo(75);

    const aabb = getAABB(node);
    expect(aabb.x).toBeCloseTo(25);
    expect(aabb.y).toBeCloseTo(-25);
    expect(aabb.width).toBeCloseTo(50);
    expect(aabb.height).toBeCloseTo(100);
  });

  it("unions bounds and handles containment/intersection edges", () => {
    expect(unionBounds([{ x: 0, y: 0, width: 10, height: 20 }, { x: -5, y: 5, width: 3, height: 30 }])).toEqual({
      x: -5,
      y: 0,
      width: 15,
      height: 35,
    });

    expect(rectsIntersect({ x: 0, y: 0, width: 10, height: 10 }, { x: 10, y: 10, width: 5, height: 5 })).toBe(false);
    expect(rectsIntersect({ x: 0, y: 0, width: 10, height: 10 }, { x: 9, y: 9, width: 5, height: 5 })).toBe(true);
    expect(pointInRect({ x: 10, y: 10 }, { x: 0, y: 0, width: 10, height: 10 })).toBe(true);
  });

  it("detects points inside oriented polygons", () => {
    const node = createNode({ x: 25, y: 25, width: 40, height: 20, rotation: 45 });
    const polygon = getOBB(node);
    expect(pointInPolygon(applyMatrix(composeMatrix(node.transform), { x: 20, y: 10 }), polygon)).toBe(true);
    expect(pointInPolygon(polygon[0], polygon)).toBe(true);
    expect(pointInPolygon({ x: -100, y: -100 }, polygon)).toBe(false);
  });
});
