import { useCanvasStore, type CanvasStore } from "@/stores/canvas.store";
import type { Rect, Size } from "@/types";
import type { CanvasAPI, CanvasGuide, CanvasSafeArea, CanvasSnapshot } from "./types";

const createGuideId = () => `canvas-guide-${Date.now()}-${Math.random().toString(36).slice(2)}`;

export class CanvasSystem implements CanvasAPI {
  constructor(private readonly store: CanvasStore = useCanvasStore) {}

  setCanvasSize(size: Size): void {
    if (size.width <= 0 || size.height <= 0) {
      throw new Error("Canvas size must be greater than zero.");
    }
    this.store.getState().setCanvasSizeFromCanvasSystem(size);
  }

  setBackground(background: string): void {
    this.store.getState().setCanvasBackgroundFromCanvasSystem(background);
  }

  setWorkspaceBounds(bounds: Rect): void {
    if (bounds.width <= 0 || bounds.height <= 0) {
      throw new Error("Workspace bounds must be greater than zero.");
    }
    this.store.getState().setWorkspaceBoundsFromCanvasSystem(bounds);
  }

  toggleGrid(force?: boolean): void {
    const state = this.store.getState();
    state.setGridVisibleFromCanvasSystem(force ?? !state.gridVisible);
  }

  toggleRulers(force?: boolean): void {
    const state = this.store.getState();
    state.setRulerVisibleFromCanvasSystem(force ?? !state.rulerVisible);
  }

  addGuide(axis: CanvasGuide["axis"], position: number): CanvasGuide {
    const guide = { id: createGuideId(), axis, position };
    this.store.getState().addGuideFromCanvasSystem(guide);
    return guide;
  }

  removeGuide(guideId: string): void {
    this.store.getState().removeGuideFromCanvasSystem(guideId);
  }

  clearGuides(): void {
    this.store.getState().clearGuidesFromCanvasSystem();
  }

  addSafeArea(safeArea: CanvasSafeArea): void {
    this.store.getState().addSafeAreaFromCanvasSystem(safeArea);
  }

  getSafeArea(): CanvasSafeArea {
    return this.store.getState().getSafeAreaSnapshot();
  }

  getSnapshot(): CanvasSnapshot {
    return this.store.getState().getCanvasSnapshot();
  }
}

export const createCanvasSystem = (store?: CanvasStore) => new CanvasSystem(store);

export const canvasSystem = createCanvasSystem();
