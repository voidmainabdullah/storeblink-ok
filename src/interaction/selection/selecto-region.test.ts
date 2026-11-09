import { beforeEach, describe, expect, it } from "vitest";
import { createSceneGraph } from "@/engine/scene-graph";
import { createHitTestingSystem } from "@/rendering/hit-testing";
import { useSelectionStore } from "@/stores/selection.store";
import { createSelectionSystem } from "./state";
import { selectByScreenRect } from "./selecto-region";

describe("Selecto region adapter", () => {
  beforeEach(() => {
    useSelectionStore.setState({ selectedIds: [], hoveredId: null, activeId: null, editingId: null });
  });

  it("selects nodes by routing the marquee rectangle through hitTestRegion", () => {
    const graph = createSceneGraph();
    graph.createNode({ id: "root", type: "section", name: "Root", transform: { width: 1, height: 1 } });
    graph.createNode({ id: "a", type: "shape", name: "A", transform: { x: 10, y: 5, width: 20, height: 20 } }, "root");
    graph.createNode({ id: "b", type: "shape", name: "B", transform: { x: 80, y: 5, width: 20, height: 20 } }, "root");
    graph.createNode({ id: "c", type: "shape", name: "C", transform: { x: 130, y: 5, width: 20, height: 20 } }, "root");

    const hitTesting = createHitTestingSystem({ sceneGraph: graph });
    const selection = createSelectionSystem({ sceneGraph: graph });
    const selectedIds = selectByScreenRect(
      { left: 20, top: 20, width: 100, height: 30 },
      { x: 10, y: 20 },
      hitTesting,
      { screenToDocument: (point) => point },
      selection,
    );

    expect(selectedIds).toEqual(["b", "a"]);
    expect(useSelectionStore.getState().selectedIds).toEqual(["b", "a"]);
  });
});
