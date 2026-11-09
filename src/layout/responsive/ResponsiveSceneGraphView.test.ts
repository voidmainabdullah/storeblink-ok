import { afterEach, describe, expect, it } from "vitest";
import { SceneGraph } from "@/engine/scene-graph";
import { ResponsiveSystem } from "./ResponsiveSystem";
import { ResponsiveSceneGraphView } from "./ResponsiveSceneGraphView";

describe("ResponsiveSceneGraphView", () => {
  const responsive = new ResponsiveSystem();

  afterEach(() => responsive.activate("desktop"));

  it("exposes resolved transforms to interaction systems while remaining read-only", () => {
    const graph = new SceneGraph();
    const root = graph.createNode(
      {
        id: "root",
        type: "section",
        name: "Root",
        transform: { width: 1200, height: 800 },
        extensions: { responsiveBaseWidth: 1200 },
      },
      null,
    );
    const child = graph.createNode(
      {
        id: "child",
        type: "shape",
        name: "Child",
        transform: { x: 120, y: 80, width: 240, height: 120 },
      },
      root.id,
    );
    graph.deserializeTree(responsive.ensureSceneOverrides(graph.serializeTree()));
    responsive.activate("mobile");
    const view = new ResponsiveSceneGraphView(graph, responsive);

    expect(view.getNode(child.id)?.transform).toMatchObject({ x: 39, width: 78 });
    expect(() => view.updateNode(child.id, { name: "No" })).toThrow(/read-only/);
    expect(graph.getNode(child.id)?.transform.x).toBe(120);
  });
});
