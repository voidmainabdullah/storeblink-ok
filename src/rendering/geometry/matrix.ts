import type { Point, TransformData } from "@/types";

export type Matrix2D = readonly [number, number, number, number, number, number];

export const identityMatrix = (): Matrix2D => [1, 0, 0, 1, 0, 0];

export const translationMatrix = (x: number, y: number): Matrix2D => [1, 0, 0, 1, x, y];

export const scaleMatrix = (scaleX: number, scaleY: number): Matrix2D => [scaleX, 0, 0, scaleY, 0, 0];

export const rotationMatrix = (degrees: number): Matrix2D => {
  const radians = (degrees * Math.PI) / 180;
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  return [cos, sin, -sin, cos, 0, 0];
};

export const skewMatrix = (skewX: number, skewY: number): Matrix2D => [
  1,
  Math.tan((skewY * Math.PI) / 180),
  Math.tan((skewX * Math.PI) / 180),
  1,
  0,
  0,
];

export const multiplyMatrix = (left: Matrix2D, right: Matrix2D): Matrix2D => [
  left[0] * right[0] + left[2] * right[1],
  left[1] * right[0] + left[3] * right[1],
  left[0] * right[2] + left[2] * right[3],
  left[1] * right[2] + left[3] * right[3],
  left[0] * right[4] + left[2] * right[5] + left[4],
  left[1] * right[4] + left[3] * right[5] + left[5],
];

export const applyMatrix = (matrix: Matrix2D, point: Point): Point => ({
  x: matrix[0] * point.x + matrix[2] * point.y + matrix[4],
  y: matrix[1] * point.x + matrix[3] * point.y + matrix[5],
});

export const applyMatrixToPoint = (point: Point, matrix: Matrix2D): Point => applyMatrix(matrix, point);

export const invertMatrix = (matrix: Matrix2D): Matrix2D => {
  const [a, b, c, d, e, f] = matrix;
  const determinant = a * d - b * c;
  if (Math.abs(determinant) < Number.EPSILON) {
    throw new Error("Matrix is not invertible.");
  }

  return [
    d / determinant,
    -b / determinant,
    -c / determinant,
    a / determinant,
    (c * f - d * e) / determinant,
    (b * e - a * f) / determinant,
  ];
};

export const composeMatrix = (transform: TransformData): Matrix2D => {
  const originX = transform.width * transform.transformOrigin[0];
  const originY = transform.height * transform.transformOrigin[1];

  return [
    translationMatrix(transform.x, transform.y),
    translationMatrix(originX, originY),
    rotationMatrix(transform.rotation),
    skewMatrix(transform.skewX, transform.skewY),
    scaleMatrix(transform.scaleX, transform.scaleY),
    translationMatrix(-originX, -originY),
  ].reduce(multiplyMatrix, identityMatrix());
};

export const matrixToCss = (matrix: Matrix2D): string =>
  `matrix(${matrix.map((value) => Number(value.toFixed(6))).join(", ")})`;
