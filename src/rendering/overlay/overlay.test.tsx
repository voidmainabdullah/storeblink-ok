import { describe, expect, it } from "vitest";
import { createSceneGraph } from "@/engine/scene-graph";
import { viewportSystem } from "@/rendering/viewport";
import { computeOverlayVisuals, polygonToSvgPoints } from "./geometry";

describe("overlay geometry", () => {
  it("computes selected and hovered screen-space overlay visuals", () => {
    const graph = createSceneGraph();
    graph.createNode({ id: "root", type: "section", name: "Root", transform: { width: 600, height: 600 } });
    graph.createNode({ id: "selected", type: "shape", name: "Selected", transform: { x: 20, y: 30, width: 80, height: 40 } }, "root");
    graph.createNode({ id: "hovered", type: "shape", name: "Hovered", transform: { x: 140, y: 30, width: 50, height: 50 } }, "root");
    viewportSystem.panTo({ x: 10, y: 15 });
    viewportSystem.zoomTo(2);

    const visuals = computeOverlayVisuals({ selectedIds: ["selected"], hoveredId: "hovered" }, graph, viewportSystem);

    expect(visuals.map((visual) => visual.kind)).toEqual(["hovered", "selected"]);
    expect(visuals[1].screenRect.x).toBeCloseTo(50);
    expect(visuals[1].screenRect.y).toBeCloseTo(75);
    expect(visuals[1].screenRect.width).toBeCloseTo(160);
    expect(visuals[1].screenRect.height).toBeCloseTo(80);
    expect(polygonToSvgPoints(visuals[1].screenPolygon)).toContain(",");
  });
});
