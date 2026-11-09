import type { Point } from "@/types";

export const add = (a: Point, b: Point): Point => ({ x: a.x + b.x, y: a.y + b.y });

export const subtract = (a: Point, b: Point): Point => ({ x: a.x - b.x, y: a.y - b.y });

export const scale = (point: Point, factor: number): Point => ({
  x: point.x * factor,
  y: point.y * factor,
});

export const distance = (a: Point, b: Point): number => {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.hypot(dx, dy);
};
