import type { Point, Rect, Size } from "@/types";

export type CanvasGuide = {
  id: string;
  axis: "x" | "y";
  position: number;
};

export type CanvasSafeArea = Rect;

export type CanvasSnapshot = {
  size: Size;
  background: string;
  workspaceBounds: Rect;
  gridVisible: boolean;
  rulerVisible: boolean;
  guides: CanvasGuide[];
  safeAreas: CanvasSafeArea[];
};

export type CanvasAPI = {
  setCanvasSize(size: Size): void;
  setBackground(background: string): void;
  setWorkspaceBounds(bounds: Rect): void;
  toggleGrid(force?: boolean): void;
  toggleRulers(force?: boolean): void;
  addGuide(axis: CanvasGuide["axis"], position: number): CanvasGuide;
  removeGuide(guideId: string): void;
  clearGuides(): void;
  addSafeArea(safeArea: CanvasSafeArea): void;
  getSafeArea(): CanvasSafeArea;
  getSnapshot(): CanvasSnapshot;
};

export type CanvasGridStyle = {
  backgroundImage: string;
  backgroundSize: string;
  backgroundPosition: string;
};

export type CanvasViewportFrame = {
  pan: Point;
  zoom: number;
};
