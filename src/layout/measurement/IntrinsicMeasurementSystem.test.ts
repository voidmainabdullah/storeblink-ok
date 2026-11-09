import { describe, expect, it } from "vitest";
import { createSceneNode } from "@/engine/scene-graph";
import { IntrinsicMeasurementSystem } from "./IntrinsicMeasurementSystem";

describe("IntrinsicMeasurementSystem", () => {
  const system = new IntrinsicMeasurementSystem({
    textMeasurement: ({ text, fontSize }) => text.length * fontSize * 0.5,
  });

  it("wraps text against available width and returns intrinsic height", () => {
    const node = createSceneNode({
      type: "text",
      name: "Title",
      props: { text: "Responsive layouts reflow", fontSize: 20, lineHeight: 1.2 },
      transform: { width: 300, height: 20 },
    }, null);

    expect(system.measure(node, { availableWidth: 120 })).toEqual({
      width: 100,
      height: 72,
    });
  });

  it("uses intrinsic media dimensions without changing the node", () => {
    const node = createSceneNode({
      type: "image",
      name: "Product",
      props: { intrinsicWidth: 1600, intrinsicHeight: 900 },
      transform: { width: 400, height: 300 },
    }, null);
    const before = structuredClone(node);

    expect(system.measure(node)).toEqual({ width: 1600, height: 900 });
    expect(node).toEqual(before);
  });
});
