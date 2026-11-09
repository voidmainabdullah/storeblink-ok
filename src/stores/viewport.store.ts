import { create } from "zustand";
import type { Point, Rect, Size } from "@/types";

export type ViewportStoreState = {
  zoom: number;
  pan: Point;
  viewportSize: Size;
  minZoom: number;
  maxZoom: number;
  setZoomFromViewportSystem: (zoom: number) => void;
  setPanFromViewportSystem: (pan: Point) => void;
  setViewportSizeFromViewportSystem: (size: Size) => void;
  setViewportStateFromViewportSystem: (state: Partial<Pick<ViewportStoreState, "zoom" | "pan" | "viewportSize">>) => void;
  getViewportSnapshot: () => {
    zoom: number;
    pan: Point;
    viewportSize: Size;
  };
  getVisibleRegionSnapshot: () => Rect;
};

export const createViewportStore = () => create<ViewportStoreState>()((set, get) => ({
  zoom: 1,
  pan: { x: 0, y: 0 },
  viewportSize: { width: 1024, height: 768 },
  minZoom: 0.1,
  maxZoom: 4,
  setZoomFromViewportSystem: (zoom) => set({ zoom }),
  setPanFromViewportSystem: (pan) => set({ pan }),
  setViewportSizeFromViewportSystem: (viewportSize) => set({ viewportSize }),
  setViewportStateFromViewportSystem: (state) => set(state),
  getViewportSnapshot: () => {
    const { zoom, pan, viewportSize } = get();
    return { zoom, pan, viewportSize };
  },
  getVisibleRegionSnapshot: () => {
    const { zoom, pan, viewportSize } = get();
    return {
      x: -pan.x / zoom,
      y: -pan.y / zoom,
      width: viewportSize.width / zoom,
      height: viewportSize.height / zoom,
    };
  },
}));

export type ViewportStore = ReturnType<typeof createViewportStore>;
export const useViewportStore = createViewportStore();
