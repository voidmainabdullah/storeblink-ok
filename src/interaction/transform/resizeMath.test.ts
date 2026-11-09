import { describe, expect, it } from "vitest";
import type { MoveableEvents } from "react-moveable";
import { DEFAULT_TRANSFORM } from "@/types";
import { getResizeTransformPatch } from "./resizeMath";

const resizeEvent = (
  width: number,
  height: number,
  direction: [number, number],
  beforeTranslate: [number, number] = [0, 0],
  noise: [number, number] = [0, 0],
) =>
  ({
    width,
    height,
    direction,
    drag: {
      beforeTranslate,
      beforeDist: noise,
      dist: noise,
    },
  }) as unknown as MoveableEvents["resize"];

describe("resize transform math", () => {
  it("keeps x/y immutable for east, south, and south-east resize", () => {
    const initial = { ...DEFAULT_TRANSFORM, x: 120, y: 80, width: 240, height: 160, rotation: 0 };

    expect(getResizeTransformPatch(initial, resizeEvent(300, 160, [1, 0], [999, 999]))).toMatchObject({
      x: 120,
      y: 80,
      width: 300,
      height: 160,
    });
    expect(getResizeTransformPatch(initial, resizeEvent(240, 220, [0, 1], [999, 999]))).toMatchObject({
      x: 120,
      y: 80,
      width: 240,
      height: 220,
    });
    expect(getResizeTransformPatch(initial, resizeEvent(300, 220, [1, 1], [999, 999]))).toMatchObject({
      x: 120,
      y: 80,
      width: 300,
      height: 220,
    });
  });

  it("keeps the opposite edge fixed for west, north, and north-west resize", () => {
    const initial = { ...DEFAULT_TRANSFORM, x: 100, y: 100, width: 200, height: 120, rotation: 0 };

    expect(getResizeTransformPatch(initial, resizeEvent(275, 120, [-1, 0], [12345, 0]))).toMatchObject({
      x: 25,
      y: 100,
      width: 275,
      height: 120,
    });
    expect(getResizeTransformPatch(initial, resizeEvent(200, 165, [0, -1], [0, 12345]))).toMatchObject({
      x: 100,
      y: 55,
      width: 200,
      height: 165,
    });
    expect(getResizeTransformPatch(initial, resizeEvent(275, 165, [-1, -1], [12345, 12345]))).toMatchObject({
      x: 25,
      y: 55,
      width: 275,
      height: 165,
    });
  });

  it("does not compound position after hundreds of right/bottom resize frames", () => {
    const initial = { ...DEFAULT_TRANSFORM, x: 120, y: 80, width: 240, height: 160, rotation: 0 };
    let latest = initial;

    for (let frame = 1; frame <= 500; frame += 1) {
      const patch = getResizeTransformPatch(
        initial,
        resizeEvent(240 + frame, 160 + frame / 2, [1, 1], [frame * 100, frame * 200]),
      );
      latest = { ...latest, ...patch };
      expect(patch.x).toBe(initial.x);
      expect(patch.y).toBe(initial.y);
    }

    expect(latest).toMatchObject({ x: 120, y: 80, width: 740, height: 410 });
  });

  it("does not compound position after hundreds of left/top resize frames", () => {
    const initial = { ...DEFAULT_TRANSFORM, x: 120, y: 80, width: 240, height: 160, rotation: 0 };
    let latest = initial;

    for (let frame = 1; frame <= 500; frame += 1) {
      const width = 240 + frame;
      const height = 160 + frame / 2;
      const patch = getResizeTransformPatch(initial, resizeEvent(width, height, [-1, -1], [999999, 999999]));
      latest = { ...latest, ...patch };
      expect(patch.x).toBeCloseTo(initial.x + initial.width - width, 10);
      expect(patch.y).toBeCloseTo(initial.y + initial.height - height, 10);
    }

    expect(latest).toMatchObject({ x: -380, y: -170, width: 740, height: 410 });
  });

  it.each([0.25, 0.5, 1, 2, 4])("is invariant to viewport zoom at %sx", (zoom) => {
    const initial = { ...DEFAULT_TRANSFORM, x: 50, y: 75, width: 100, height: 80, rotation: 0 };
    expect(zoom).toBeGreaterThan(0);
    expect(getResizeTransformPatch(initial, resizeEvent(150, 110, [-1, -1], [37, -19]))).toMatchObject({
      x: 0,
      y: 45,
      width: 150,
      height: 110,
    });
  });

  it("uses Moveable start-relative translation for rotated targets", () => {
    const initial = { ...DEFAULT_TRANSFORM, x: 120, y: 80, width: 240, height: 160, rotation: 30 };
    const patch = getResizeTransformPatch(initial, resizeEvent(280, 190, [-1, -1], [40, 20], [32659, 32049]));

    expect(patch).toMatchObject({ x: 160, y: 100, width: 280, height: 190 });
  });

  it("ignores non-finite values instead of teleporting", () => {
    const initial = { ...DEFAULT_TRANSFORM, x: 10, y: 20, width: 100, height: 80, rotation: 0 };
    const event = resizeEvent(Number.NaN, Number.POSITIVE_INFINITY, [1, 1], [Number.NaN, 4]);

    expect(getResizeTransformPatch(initial, event)).toMatchObject({
      x: 10,
      y: 20,
      width: 100,
      height: 80,
    });
  });
});
