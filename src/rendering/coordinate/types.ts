import type { Point, TransformData } from "@/types";
import type { Matrix2D } from "@/rendering/geometry";

export type Matrix = Matrix2D;

export type ViewportTransform = {
  zoom: number;
  pan: Point;
};

export type TransformInput = Partial<TransformData> | Matrix;
