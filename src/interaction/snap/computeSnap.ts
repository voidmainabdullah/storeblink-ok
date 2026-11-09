import type { Point, Rect } from "@/types";

export type SnapGuide = {
  axis: "x" | "y";
  position: number;
  kind: "grid" | "edge" | "center";
};

export type SnapResult = {
  snappedDelta: Point;
  guides: SnapGuide[];
};

const nearestGridOffset = (value: number, gridSize: number, threshold: number): number | null => {
  if (gridSize <= 0) return null;
  const target = Math.round(value / gridSize) * gridSize;
  const offset = target - value;
  return Math.abs(offset) <= threshold ? offset : null;
};

export type SnapPosition = {
  value: number;
  kind: "edge" | "center";
};

export type SnapTargetIndex = {
  x: SnapPosition[];
  y: SnapPosition[];
};

type AxisSnap = {
  offset: number;
  kind: "edge" | "center";
};

const snapKindPriority = (kind: AxisSnap["kind"]) => (kind === "center" ? 1 : 0);

const edgeAndCenterPositions = (rect: Rect) => ({
  x: [
    { value: rect.x, kind: "edge" },
    { value: rect.x + rect.width / 2, kind: "center" },
    { value: rect.x + rect.width, kind: "edge" },
  ] satisfies SnapPosition[],
  y: [
    { value: rect.y, kind: "edge" },
    { value: rect.y + rect.height / 2, kind: "center" },
    { value: rect.y + rect.height, kind: "edge" },
  ] satisfies SnapPosition[],
});

export const createSnapTargetIndex = (bounds: Rect[]): SnapTargetIndex => {
  const positions = bounds.map(edgeAndCenterPositions);
  return {
    x: positions.flatMap((rect) => rect.x),
    y: positions.flatMap((rect) => rect.y),
  };
};

const closestOffset = (activeValues: SnapPosition[], targetValues: SnapPosition[], threshold: number): AxisSnap | null => {
  let best: AxisSnap | null = null;
  for (const active of activeValues) {
    for (const target of targetValues) {
      const offset = target.value - active.value;
      const candidate = {
          offset,
          kind: active.kind === "center" || target.kind === "center" ? "center" : "edge",
        } satisfies AxisSnap;
      if (
        Math.abs(offset) <= threshold &&
        (best === null ||
          Math.abs(offset) < Math.abs(best.offset) ||
          (Math.abs(offset) === Math.abs(best.offset) && snapKindPriority(candidate.kind) > snapKindPriority(best.kind)))
      ) {
        best = candidate;
      }
    }
  }
  return best;
};

export const computeSnap = (
  activeBounds: Rect,
  siblingBounds: Rect[] | SnapTargetIndex,
  gridSize = 8,
  threshold = 4,
): SnapResult => {
  const active = edgeAndCenterPositions(activeBounds);
  const targets = Array.isArray(siblingBounds) ? createSnapTargetIndex(siblingBounds) : siblingBounds;

  const gridX = nearestGridOffset(active.x[0].value, gridSize, threshold);
  const gridY = nearestGridOffset(active.y[0].value, gridSize, threshold);
  const objectX = closestOffset(active.x, targets.x, threshold);
  const objectY = closestOffset(active.y, targets.y, threshold);

  const x = objectX?.offset ?? gridX ?? 0;
  const y = objectY?.offset ?? gridY ?? 0;
  const guides: SnapGuide[] = [];
  if (objectX || x) guides.push({ axis: "x", position: active.x[0].value + x, kind: objectX?.kind ?? "grid" });
  if (objectY || y) guides.push({ axis: "y", position: active.y[0].value + y, kind: objectY?.kind ?? "grid" });

  return { snappedDelta: { x, y }, guides };
};
