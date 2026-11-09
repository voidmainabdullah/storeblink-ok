import type { EngineEventBus, EngineEventMap } from "@/engine/event-bus";
import type { SceneGraphAPI } from "@/engine/scene-graph";
import {
  applyMatrix,
  applyMatrixToPoint,
  composeMatrix,
  identityMatrix,
  invertMatrix,
  matrixToCss,
  multiplyMatrix,
  type Matrix2D,
} from "@/rendering/geometry";
import type { NodeId, Point, SceneNode, TransformData } from "@/types";
import type { Matrix, TransformInput, ViewportTransform } from "./types";

export type { Matrix, TransformInput, ViewportTransform } from "./types";

export { applyMatrixToPoint, identityMatrix, matrixToCss };

export const multiplyMatrices = multiplyMatrix;

export const documentToScreen = (point: Point, viewport: ViewportTransform): Point => ({
  x: point.x * viewport.zoom + viewport.pan.x,
  y: point.y * viewport.zoom + viewport.pan.y,
});

export const screenToDocument = (point: Point, viewport: ViewportTransform): Point => ({
  x: (point.x - viewport.pan.x) / viewport.zoom,
  y: (point.y - viewport.pan.y) / viewport.zoom,
});

const translationMatrix = (x: number, y: number): Matrix => [1, 0, 0, 1, x, y];

const scaleMatrix = (scaleX: number, scaleY: number): Matrix => [scaleX, 0, 0, scaleY, 0, 0];

const rotationMatrix = (degrees: number): Matrix => {
  const radians = (degrees * Math.PI) / 180;
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  return [cos, sin, -sin, cos, 0, 0];
};

const skewMatrix = (skewX: number, skewY: number): Matrix => [
  1,
  Math.tan((skewY * Math.PI) / 180),
  Math.tan((skewX * Math.PI) / 180),
  1,
  0,
  0,
];

const isMatrix = (value: TransformInput): value is Matrix =>
  Array.isArray(value) && value.length === 6 && value.every((entry) => typeof entry === "number");

export const transformDataToMatrix = (transform: Partial<TransformData>): Matrix => {
  const x = transform.x ?? 0;
  const y = transform.y ?? 0;
  const scaleX = transform.scaleX ?? 1;
  const scaleY = transform.scaleY ?? 1;
  const rotation = transform.rotation ?? 0;
  const skewX = transform.skewX ?? 0;
  const skewY = transform.skewY ?? 0;
  return composeTransform(
    translationMatrix(x, y),
    rotationMatrix(rotation),
    skewMatrix(skewX, skewY),
    scaleMatrix(scaleX, scaleY),
  );
};

export const composeTransform = (...transforms: TransformInput[]): Matrix =>
  transforms.reduce<Matrix>((matrix, transform) => {
    const next = isMatrix(transform) ? transform : transformDataToMatrix(transform);
    return multiplyMatrix(matrix, next);
  }, identityMatrix());

type WorldTransformCacheEntry = {
  nodeUpdatedAt: number;
  ancestryKey: string;
  matrix: Matrix2D;
};

const worldTransformCaches = new Map<SceneGraphAPI, Map<NodeId, WorldTransformCacheEntry>>();

const cacheFor = (sceneGraph: SceneGraphAPI): Map<NodeId, WorldTransformCacheEntry> => {
  const existing = worldTransformCaches.get(sceneGraph);
  if (existing) return existing;
  const cache = new Map<NodeId, WorldTransformCacheEntry>();
  worldTransformCaches.set(sceneGraph, cache);
  return cache;
};

const getAncestry = (node: SceneNode, sceneGraph: SceneGraphAPI): SceneNode[] => [
  ...sceneGraph.getAncestors(node.id).reverse(),
  node,
];

const transformCacheKey = (transform: TransformData): string =>
  [
    transform.x,
    transform.y,
    transform.width,
    transform.height,
    transform.rotation,
    transform.scaleX,
    transform.scaleY,
    transform.skewX,
    transform.skewY,
    transform.transformOrigin[0],
    transform.transformOrigin[1],
  ].join(",");

const getAncestryKey = (node: SceneNode, sceneGraph: SceneGraphAPI): string =>
  getAncestry(node, sceneGraph)
    .map((entry) => `${entry.id}:${entry.meta.updatedAt}:${transformCacheKey(entry.transform)}`)
    .join("|");

export const clearWorldTransformCache = (nodeId?: NodeId, sceneGraph?: SceneGraphAPI): void => {
  const caches = sceneGraph
    ? [worldTransformCaches.get(sceneGraph)].filter((cache): cache is Map<NodeId, WorldTransformCacheEntry> => Boolean(cache))
    : [...worldTransformCaches.values()];
  if (nodeId) caches.forEach((cache) => cache.delete(nodeId));
  else if (sceneGraph) worldTransformCaches.delete(sceneGraph);
  else worldTransformCaches.clear();
};

export const invalidateWorldTransformSubtree = (nodeId: NodeId, sceneGraph?: SceneGraphAPI): void => {
  clearWorldTransformCache(nodeId, sceneGraph);
  if (!sceneGraph) return;
  for (const descendant of sceneGraph.getDescendants(nodeId)) {
    clearWorldTransformCache(descendant.id, sceneGraph);
  }
};

export const connectCoordinateCacheToEventBus = (
  eventBus: EngineEventBus<EngineEventMap>,
  sceneGraph: SceneGraphAPI,
): (() => void) => {
  const clearSceneCache = () => clearWorldTransformCache(undefined, sceneGraph);
  const unsubscribers = [
    eventBus.on("scene:node:created", clearSceneCache),
    eventBus.on("scene:node:updated", clearSceneCache),
    eventBus.on("scene:node:deleted", clearSceneCache),
    eventBus.on("scene:node:moved", clearSceneCache),
  ];

  return () => unsubscribers.forEach((unsubscribe) => unsubscribe());
};

export const getWorldTransformCacheSize = (): number =>
  [...worldTransformCaches.values()].reduce((size, cache) => size + cache.size, 0);

export const localToParent = (point: Point, node: SceneNode): Point =>
  applyMatrix(composeMatrix(node.transform), point);

export const parentToLocal = (point: Point, node: SceneNode): Point =>
  applyMatrix(invertMatrix(composeMatrix(node.transform)), point);

export const getWorldTransform = (node: SceneNode, sceneGraph: SceneGraphAPI): Matrix2D => {
  const worldTransformCache = cacheFor(sceneGraph);
  const ancestryKey = getAncestryKey(node, sceneGraph);
  const cached = worldTransformCache.get(node.id);
  if (cached && cached.nodeUpdatedAt === node.meta.updatedAt && cached.ancestryKey === ancestryKey) {
    return cached.matrix;
  }

  const matrix = getAncestry(node, sceneGraph).reduce<Matrix2D>(
    (accumulator, current) => multiplyMatrix(accumulator, composeMatrix(current.transform)),
    identityMatrix(),
  );

  worldTransformCache.set(node.id, { nodeUpdatedAt: node.meta.updatedAt, ancestryKey, matrix });
  return matrix;
};

export const localToWorld = (point: Point, node: SceneNode, sceneGraph: SceneGraphAPI): Point =>
  applyMatrix(getWorldTransform(node, sceneGraph), point);

export const worldToLocal = (point: Point, node: SceneNode, sceneGraph: SceneGraphAPI): Point =>
  applyMatrix(invertMatrix(getWorldTransform(node, sceneGraph)), point);
