import type { EngineEventBus, EngineEventMap } from "@/engine/event-bus";
import type { SceneGraphAPI } from "@/engine/scene-graph";
import {
  getTransformedOBB,
  pointInPolygon,
  pointInRect,
  polygonToAABB,
  rectsIntersect,
} from "@/rendering/geometry";
import { clearWorldTransformCache, connectCoordinateCacheToEventBus, getWorldTransform } from "@/rendering/coordinate";
import type { NodeId, Point, Rect, SceneNode } from "@/types";
import { SpatialBucketIndex } from "./SpatialBucketIndex";
import type { HitTestIndexEntry, HitTestingAPI, HitTestingSystemOptions } from "./types";

export class HitTestingSystem implements HitTestingAPI {
  private sceneGraph?: SceneGraphAPI;
  private readonly bucketSize: number;
  private index: SpatialBucketIndex;
  private indexDirty = false;
  private rebuildFrame: number | null = null;
  private unsubscribers: Array<() => void> = [];

  constructor(options: HitTestingSystemOptions = {}) {
    this.bucketSize = options.bucketSize ?? 256;
    this.index = new SpatialBucketIndex(this.bucketSize);
    this.configure(options);
  }

  configure(options: HitTestingSystemOptions): void {
    this.dispose();
    this.sceneGraph = options.sceneGraph ?? this.sceneGraph;
    if (options.eventBus && this.sceneGraph) {
      this.connectEventBus(options.eventBus, this.sceneGraph);
    }
    this.rebuildIndex();
  }

  hitTest(point: Point): NodeId | null {
    this.ensureFreshIndex();
    const candidates = this.index
      .queryPoint(point)
      .filter((entry) => pointInRect(point, entry.aabb) && pointInPolygon(point, entry.obb))
      .sort((a, b) => b.paintOrder - a.paintOrder);

    return candidates[0]?.nodeId ?? null;
  }

  hitTestRegion(rect: Rect): NodeId[] {
    this.ensureFreshIndex();
    return this.index
      .queryRect(rect)
      .filter((entry) => rectsIntersect(entry.aabb, rect))
      .sort((a, b) => b.paintOrder - a.paintOrder)
      .map((entry) => entry.nodeId);
  }

  rebuildIndex(): void {
    if (this.rebuildFrame !== null && typeof cancelAnimationFrame === "function") {
      cancelAnimationFrame(this.rebuildFrame);
    }
    this.rebuildFrame = null;
    this.indexDirty = false;
    this.index = new SpatialBucketIndex(this.bucketSize);
    if (!this.sceneGraph) return;

    let paintOrder = 0;
    this.sceneGraph.traverse((node) => {
      paintOrder += 1;
      if (!this.isEligible(node)) return;
      const worldTransform = getWorldTransform(node, this.sceneGraph as SceneGraphAPI);
      const obb = getTransformedOBB(node, worldTransform);
      const aabb = polygonToAABB(obb);
      this.index.add({ nodeId: node.id, aabb, obb, paintOrder });
    });
  }

  getIndexEntryCount(): number {
    this.ensureFreshIndex();
    return this.index.getEntryCount();
  }

  dispose(): void {
    if (this.rebuildFrame !== null && typeof cancelAnimationFrame === "function") {
      cancelAnimationFrame(this.rebuildFrame);
    }
    this.rebuildFrame = null;
    this.indexDirty = false;
    this.unsubscribers.forEach((unsubscribe) => unsubscribe());
    this.unsubscribers = [];
    if (this.sceneGraph) clearWorldTransformCache(undefined, this.sceneGraph);
  }

  private connectEventBus(eventBus: EngineEventBus<EngineEventMap>, sceneGraph: SceneGraphAPI): void {
    this.unsubscribers.push(connectCoordinateCacheToEventBus(eventBus, sceneGraph));
    this.unsubscribers.push(eventBus.on("scene:node:created", () => this.scheduleRebuild()));
    this.unsubscribers.push(eventBus.on("scene:node:updated", () => this.scheduleRebuild()));
    this.unsubscribers.push(eventBus.on("scene:node:deleted", () => this.scheduleRebuild()));
    this.unsubscribers.push(eventBus.on("scene:node:moved", () => this.scheduleRebuild()));
  }

  private scheduleRebuild(): void {
    this.indexDirty = true;
    if (this.rebuildFrame !== null || typeof requestAnimationFrame !== "function") return;
    this.rebuildFrame = requestAnimationFrame(() => {
      this.rebuildFrame = null;
      if (this.indexDirty) this.rebuildIndex();
    });
  }

  private ensureFreshIndex(): void {
    if (this.indexDirty) this.rebuildIndex();
  }

  private isEligible(node: SceneNode): boolean {
    if (!this.sceneGraph) return false;
    if (node.parentId === null) return false;
    if (node.extensions?.selectable === false) return false;
    if (node.meta.hidden || node.meta.locked) return false;

    return this.sceneGraph
      .getAncestors(node.id)
      .every((ancestor) => !ancestor.meta.hidden && !ancestor.meta.locked);
  }
}

export const createHitTestingSystem = (options?: HitTestingSystemOptions) => new HitTestingSystem(options);

export const hitTestingSystem = createHitTestingSystem();
