import type { SceneGraphAPI } from "@/engine/scene-graph";
import { getWorldTransform } from "@/rendering/coordinate";
import { getTransformedOBB, polygonToAABB, type Polygon } from "@/rendering/geometry";
import type { ViewportAPI } from "@/rendering/viewport";
import type { NodeId, Rect, TransformData } from "@/types";

export type OverlayKind = "selected" | "hovered";

export type OverlayVisual = {
  nodeId: NodeId;
  kind: OverlayKind;
  documentRect: Rect;
  screenRect: Rect;
  screenPolygon: Polygon;
};

export type OverlaySelectionInput = {
  selectedIds: NodeId[];
  hoveredId: NodeId | null;
  previewTransforms?: Record<NodeId, TransformData>;
};

const toOverlayVisual = (
  nodeId: NodeId,
  kind: OverlayKind,
  sceneGraph: SceneGraphAPI,
  viewport: Pick<ViewportAPI, "documentToScreen">,
  selection: OverlaySelectionInput,
): OverlayVisual | null => {
  const node = sceneGraph.getNode(nodeId);
  if (!node || node.meta.hidden) return null;

  const effectiveNode = selection.previewTransforms?.[nodeId]
    ? { ...node, transform: selection.previewTransforms[nodeId] }
    : node;
  const worldPolygon = getTransformedOBB(effectiveNode, getWorldTransform(effectiveNode, sceneGraph));
  const screenPolygon = worldPolygon.map((point) => viewport.documentToScreen(point)) as Polygon;
  return {
    nodeId,
    kind,
    documentRect: polygonToAABB(worldPolygon),
    screenPolygon,
    screenRect: polygonToAABB(screenPolygon),
  };
};

export const computeOverlayVisuals = (
  selection: OverlaySelectionInput,
  sceneGraph: SceneGraphAPI,
  viewport: Pick<ViewportAPI, "documentToScreen">,
): OverlayVisual[] => {
  const selected = selection.selectedIds
    .map((nodeId) => toOverlayVisual(nodeId, "selected", sceneGraph, viewport, selection))
    .filter((visual): visual is OverlayVisual => Boolean(visual));

  const hovered =
    selection.hoveredId && !selection.selectedIds.includes(selection.hoveredId)
      ? toOverlayVisual(selection.hoveredId, "hovered", sceneGraph, viewport, selection)
      : null;

  return hovered ? [hovered, ...selected] : selected;
};

export const polygonToSvgPoints = (polygon: Polygon): string =>
  polygon.map((point) => `${point.x.toFixed(2)},${point.y.toFixed(2)}`).join(" ");
