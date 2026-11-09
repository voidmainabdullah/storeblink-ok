import type { NodeId, Point, Rect, Size } from "@/types";

export type ViewportSnapshot = {
  zoom: number;
  pan: Point;
  viewportSize: Size;
};

export type ContentBoundsResolver = (nodeIds?: NodeId[]) => Rect | null;

export type ViewportAPI = {
  zoomTo(level: number, origin?: Point): void;
  panBy(delta: Point): void;
  panTo(point: Point): void;
  setViewportSize(size: Size): void;
  getVisibleRegion(): Rect;
  screenToDocument(point: Point): Point;
  documentToScreen(point: Point): Point;
  fitToContent(nodeIds?: NodeId[]): void;
  fitToWidth(nodeIds?: NodeId[], padding?: number): void;
  getSnapshot(): ViewportSnapshot;
};
