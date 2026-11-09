import type { Point, Rect, SceneNode } from "@/types";
import type { SceneGraphAPI } from "@/engine/scene-graph";
import { applyMatrix, composeMatrix, type Matrix2D } from "./matrix";

export type Polygon = [Point, Point, Point, Point];

export const getLocalCorners = (node: SceneNode): Polygon => [
  { x: 0, y: 0 },
  { x: node.transform.width, y: 0 },
  { x: node.transform.width, y: node.transform.height },
  { x: 0, y: node.transform.height },
];

export const polygonToAABB = (polygon: readonly Point[]): Rect => {
  const xs = polygon.map((point) => point.x);
  const ys = polygon.map((point) => point.y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
};

export const getTransformedOBB = (node: SceneNode, matrix: Matrix2D): Polygon =>
  getLocalCorners(node).map((point) => applyMatrix(matrix, point)) as Polygon;

export const getOBB = (node: SceneNode): Polygon => getTransformedOBB(node, composeMatrix(node.transform));

export const getAABB = (node: SceneNode): Rect => polygonToAABB(getOBB(node));

export const unionBounds = (rects: Rect[]): Rect => {
  if (!rects.length) return { x: 0, y: 0, width: 0, height: 0 };

  const minX = Math.min(...rects.map((rect) => rect.x));
  const minY = Math.min(...rects.map((rect) => rect.y));
  const maxX = Math.max(...rects.map((rect) => rect.x + rect.width));
  const maxY = Math.max(...rects.map((rect) => rect.y + rect.height));

  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
};

export const getChildrenBounds = (node: SceneNode, sceneGraph: SceneGraphAPI): Rect => {
  const childBounds = sceneGraph.getChildren(node.id).map(getAABB);
  return unionBounds(childBounds);
};
