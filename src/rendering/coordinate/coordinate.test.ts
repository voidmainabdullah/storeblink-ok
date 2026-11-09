import { describe, expect, it } from "vitest";
import {
  applyMatrixToPoint,
  clearWorldTransformCache,
  composeTransform,
  documentToScreen,
  getWorldTransformCacheSize,
  localToWorld,
  matrixToCss,
  screenToDocument,
  worldToLocal,
  connectCoordinateCacheToEventBus,
} from "./index";
import { createEngineEventBus } from "@/engine/event-bus";
import { createSceneGraph } from "@/engine/scene-graph";

describe("coordinate system", () => {
  it("round-trips screen and document coordinates through the viewport transform", () => {
    const viewport = { zoom: 1.75, pan: { x: 80, y: -45 } };
    const documentPoint = { x: 220, y: 135 };

    const screenPoint = documentToScreen(documentPoint, viewport);
    const roundTrip = screenToDocument(screenPoint, viewport);

    expect(roundTrip.x).toBeCloseTo(documentPoint.x);
    expect(roundTrip.y).toBeCloseTo(documentPoint.y);
  });

  it("composes transform data into a reusable matrix", () => {
    const matrix = composeTransform({ x: 10, y: 20, scaleX: 2, scaleY: 3, rotation: 0 });
    expect(applyMatrixToPoint({ x: 4, y: 5 }, matrix)).toEqual({ x: 18, y: 35 });
    expect(matrixToCss(matrix)).toBe("matrix(2, 0, 0, 3, 10, 20)");
  });

  it("round-trips local and world coordinates across nested transformed ancestors", () => {
    clearWorldTransformCache();
    const graph = createSceneGraph();
    graph.createNode({ id: "root", type: "section", name: "Root", transform: { x: 40, y: 20, rotation: 5, width: 500, height: 500 } });
    graph.createNode(
      { id: "parent", type: "container", name: "Parent", transform: { x: 80, y: 30, rotation: 12, scaleX: 1.2, scaleY: 0.9, width: 200, height: 200 } },
      "root",
    );
    graph.createNode(
      { id: "middle", type: "container", name: "Middle", transform: { x: 25, y: 45, rotation: -17, scaleX: 0.8, scaleY: 1.1, width: 120, height: 120 } },
      "parent",
    );
    graph.createNode(
      { id: "child", type: "shape", name: "Child", transform: { x: 12, y: 18, rotation: 31, width: 40, height: 30 } },
      "middle",
    );

    const child = graph.getNode("child")!;
    const localPoint = { x: 16, y: 11 };
    const worldPoint = localToWorld(localPoint, child, graph);
    const roundTrip = worldToLocal(worldPoint, child, graph);

    expect(roundTrip.x).toBeCloseTo(localPoint.x);
    expect(roundTrip.y).toBeCloseTo(localPoint.y);
  });

  it("invalidates cached world transforms from scene graph events", () => {
    clearWorldTransformCache();
    const eventBus = createEngineEventBus();
    const graph = createSceneGraph({ eventBus });
    const disconnect = connectCoordinateCacheToEventBus(eventBus, graph);

    graph.createNode({ id: "root", type: "section", name: "Root", transform: { x: 10, y: 0, width: 300, height: 300 } });
    graph.createNode({ id: "child", type: "shape", name: "Child", transform: { x: 20, y: 0, width: 30, height: 30 } }, "root");

    const child = graph.getNode("child")!;
    expect(localToWorld({ x: 0, y: 0 }, child, graph).x).toBe(30);
    expect(getWorldTransformCacheSize()).toBe(1);

    graph.updateNode("root", { transform: { x: 50 } });
    expect(getWorldTransformCacheSize()).toBe(0);
    expect(localToWorld({ x: 0, y: 0 }, graph.getNode("child")!, graph).x).toBe(70);
    disconnect();
  });
});
