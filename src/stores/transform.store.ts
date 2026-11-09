import { create } from "zustand";
import type { NodeId, TransformData } from "@/types";
import type { TransformKind } from "@/engine/command";

export type InteractionElevationState = {
  activeNodeIds: NodeId[];
  originalZIndex: Record<NodeId, number>;
  elevatedZIndex: Record<NodeId, number>;
};

export type TransformStoreState = {
  activeNodeIds: NodeId[];
  gestureKind: TransformKind | null;
  previewTransforms: Record<NodeId, TransformData>;
  previewVersions: Record<NodeId, number>;
  interactionElevation: InteractionElevationState | null;
  beginTransformFromTransformSystem: (
    activeNodeIds: NodeId[],
    gestureKind: TransformKind,
    previewTransforms: Record<NodeId, TransformData>,
  ) => void;
  setPreviewTransformsFromTransformSystem: (previewTransforms: Record<NodeId, TransformData>) => void;
  clearTransformFromTransformSystem: () => void;
  beginElevationFromInteractionElevationSystem: (elevation: InteractionElevationState) => void;
  clearElevationFromInteractionElevationSystem: () => void;
  getPreviewTransformSnapshot: (nodeId: NodeId) => TransformData | undefined;
  getTransformSnapshot: () => Pick<TransformStoreState, "activeNodeIds" | "gestureKind" | "previewTransforms">;
};

const bumpPreviewVersions = (versions: Record<NodeId, number>, nodeIds: NodeId[]) => {
  const next = { ...versions };
  nodeIds.forEach((nodeId) => {
    next[nodeId] = (next[nodeId] ?? 0) + 1;
  });
  return next;
};

export const createTransformStore = () => create<TransformStoreState>()((set, get) => ({
  activeNodeIds: [],
  gestureKind: null,
  previewTransforms: {},
  previewVersions: {},
  interactionElevation: null,
  beginTransformFromTransformSystem: (activeNodeIds, gestureKind, previewTransforms) =>
    set((state) => ({
      activeNodeIds: [...activeNodeIds],
      gestureKind,
      previewTransforms: { ...previewTransforms },
      previewVersions: bumpPreviewVersions(state.previewVersions, Object.keys(previewTransforms)),
    })),
  setPreviewTransformsFromTransformSystem: (previewTransforms) =>
    set((state) => ({
      previewTransforms: { ...previewTransforms },
      previewVersions: bumpPreviewVersions(state.previewVersions, Object.keys(previewTransforms)),
    })),
  clearTransformFromTransformSystem: () =>
    set((state) => ({
      activeNodeIds: [],
      gestureKind: null,
      previewTransforms: {},
      interactionElevation: null,
      previewVersions: bumpPreviewVersions(
        state.previewVersions,
        [...Object.keys(state.previewTransforms), ...(state.interactionElevation?.activeNodeIds ?? [])],
      ),
    })),
  beginElevationFromInteractionElevationSystem: (interactionElevation) =>
    set((state) => ({
      interactionElevation: {
        activeNodeIds: [...interactionElevation.activeNodeIds],
        originalZIndex: { ...interactionElevation.originalZIndex },
        elevatedZIndex: { ...interactionElevation.elevatedZIndex },
      },
      previewVersions: bumpPreviewVersions(state.previewVersions, interactionElevation.activeNodeIds),
    })),
  clearElevationFromInteractionElevationSystem: () =>
    set((state) => ({
      interactionElevation: null,
      previewVersions: state.interactionElevation
        ? bumpPreviewVersions(state.previewVersions, state.interactionElevation.activeNodeIds)
        : state.previewVersions,
    })),
  getPreviewTransformSnapshot: (nodeId) => get().previewTransforms[nodeId],
  getTransformSnapshot: () => {
    const { activeNodeIds, gestureKind, previewTransforms } = get();
    return { activeNodeIds: [...activeNodeIds], gestureKind, previewTransforms: { ...previewTransforms } };
  },
}));

export type TransformStore = ReturnType<typeof createTransformStore>;
export const useTransformStore = createTransformStore();
