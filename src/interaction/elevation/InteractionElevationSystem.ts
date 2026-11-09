import type { SceneGraphAPI } from "@/engine/scene-graph";
import { useTransformStore, type TransformStore } from "@/stores/transform.store";
import type { NodeId, SceneNode } from "@/types";

export type InteractionElevationAPI = {
  begin(activeNodeIds: NodeId[], sceneGraph: SceneGraphAPI): void;
  clear(): void;
  getElevatedZIndex(nodeId: NodeId): number | undefined;
};

const unique = (ids: NodeId[]): NodeId[] => [...new Set(ids)];

const nodeOrder = (sceneGraph: SceneGraphAPI): Map<NodeId, number> => {
  const order = new Map<NodeId, number>();
  let index = 0;
  sceneGraph.traverse((node) => {
    order.set(node.id, index);
    index += 1;
  });
  return order;
};

const maxSceneZIndex = (sceneGraph: SceneGraphAPI): number => {
  let max = 0;
  sceneGraph.traverse((node) => {
    if (Number.isFinite(node.transform.zIndex)) max = Math.max(max, node.transform.zIndex);
  });
  return max;
};

export class InteractionElevationSystem implements InteractionElevationAPI {
  constructor(private readonly store: TransformStore = useTransformStore) {}

  begin(activeNodeIds: NodeId[], sceneGraph: SceneGraphAPI): void {
    const order = nodeOrder(sceneGraph);
    const orderedNodeIds = unique(activeNodeIds)
      .map((nodeId) => sceneGraph.getNode(nodeId))
      .filter((node): node is SceneNode => Boolean(node && !node.meta.hidden))
      .sort((a, b) => {
        const zDiff = a.transform.zIndex - b.transform.zIndex;
        if (zDiff !== 0) return zDiff;
        return (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0);
      })
      .map((node) => node.id);

    if (!orderedNodeIds.length) {
      this.clear();
      return;
    }

    const baseZIndex = maxSceneZIndex(sceneGraph) + 10_000;
    const originalZIndex: Record<NodeId, number> = {};
    const elevatedZIndex: Record<NodeId, number> = {};

    orderedNodeIds.forEach((nodeId, index) => {
      const node = sceneGraph.getNode(nodeId);
      if (!node) return;
      originalZIndex[nodeId] = node.transform.zIndex;
      elevatedZIndex[nodeId] = baseZIndex + index;
    });

    this.store.getState().beginElevationFromInteractionElevationSystem({
      activeNodeIds: orderedNodeIds,
      originalZIndex,
      elevatedZIndex,
    });
  }

  clear(): void {
    this.store.getState().clearElevationFromInteractionElevationSystem();
  }

  getElevatedZIndex(nodeId: NodeId): number | undefined {
    return this.store.getState().interactionElevation?.elevatedZIndex[nodeId];
  }
}

export const createInteractionElevationSystem = (store?: TransformStore) => new InteractionElevationSystem(store);

export const interactionElevationSystem = createInteractionElevationSystem();
