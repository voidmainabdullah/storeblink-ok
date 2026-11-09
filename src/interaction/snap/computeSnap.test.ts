import { describe, expect, it } from "vitest";
import { computeSnap } from "./computeSnap";

describe("computeSnap", () => {
  it("snaps to grid when no object snap is closer", () => {
    const result = computeSnap({ x: 18, y: 33, width: 20, height: 20 }, [], 10, 3);

    expect(result.snappedDelta).toEqual({ x: 2, y: -3 });
    expect(result.guides).toEqual([
      { axis: "x", position: 20, kind: "grid" },
      { axis: "y", position: 30, kind: "grid" },
    ]);
  });

  it("prefers edge snap over grid snap inside the threshold", () => {
    const result = computeSnap(
      { x: 48, y: 5, width: 20, height: 20 },
      [{ x: 70, y: 80, width: 20, height: 20 }],
      10,
      3,
    );

    expect(result.snappedDelta.x).toBe(2);
    expect(result.guides.find((guide) => guide.axis === "x")).toEqual({ axis: "x", position: 50, kind: "edge" });
  });

  it("reports a center guide when centers already align", () => {
    const result = computeSnap(
      { x: 18, y: 0, width: 20, height: 20 },
      [{ x: 18, y: 40, width: 20, height: 20 }],
      0,
      2,
    );

    expect(result.snappedDelta.x).toBe(0);
    expect(result.guides.find((guide) => guide.axis === "x")).toEqual({ axis: "x", position: 18, kind: "center" });
  });
});
