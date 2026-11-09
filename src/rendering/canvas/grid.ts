import type { CanvasGridStyle, CanvasViewportFrame } from "./types";

export const createCanvasGridStyle = (
  frame: CanvasViewportFrame,
  gridSize = 24,
  color = "rgba(15, 23, 42, 0.08)",
): CanvasGridStyle => {
  const scaledGrid = Math.max(1, gridSize * frame.zoom);
  const xOffset = frame.pan.x % scaledGrid;
  const yOffset = frame.pan.y % scaledGrid;

  return {
    backgroundImage: `linear-gradient(${color} 1px, transparent 1px), linear-gradient(90deg, ${color} 1px, transparent 1px)`,
    backgroundSize: `${scaledGrid}px ${scaledGrid}px`,
    backgroundPosition: `${xOffset}px ${yOffset}px`,
  };
};
