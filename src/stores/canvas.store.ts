import { create } from "zustand";
import type { Point, Rect, Size } from "@/types";

export type CanvasGuide = {
  id: string;
  axis: "x" | "y";
  position: number;
};

export type CanvasSafeArea = Rect;

export type CanvasStoreState = {
  size: Size;
  background: string;
  workspaceBounds: Rect;
  gridVisible: boolean;
  rulerVisible: boolean;
  guides: CanvasGuide[];
  safeAreas: CanvasSafeArea[];
  margins: {
    top: number;
    right: number;
    bottom: number;
    left: number;
  };
  setCanvasSizeFromCanvasSystem: (size: Size) => void;
  setCanvasBackgroundFromCanvasSystem: (background: string) => void;
  setWorkspaceBoundsFromCanvasSystem: (bounds: Rect) => void;
  setGridVisibleFromCanvasSystem: (visible: boolean) => void;
  setRulerVisibleFromCanvasSystem: (visible: boolean) => void;
  addGuideFromCanvasSystem: (guide: CanvasGuide) => void;
  removeGuideFromCanvasSystem: (guideId: string) => void;
  addSafeAreaFromCanvasSystem: (safeArea: CanvasSafeArea) => void;
  clearGuidesFromCanvasSystem: () => void;
  getSafeAreaSnapshot: () => CanvasSafeArea;
  getCanvasSnapshot: () => {
    size: Size;
    background: string;
    workspaceBounds: Rect;
    gridVisible: boolean;
    rulerVisible: boolean;
    guides: CanvasGuide[];
    safeAreas: CanvasSafeArea[];
  };
};

const defaultSize: Size = { width: 1440, height: 1200 };
const defaultOrigin: Point = { x: 0, y: 0 };

export const createCanvasStore = () => create<CanvasStoreState>()((set, get) => ({
  size: defaultSize,
  background: "#ffffff",
  workspaceBounds: { ...defaultOrigin, ...defaultSize },
  gridVisible: false,
  rulerVisible: false,
  guides: [],
  safeAreas: [{ ...defaultOrigin, ...defaultSize }],
  margins: { top: 0, right: 0, bottom: 0, left: 0 },
  setCanvasSizeFromCanvasSystem: (size) =>
    set((state) => ({
      size,
      workspaceBounds: { ...state.workspaceBounds, width: size.width, height: size.height },
      safeAreas: state.safeAreas.length ? state.safeAreas : [{ ...defaultOrigin, ...size }],
    })),
  setCanvasBackgroundFromCanvasSystem: (background) => set({ background }),
  setWorkspaceBoundsFromCanvasSystem: (workspaceBounds) => set({ workspaceBounds }),
  setGridVisibleFromCanvasSystem: (gridVisible) => set({ gridVisible }),
  setRulerVisibleFromCanvasSystem: (rulerVisible) => set({ rulerVisible }),
  addGuideFromCanvasSystem: (guide) => set((state) => ({ guides: [...state.guides, guide] })),
  removeGuideFromCanvasSystem: (guideId) =>
    set((state) => ({ guides: state.guides.filter((guide) => guide.id !== guideId) })),
  addSafeAreaFromCanvasSystem: (safeArea) => set((state) => ({ safeAreas: [...state.safeAreas, safeArea] })),
  clearGuidesFromCanvasSystem: () => set({ guides: [] }),
  getSafeAreaSnapshot: () => get().safeAreas[0] ?? { ...defaultOrigin, ...get().size },
  getCanvasSnapshot: () => {
    const { size, background, workspaceBounds, gridVisible, rulerVisible, guides, safeAreas } = get();
    return { size, background, workspaceBounds, gridVisible, rulerVisible, guides: [...guides], safeAreas: [...safeAreas] };
  },
}));

export type CanvasStore = ReturnType<typeof createCanvasStore>;
export const useCanvasStore = createCanvasStore();
