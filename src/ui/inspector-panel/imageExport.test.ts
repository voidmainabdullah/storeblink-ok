import { describe, expect, it } from "vitest";
import { calculateImagePlacement } from "./imageExport";

describe("image export placement", () => {
  it("covers the destination and anchors the overflow by image position", () => {
    const centered = calculateImagePlacement(
      { width: 200, height: 100 },
      { width: 100, height: 100 },
      "cover",
      50,
      50,
    );
    expect(centered).toEqual({ x: -50, y: 0, width: 200, height: 100 });

    const right = calculateImagePlacement(
      { width: 200, height: 100 },
      { width: 100, height: 100 },
      "cover",
      100,
      50,
    );
    expect(right.x).toBe(-100);
  });

  it("contains an image without cropping", () => {
    expect(
      calculateImagePlacement(
        { width: 200, height: 100 },
        { width: 100, height: 100 },
        "contain",
        50,
        50,
      ),
    ).toEqual({ x: 0, y: 25, width: 100, height: 50 });
  });
});
