import { documentToScreen, screenToDocument } from "@/rendering/coordinate";
import { useViewportStore, type ViewportStore } from "@/stores/viewport.store";
import type { NodeId, Point, Rect, Size } from "@/types";
import type { ContentBoundsResolver, ViewportAPI, ViewportSnapshot } from "./types";

export type ViewportSystemOptions = {
  contentBoundsResolver?: ContentBoundsResolver;
  fitPadding?: number;
  store?: ViewportStore;
};

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
const finitePoint = (point: Point) => Number.isFinite(point.x) && Number.isFinite(point.y);

export class ViewportSystem implements ViewportAPI {
  private contentBoundsResolver?: ContentBoundsResolver;
  private readonly fitPadding: number;
  private readonly store: ViewportStore;

  constructor(options: ViewportSystemOptions = {}) {
    this.contentBoundsResolver = options.contentBoundsResolver;
    this.fitPadding = options.fitPadding ?? 48;
    this.store = options.store ?? useViewportStore;
  }

  configure(options: Pick<ViewportSystemOptions, "contentBoundsResolver">): void {
    this.contentBoundsResolver = options.contentBoundsResolver;
  }

  zoomTo(level: number, origin?: Point): void {
    const state = this.store.getState();
    if (!Number.isFinite(level) || level <= 0) return;
    const zoom = clamp(level, state.minZoom, state.maxZoom);
    if (!origin || !finitePoint(origin)) {
      if (Math.abs(zoom - state.zoom) < 0.000001) return;
      state.setZoomFromViewportSystem(zoom);
      return;
    }
    const documentPoint = screenToDocument(origin, state);
    const pan = {
      x: origin.x - documentPoint.x * zoom,
      y: origin.y - documentPoint.y * zoom,
    };
    if (!finitePoint(documentPoint) || !finitePoint(pan)) return;
    if (
      Math.abs(zoom - state.zoom) < 0.000001 &&
      Math.abs(pan.x - state.pan.x) < 0.000001 &&
      Math.abs(pan.y - state.pan.y) < 0.000001
    ) {
      return;
    }
    state.setViewportStateFromViewportSystem({
      zoom,
      pan,
    });
  }

  panBy(delta: Point): void {
    if (!finitePoint(delta)) return;
    const state = this.store.getState();
    state.setPanFromViewportSystem({ x: state.pan.x + delta.x, y: state.pan.y + delta.y });
  }

  panTo(point: Point): void {
    if (!finitePoint(point)) return;
    this.store.getState().setPanFromViewportSystem(point);
  }

  setViewportSize(size: Size): void {
    if (!Number.isFinite(size.width) || !Number.isFinite(size.height) || size.width <= 0 || size.height <= 0) return;
    this.store.getState().setViewportSizeFromViewportSystem(size);
  }

  getVisibleRegion(): Rect {
    return this.store.getState().getVisibleRegionSnapshot();
  }

  screenToDocument(point: Point): Point {
    return screenToDocument(point, this.store.getState());
  }

  documentToScreen(point: Point): Point {
    return documentToScreen(point, this.store.getState());
  }

  fitToContent(nodeIds?: NodeId[]): void {
    const bounds = this.contentBoundsResolver?.(nodeIds);
    if (!bounds) return;
    const state = this.store.getState();
    const availableWidth = Math.max(1, state.viewportSize.width - this.fitPadding * 2);
    const availableHeight = Math.max(1, state.viewportSize.height - this.fitPadding * 2);
    const widthZoom = availableWidth / Math.max(1, bounds.width);
    const heightZoom = availableHeight / Math.max(1, bounds.height);
    const zoom = clamp(Math.min(widthZoom, heightZoom), state.minZoom, state.maxZoom);
    const contentCenter = { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2 };
    const viewportCenter = { x: state.viewportSize.width / 2, y: state.viewportSize.height / 2 };
    state.setViewportStateFromViewportSystem({
      zoom,
      pan: {
        x: viewportCenter.x - contentCenter.x * zoom,
        y: viewportCenter.y - contentCenter.y * zoom,
      },
    });
  }

  fitToWidth(nodeIds?: NodeId[], padding = 12): void {
    const bounds = this.contentBoundsResolver?.(nodeIds);
    if (!bounds) return;
    const state = this.store.getState();
    const availableWidth = Math.max(1, state.viewportSize.width - padding * 2);
    const zoom = clamp(availableWidth / Math.max(1, bounds.width), state.minZoom, state.maxZoom);
    state.setViewportStateFromViewportSystem({
      zoom,
      pan: {
        x: (state.viewportSize.width - bounds.width * zoom) / 2 - bounds.x * zoom,
        y: padding - bounds.y * zoom,
      },
    });
  }

  getSnapshot(): ViewportSnapshot {
    return this.store.getState().getViewportSnapshot();
  }
}

export const createViewportSystem = (options?: ViewportSystemOptions) => new ViewportSystem(options);

export const viewportSystem = createViewportSystem();
