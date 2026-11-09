import type { SceneGraphAPI } from "@/engine/scene-graph";
import { useStore } from "zustand";
import { useEditorStores } from "@/engine/kernel/useEditorStores";
import { unionBounds, type Polygon } from "@/rendering/geometry";
import { canTransformNode } from "@/interaction/transform/capabilities";
import type { Rect } from "@/types";
import { computeOverlayVisuals, polygonToSvgPoints } from "./geometry";

export type OverlayRendererProps = {
  sceneGraph: SceneGraphAPI;
};

const selectionBlue = "#0178ff";

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

const rectToPolygon = (rect: Rect): Polygon => [
  { x: rect.x, y: rect.y },
  { x: rect.x + rect.width, y: rect.y },
  { x: rect.x + rect.width, y: rect.y + rect.height },
  { x: rect.x, y: rect.y + rect.height },
];

const DimensionBadge = ({
  rect,
  documentRect,
  viewportSize,
}: {
  rect: Rect;
  documentRect: Rect;
  viewportSize: { width: number; height: number };
}) => {
  const label = `w:${Math.round(documentRect.width)} h:${Math.round(documentRect.height)}`;
  const width = Math.max(72, label.length * 7 + 16);
  const height = 24;
  const x = clamp(rect.x + rect.width / 2 - width / 2, 8, Math.max(8, viewportSize.width - width - 8));
  const below = rect.y + rect.height + 8;
  const y = below + height <= viewportSize.height - 8 ? below : Math.max(8, rect.y - height - 8);

  return (
    <g transform={`translate(${x} ${y})`} data-editor-overlay-dimensions>
      <rect width={width} height={height} rx={6} fill="#111827" />
      <text
        x={width / 2}
        y={16}
        textAnchor="middle"
        fill="#ffffff"
        fontSize={11}
        fontFamily="Inter, system-ui, sans-serif"
        fontWeight={700}
      >
        {label}
      </text>
    </g>
  );
};

const StructuredLabel = ({
  rect,
  label,
  viewportSize,
}: {
  rect: Rect;
  label: string;
  viewportSize: { width: number; height: number };
}) => {
  const width = Math.min(220, Math.max(76, label.length * 6.5 + 18));
  const height = 22;
  const x = clamp(rect.x, 6, Math.max(6, viewportSize.width - width - 6));
  const preferredY = rect.y - height;
  const y = preferredY >= 6 ? preferredY : Math.min(viewportSize.height - height - 6, rect.y + 4);
  return (
    <g transform={`translate(${x} ${y})`} data-editor-structured-label>
      <rect width={width} height={height} rx={4} fill={selectionBlue} />
      <text
        x={8}
        y={15}
        fill="#ffffff"
        fontSize={10}
        fontFamily="Inter, system-ui, sans-serif"
        fontWeight={700}
      >
        {label.length > 32 ? `${label.slice(0, 29)}...` : label}
      </text>
    </g>
  );
};

export const OverlayRenderer = ({ sceneGraph }: OverlayRendererProps) => {
  const stores = useEditorStores();
  const selectedIds = useStore(stores.selection, (state) => state.selectedIds);
  const hoveredId = useStore(stores.selection, (state) => state.hoveredId);
  const editingId = useStore(stores.selection, (state) => state.editingId);
  const previewTransforms = useStore(stores.transform, (state) => state.previewTransforms);
  const viewportSize = useStore(stores.viewport, (state) => state.viewportSize);
  const zoom = useStore(stores.viewport, (state) => state.zoom);
  const pan = useStore(stores.viewport, (state) => state.pan);
  const sceneRevision = useStore(stores.scene, (state) => state.revision);

  const visuals = computeOverlayVisuals(
    {
      selectedIds: editingId ? selectedIds.filter((nodeId) => nodeId !== editingId) : selectedIds,
      hoveredId: editingId === hoveredId ? null : hoveredId,
      previewTransforms,
    },
    sceneGraph,
    {
      documentToScreen: (point) => ({
        x: point.x * zoom + pan.x,
        y: point.y * zoom + pan.y,
      }),
    },
  );
  const hoveredVisuals = visuals.filter((visual) => visual.kind === "hovered");
  const selectedVisuals = visuals.filter((visual) => visual.kind === "selected");
  const selectedGroup =
    selectedVisuals.length > 1
      ? {
          documentRect: unionBounds(selectedVisuals.map((visual) => visual.documentRect)),
          screenRect: unionBounds(selectedVisuals.map((visual) => visual.screenRect)),
          screenPolygon: rectToPolygon(unionBounds(selectedVisuals.map((visual) => visual.screenRect))),
        }
      : null;
  const singleSelected = selectedVisuals.length === 1 ? selectedVisuals[0] : null;
  const singleSelectedNode = singleSelected ? sceneGraph.getNode(singleSelected.nodeId) : null;
  const singleSelectedLabel = singleSelectedNode?.name ?? "Page item";
  const singleTransformable = canTransformNode(singleSelectedNode);
  const transformableGroup =
    selectedVisuals.length > 1 &&
    selectedVisuals.every((visual) => {
      const node = sceneGraph.getNode(visual.nodeId);
      return canTransformNode(node);
    });

  return (
    <svg
      data-editor-overlay-root
      data-testid="selection-overlay"
      aria-hidden="true"
      width={viewportSize.width}
      height={viewportSize.height}
      data-editor-overlay-revision={sceneRevision}
      data-editor-selection-outline-owner="overlay"
      style={{
        position: "absolute",
        inset: 0,
        zIndex: 20,
        width: "100%",
        height: "100%",
        overflow: "visible",
        pointerEvents: "none",
      }}
    >
      {hoveredVisuals.map((visual) => (
        <polygon
          key={`${visual.kind}:${visual.nodeId}`}
          data-editor-overlay-node-id={visual.nodeId}
          data-editor-overlay-kind={visual.kind}
          points={polygonToSvgPoints(visual.screenPolygon)}
          fill="rgba(13, 153, 255, 0.05)"
          stroke="rgba(13, 153, 255, 0.72)"
          strokeWidth={1}
          strokeDasharray="4 4"
          vectorEffect="non-scaling-stroke"
        />
      ))}
      {selectedGroup ? (
        <g data-editor-overlay-multi-selection>
          <polygon
            data-editor-overlay-kind="selected-group"
            points={polygonToSvgPoints(selectedGroup.screenPolygon)}
            fill="rgba(13, 153, 255, 0.08)"
            stroke={selectionBlue}
            strokeWidth={2}
            vectorEffect="non-scaling-stroke"
          />
          {transformableGroup ? (
            <DimensionBadge rect={selectedGroup.screenRect} documentRect={selectedGroup.documentRect} viewportSize={viewportSize} />
          ) : (
            <StructuredLabel
              rect={selectedGroup.screenRect}
              label={`${selectedVisuals.length} items`}
              viewportSize={viewportSize}
            />
          )}
        </g>
      ) : null}
      {singleSelected ? (
        <g data-editor-overlay-single-selection>
          <polygon
            data-editor-overlay-node-id={singleSelected.nodeId}
            data-editor-overlay-kind="selected"
            points={polygonToSvgPoints(singleSelected.screenPolygon)}
            fill="none"
            stroke={selectionBlue}
            strokeWidth={2}
            vectorEffect="non-scaling-stroke"
          />
          {singleTransformable ? (
            <DimensionBadge rect={singleSelected.screenRect} documentRect={singleSelected.documentRect} viewportSize={viewportSize} />
          ) : (
            <StructuredLabel
              rect={singleSelected.screenRect}
              label={singleSelectedLabel}
              viewportSize={viewportSize}
            />
          )}
        </g>
      ) : null}
    </svg>
  );
};

OverlayRenderer.displayName = "OverlayRenderer";
