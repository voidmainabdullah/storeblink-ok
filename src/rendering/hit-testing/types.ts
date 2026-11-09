import type { EngineEventBus, EngineEventMap } from "@/engine/event-bus";
import type { SceneGraphAPI } from "@/engine/scene-graph";
import type { NodeId, Point, Rect } from "@/types";
import type { Polygon } from "@/rendering/geometry";

export type HitTestIndexEntry = {
  nodeId: NodeId;
  aabb: Rect;
  obb: Polygon;
  paintOrder: number;
};

export type HitTestingAPI = {
  hitTest(point: Point): NodeId | null;
  hitTestRegion(rect: Rect): NodeId[];
  rebuildIndex(): void;
};

export type HitTestingSystemOptions = {
  sceneGraph?: SceneGraphAPI;
  eventBus?: EngineEventBus<EngineEventMap>;
  bucketSize?: number;
};
