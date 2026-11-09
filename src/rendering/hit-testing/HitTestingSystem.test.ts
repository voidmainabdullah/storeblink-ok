import { describe, expect, it } from "vitest";
import { createEngineEventBus } from "@/engine/event-bus";
import { createSceneGraph } from "@/engine/scene-graph";
import { localToWorld } from "@/rendering/coordinate";
import { DEFAULT_LAYOUT, DEFAULT_STYLE, DEFAULT_TRANSFORM, type SceneNode, type SceneTree } from "@/types";
import { createHitTestingSystem } from "./HitTestingSystem";

const createShapeNode = (id: string, parentId: string | null, x: number, y: number, width: number, height: number): SceneNode => ({
  id,
  type: "shape",
  name: id,
  parentId,
  childIds: [],
  props: {},
  style: DEFAULT_STYLE,
  layout: DEFAULT_LAYOUT,
  transform: { ...DEFAULT_TRANSFORM, x, y, width, height },
  meta: { locked: false, hidden: false, createdAt: 1, updatedAt: 1 },
});

describe("hit testing system", () => {
  it("returns the topmost overlapping sibling by paint order", () => {
    const graph = createSceneGraph();
    graph.createNode({ id: "root", type: "section", name: "Root", transform: { width: 500, height: 500 } });
    graph.createNode({ id: "bottom", type: "shape", name: "Bottom", transform: { x: 0, y: 0, width: 120, height: 120 } }, "root");
    graph.createNode({ id: "top", type: "shape", name: "Top", transform: { x: 20, y: 20, width: 120, height: 120 } }, "root");

    const hitTesting = createHitTestingSystem({ sceneGraph: graph });

    expect(hitTesting.hitTest({ x: 30, y: 30 })).toBe("top");
    expect(hitTesting.hitTestRegion({ x: 0, y: 0, width: 200, height: 200 })).toEqual(["top", "bottom"]);
  });

  it("excludes locked and hidden nodes from results", () => {
    const graph = createSceneGraph();
    graph.createNode({ id: "root", type: "section", name: "Root", transform: { width: 500, height: 500 } });
    graph.createNode({ id: "bottom", type: "shape", name: "Bottom", transform: { x: 0, y: 0, width: 120, height: 120 } }, "root");
    graph.createNode(
      { id: "top", type: "shape", name: "Top", transform: { x: 20, y: 20, width: 120, height: 120 }, meta: { locked: true } },
      "root",
    );

    const hitTesting = createHitTestingSystem({ sceneGraph: graph });
    expect(hitTesting.hitTest({ x: 30, y: 30 })).toBe("bottom");

    graph.updateNode("bottom", { meta: { hidden: true } });
    hitTesting.rebuildIndex();
    expect(hitTesting.hitTest({ x: 30, y: 30 })).toBeNull();
  });

  it("resolves nested transformed children in document space", () => {
    const graph = createSceneGraph();
    graph.createNode({ id: "root", type: "section", name: "Root", transform: { width: 600, height: 600 } });
    graph.createNode(
      { id: "parent", type: "container", name: "Parent", transform: { x: 150, y: 120, rotation: 22, width: 200, height: 200 } },
      "root",
    );
    graph.createNode(
      { id: "child", type: "shape", name: "Child", transform: { x: 40, y: 35, rotation: -15, width: 80, height: 60 } },
      "parent",
    );

    const hitTesting = createHitTestingSystem({ sceneGraph: graph });
    const child = graph.getNode("child")!;
    const childCenter = localToWorld({ x: 40, y: 30 }, child, graph);

    expect(hitTesting.hitTest(childCenter)).toBe("child");
  });

  it("rebuilds from scene graph events instead of manual polling", () => {
    const eventBus = createEngineEventBus();
    const graph = createSceneGraph({ eventBus });
    graph.createNode({ id: "root", type: "section", name: "Root", transform: { width: 500, height: 500 } });
    graph.createNode({ id: "bottom", type: "shape", name: "Bottom", transform: { x: 0, y: 0, width: 120, height: 120 } }, "root");
    graph.createNode({ id: "top", type: "shape", name: "Top", transform: { x: 20, y: 20, width: 120, height: 120 } }, "root");

    const hitTesting = createHitTestingSystem({ sceneGraph: graph, eventBus });
    expect(hitTesting.hitTest({ x: 30, y: 30 })).toBe("top");

    graph.updateNode("top", { meta: { hidden: true } });
    expect(hitTesting.hitTest({ x: 30, y: 30 })).toBe("bottom");
  });

  it("handles a synthetic 1,000 node scene without falling back to a linear scan API", () => {
    const root: SceneNode = {
      ...createShapeNode("root", null, 0, 0, 5000, 5000),
      type: "section",
      name: "Root",
      childIds: [],
    };
    const nodes: SceneTree["nodes"] = { root };

    for (let index = 0; index < 1000; index += 1) {
      const id = `node-${index}`;
      nodes[id] = createShapeNode(id, "root", (index % 40) * 45, Math.floor(index / 40) * 45, 40, 40);
      root.childIds.push(id);
    }

    const graph = createSceneGraph({ initialTree: { rootNodeId: "root", nodes } });
    const hitTesting = createHitTestingSystem({ sceneGraph: graph, bucketSize: 128 });
    const startedAt = performance.now();
    for (let index = 0; index < 250; index += 1) {
      hitTesting.hitTest({ x: (index % 40) * 45 + 10, y: Math.floor(index / 40) * 45 + 10 });
    }
    const elapsed = performance.now() - startedAt;

    expect(hitTesting.getIndexEntryCount()).toBe(1000);
    expect(elapsed).toBeLessThan(250);
  });
});
