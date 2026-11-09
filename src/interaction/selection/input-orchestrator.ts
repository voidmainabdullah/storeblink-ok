import type { HitTestingAPI } from "@/rendering/hit-testing";
import type { ViewportAPI } from "@/rendering/viewport";
import type { Point, Rect } from "@/types";
import type { SelectionAPI } from "./state";

export type SelectionPointerInput = {
  clientX: number;
  clientY: number;
};

export type SelectionInputOrchestratorOptions = {
  selection: SelectionAPI;
  hitTesting: HitTestingAPI;
  viewport: Pick<ViewportAPI, "screenToDocument">;
  getCanvasRect: () => Pick<Rect, "x" | "y"> | null;
};

export class SelectionInputOrchestrator {
  private readonly selection: SelectionAPI;
  private readonly hitTesting: HitTestingAPI;
  private readonly viewport: Pick<ViewportAPI, "screenToDocument">;
  private readonly getCanvasRect: () => Pick<Rect, "x" | "y"> | null;

  constructor(options: SelectionInputOrchestratorOptions) {
    this.selection = options.selection;
    this.hitTesting = options.hitTesting;
    this.viewport = options.viewport;
    this.getCanvasRect = options.getCanvasRect;
  }

  pointerDown(input: SelectionPointerInput): void {
    const point = this.toDocumentPoint(input);
    if (!point) {
      this.selection.clearSelection();
      return;
    }

    const nodeId = this.hitTesting.hitTest(point);
    if (nodeId) {
      this.selection.select([nodeId]);
      return;
    }

    this.selection.clearSelection();
  }

  pointerMove(input: SelectionPointerInput): void {
    const point = this.toDocumentPoint(input);
    this.selection.setHovered(point ? this.hitTesting.hitTest(point) : null);
  }

  pointerLeave(): void {
    this.selection.setHovered(null);
  }

  private toDocumentPoint(input: SelectionPointerInput): Point | null {
    const rect = this.getCanvasRect();
    if (!rect) return null;
    return this.viewport.screenToDocument({
      x: input.clientX - rect.x,
      y: input.clientY - rect.y,
    });
  }
}

export const createSelectionInputOrchestrator = (options: SelectionInputOrchestratorOptions) =>
  new SelectionInputOrchestrator(options);
