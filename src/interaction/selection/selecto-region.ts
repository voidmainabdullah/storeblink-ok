import type { HitTestingAPI } from "@/rendering/hit-testing";
import type { ViewportAPI } from "@/rendering/viewport";
import type { Rect } from "@/types";
import type { SelectionAPI } from "./state";

export type SelectoRect = Pick<Rect, "width" | "height"> & {
  left: number;
  top: number;
};

const normalizeRect = (rect: Rect): Rect => {
  const x = Math.min(rect.x, rect.x + rect.width);
  const y = Math.min(rect.y, rect.y + rect.height);
  return {
    x,
    y,
    width: Math.abs(rect.width),
    height: Math.abs(rect.height),
  };
};

export const selectByScreenRect = (
  screenRect: SelectoRect,
  canvasOffset: Pick<Rect, "x" | "y">,
  hitTesting: HitTestingAPI,
  viewport: Pick<ViewportAPI, "screenToDocument">,
  selection: SelectionAPI,
) => {
  const start = viewport.screenToDocument({
    x: screenRect.left - canvasOffset.x,
    y: screenRect.top - canvasOffset.y,
  });
  const end = viewport.screenToDocument({
    x: screenRect.left + screenRect.width - canvasOffset.x,
    y: screenRect.top + screenRect.height - canvasOffset.y,
  });
  const selectedIds = hitTesting.hitTestRegion(
    normalizeRect({
      x: start.x,
      y: start.y,
      width: end.x - start.x,
      height: end.y - start.y,
    }),
  );

  selection.select(selectedIds);
  return selectedIds;
};
