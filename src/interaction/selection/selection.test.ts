import { beforeEach, describe, expect, it } from "vitest";
import { createEngineEventBus } from "@/engine/event-bus";
import { createSceneGraph } from "@/engine/scene-graph";
import { useSelectionStore } from "@/stores/selection.store";
import { canSelect, createSelectionSystem } from "./state";

const resetSelectionStore = () => {
  useSelectionStore.setState({ selectedIds: [], hoveredId: null, activeId: null, editingId: null });
};

describe("selection system", () => {
  beforeEach(resetSelectionStore);

  it("selects, toggles, clears, and tracks hover with active id derived from selection order", () => {
    const graph = createSceneGraph();
    graph.createNode({ id: "root", type: "section", name: "Root", transform: { width: 500, height: 500 } });
    graph.createNode({ id: "a", type: "shape", name: "A", transform: { x: 10, y: 10, width: 40, height: 40 } }, "root");
    graph.createNode({ id: "b", type: "shape", name: "B", transform: { x: 70, y: 10, width: 40, height: 40 } }, "root");

    const selection = createSelectionSystem({ sceneGraph: graph });
    selection.select(["a"]);
    expect(selection.getSelected()).toEqual(["a"]);
    expect(selection.getActive()).toBe("a");

    selection.toggleSelection("b");
    expect(selection.getSelected()).toEqual(["a", "b"]);
    expect(selection.getActive()).toBe("b");

    selection.toggleSelection("a");
    expect(selection.getSelected()).toEqual(["b"]);
    selection.setHovered("a");
    expect(selection.getHovered()).toBe("a");

    selection.clearSelection();
    expect(selection.getSelected()).toEqual([]);
    expect(selection.getActive()).toBeNull();
  });

  it("rejects locked, hidden, and nonexistent nodes through canSelect", () => {
    const graph = createSceneGraph();
    graph.createNode({ id: "root", type: "section", name: "Root" });
    graph.createNode({ id: "locked", type: "shape", name: "Locked", meta: { locked: true } }, "root");
    graph.createNode({ id: "hidden", type: "shape", name: "Hidden", meta: { hidden: true } }, "root");
    graph.createNode({ id: "ok", type: "shape", name: "Ok" }, "root");

    const selection = createSelectionSystem({ sceneGraph: graph });
    selection.select(["locked", "hidden", "missing", "ok"]);

    expect(canSelect(graph.getNode("locked"))).toBe(false);
    expect(canSelect(graph.getNode("hidden"))).toBe(false);
    expect(canSelect(graph.getNode("missing"))).toBe(false);
    expect(selection.getSelected()).toEqual(["ok"]);
  });

  it("computes union bounds for rotated selected nodes in document space", () => {
    const graph = createSceneGraph();
    graph.createNode({ id: "root", type: "section", name: "Root", transform: { width: 800, height: 800 } });
    graph.createNode(
      { id: "rotated", type: "shape", name: "Rotated", transform: { x: 100, y: 100, width: 100, height: 50, rotation: 90 } },
      "root",
    );
    graph.createNode(
      { id: "plain", type: "shape", name: "Plain", transform: { x: 260, y: 100, width: 40, height: 40 } },
      "root",
    );

    const selection = createSelectionSystem({ sceneGraph: graph });
    selection.select(["rotated", "plain"]);
    const bounds = selection.getSelectionBounds();

    expect(bounds?.x).toBeCloseTo(125);
    expect(bounds?.y).toBeCloseTo(75);
    expect(bounds?.width).toBeCloseTo(175);
    expect(bounds?.height).toBeCloseTo(100);
  });

  it("prunes selected and hovered ids when scene deletion events fire", () => {
    const eventBus = createEngineEventBus();
    const graph = createSceneGraph({ eventBus });
    graph.createNode({ id: "root", type: "section", name: "Root" });
    graph.createNode({ id: "node", type: "shape", name: "Node" }, "root");

    const selection = createSelectionSystem({ sceneGraph: graph, eventBus });
    selection.select(["node"]);
    selection.setHovered("node");
    graph.deleteNode("node");

    expect(selection.getSelected()).toEqual([]);
    expect(selection.getHovered()).toBeNull();
  });
});
