import {
  commandManager as defaultCommandManager,
  createTransformCommand,
  type CommandContext,
  type CommandManager,
  type TransformKind,
} from "@/engine/command";
import type { SceneGraphAPI } from "@/engine/scene-graph";
import { getTransformedOBB, polygonToAABB } from "@/rendering/geometry";
import { getWorldTransform } from "@/rendering/coordinate";
import { sceneStoreCommandGraph, sceneStoreGraph } from "@/stores/sceneGraphAdapter";
import { useTransformStore, type TransformStore } from "@/stores/transform.store";
import type { NodeId, Point, Rect, SceneNode, TransformData } from "@/types";
import { computeSnap, createSnapTargetIndex, type SnapTargetIndex } from "@/interaction/snap";
import { interactionElevationSystem, type InteractionElevationSystem } from "@/interaction/elevation";
import { responsiveSystem, type ResponsiveSystem } from "@/layout/responsive";

export type TransformMapDelta = {
  nodes: Record<NodeId, Partial<TransformData>>;
};

export type TransformDelta = Partial<TransformData> | Point | TransformMapDelta;

export type PreviewTransformListener = (transforms: Readonly<Record<NodeId, TransformData>>) => void;

export type TransformAPI = {
  beginTransform(ids: NodeId[], kind: TransformKind): void;
  updateTransform(delta: TransformDelta): void;
  commitTransform(): void;
  cancelTransform(): void;
  flushPreview(): void;
  getInitialTransform(nodeId: NodeId): TransformData | undefined;
  subscribePreview(listener: PreviewTransformListener): () => void;
};

export type TransformSystemOptions = {
  sceneGraph?: SceneGraphAPI;
  readSceneGraph?: SceneGraphAPI;
  commandContext?: CommandContext;
  commandManager?: CommandManager;
  gridSize?: number;
  snapThreshold?: number;
  store?: TransformStore;
  responsiveSystem?: ResponsiveSystem;
  elevationSystem?: InteractionElevationSystem;
  canTransformNode?: (node: SceneNode) => boolean;
};

const cloneTransform = (transform: TransformData): TransformData => ({
  ...transform,
  transformOrigin: [...transform.transformOrigin],
});

const isPointDelta = (delta: TransformDelta): delta is Point =>
  "x" in delta && "y" in delta && !("width" in delta) && !("height" in delta) && !("rotation" in delta);

const isTransformMapDelta = (delta: TransformDelta): delta is TransformMapDelta => "nodes" in delta;

const finiteOr = (value: number, fallback: number): number => (Number.isFinite(value) ? value : fallback);

const clampTransform = (transform: TransformData): TransformData => ({
  ...transform,
  x: finiteOr(transform.x, 0),
  y: finiteOr(transform.y, 0),
  width: Math.max(1, finiteOr(transform.width, 1)),
  height: Math.max(1, finiteOr(transform.height, 1)),
  rotation: finiteOr(transform.rotation, 0),
  scaleX: finiteOr(transform.scaleX, 1),
  scaleY: finiteOr(transform.scaleY, 1),
  skewX: finiteOr(transform.skewX, 0),
  skewY: finiteOr(transform.skewY, 0),
  zIndex: finiteOr(transform.zIndex, 0),
});

const cloneProps = (props: Record<string, unknown>) => ({ ...props });

const transformsEqual = (a: TransformData | undefined, b: TransformData | undefined): boolean =>
  Boolean(
    a &&
      b &&
      a.x === b.x &&
      a.y === b.y &&
      a.width === b.width &&
      a.height === b.height &&
      a.rotation === b.rotation &&
      a.scaleX === b.scaleX &&
      a.scaleY === b.scaleY &&
      a.skewX === b.skewX &&
      a.skewY === b.skewY &&
      a.zIndex === b.zIndex &&
      a.transformOrigin[0] === b.transformOrigin[0] &&
      a.transformOrigin[1] === b.transformOrigin[1],
  );

const scaledTextProps = (
  node: SceneNode | undefined,
  before: TransformData | undefined,
  after: TransformData | undefined,
  gestureKind: TransformKind | null,
) => {
  if (!node || node.type !== "text" || gestureKind !== "resize" || !before || !after || before.height <= 0) return null;
  const currentFontSize = Number(node.props.fontSize ?? 16);
  if (!Number.isFinite(currentFontSize) || currentFontSize <= 0) return null;
  const ratio = after.height / before.height;
  if (!Number.isFinite(ratio) || Math.abs(ratio - 1) < 0.01) return null;
  const nextFontSize = Math.max(4, Math.min(300, Math.round(currentFontSize * ratio * 100) / 100));
  return {
    before: cloneProps(node.props),
    after: { ...node.props, fontSize: nextFontSize },
  };
};

export class TransformSystem implements TransformAPI {
  private sceneGraph: SceneGraphAPI;
  private readSceneGraph: SceneGraphAPI;
  private commandContext: CommandContext;
  private commandManager: CommandManager;
  private initialTransforms: Record<NodeId, TransformData> = {};
  private pendingTransforms: Record<NodeId, TransformData> | null = null;
  private frameId: number | null = null;
  private lastPublishedTransforms: Record<NodeId, TransformData> | null = null;
  private previewListeners = new Set<PreviewTransformListener>();
  private gridSize: number;
  private snapThreshold: number;
  private snapTargets: { nodeId: NodeId; index: SnapTargetIndex } | null = null;
  private sessionGeneration = 0;
  private store: TransformStore;
  private responsiveSystem: ResponsiveSystem;
  private elevationSystem: InteractionElevationSystem;
  private canTransformNode: (node: SceneNode) => boolean;

  constructor(options: TransformSystemOptions = {}) {
    this.sceneGraph = options.sceneGraph ?? sceneStoreGraph;
    this.readSceneGraph = options.readSceneGraph ?? this.sceneGraph;
    this.commandContext = options.commandContext ?? { sceneGraph: sceneStoreCommandGraph };
    this.commandManager = options.commandManager ?? defaultCommandManager;
    this.gridSize = options.gridSize ?? 8;
    this.snapThreshold = options.snapThreshold ?? 4;
    this.store = options.store ?? useTransformStore;
    this.responsiveSystem = options.responsiveSystem ?? responsiveSystem;
    this.elevationSystem = options.elevationSystem ?? interactionElevationSystem;
    this.canTransformNode = options.canTransformNode ?? (() => true);
  }

  configure(options: TransformSystemOptions = {}): void {
    this.sceneGraph = options.sceneGraph ?? this.sceneGraph;
    this.readSceneGraph = options.readSceneGraph ?? options.sceneGraph ?? this.readSceneGraph;
    this.commandContext = options.commandContext ?? this.commandContext;
    this.commandManager = options.commandManager ?? this.commandManager;
    this.gridSize = options.gridSize ?? this.gridSize;
    this.snapThreshold = options.snapThreshold ?? this.snapThreshold;
    this.store = options.store ?? this.store;
    this.responsiveSystem = options.responsiveSystem ?? this.responsiveSystem;
    this.elevationSystem = options.elevationSystem ?? this.elevationSystem;
    this.canTransformNode = options.canTransformNode ?? this.canTransformNode;
  }

  beginTransform(ids: NodeId[], kind: TransformKind): void {
    if (this.store.getState().activeNodeIds.length) this.clear();
    this.sessionGeneration += 1;
    const sourceNodes = ids
      .map((id) => this.readSceneGraph.getNode(id))
      .filter(
        (node): node is SceneNode =>
          Boolean(
            node &&
              !node.meta.locked &&
              !node.meta.hidden &&
              this.canTransformNode(node),
          ),
      );
    const nodes = sourceNodes.map((node) =>
      this.responsiveSystem.hasOverrides(node) ? this.responsiveSystem.resolveNode(node) : node,
    );
    this.initialTransforms = Object.fromEntries(nodes.map((node) => [node.id, cloneTransform(node.transform)]));
    this.pendingTransforms = null;
    this.lastPublishedTransforms = null;
    this.snapTargets = this.createSessionSnapTargets(nodes, kind);
    this.elevationSystem.begin(nodes.map((node) => node.id), this.readSceneGraph);
    this.store
      .getState()
      .beginTransformFromTransformSystem(nodes.map((node) => node.id), kind, this.initialTransforms);
  }

  getInitialTransform(nodeId: NodeId): TransformData | undefined {
    const transform = this.initialTransforms[nodeId];
    return transform ? cloneTransform(transform) : undefined;
  }

  subscribePreview(listener: PreviewTransformListener): () => void {
    this.previewListeners.add(listener);
    return () => this.previewListeners.delete(listener);
  }

  updateTransform(delta: TransformDelta): void {
    const { activeNodeIds } = this.store.getState();
    if (!activeNodeIds.length) return;
    const nextTransforms: Record<NodeId, TransformData> = {};
    const snapDelta = this.getSnapDelta(activeNodeIds, delta);

    activeNodeIds.forEach((nodeId) => {
      const initial = this.initialTransforms[nodeId];
      if (!initial) return;
      if (isTransformMapDelta(delta)) {
        nextTransforms[nodeId] = clampTransform({ ...initial, ...(delta.nodes[nodeId] ?? {}) });
        return;
      }
      if (isPointDelta(delta)) {
        nextTransforms[nodeId] = clampTransform({
          ...initial,
          x: initial.x + delta.x + snapDelta.x,
          y: initial.y + delta.y + snapDelta.y,
        });
        return;
      }

      nextTransforms[nodeId] = clampTransform({ ...initial, ...delta });
    });

    this.pendingTransforms = nextTransforms;
    this.schedulePreviewFlush();
  }

  commitTransform(): void {
    this.flushPreview();
    const { activeNodeIds, gestureKind, previewTransforms } = this.store.getState().getTransformSnapshot();
    if (!gestureKind || !activeNodeIds.length) {
      this.clear();
      return;
    }
    const changes = activeNodeIds
      .map((nodeId) => {
        const before = this.initialTransforms[nodeId];
        const after = previewTransforms[nodeId];
        if (!before || !after) return null;
        const sourceNode = this.sceneGraph.getNode(nodeId);
        const interactionNode =
          sourceNode && this.responsiveSystem.hasOverrides(sourceNode)
            ? this.responsiveSystem.resolveNode(sourceNode)
            : sourceNode;
        const textProps = scaledTextProps(interactionNode, before, after, gestureKind);
        const linkedResponsiveLayout =
          sourceNode &&
          this.responsiveSystem.hasOverrides(sourceNode) &&
          sourceNode.extensions?.responsiveTransformPolicy === "linked-anchor"
            ? this.responsiveSystem.updateLinkedTransformLayout(
                sourceNode,
                this.responsiveSystem.getActiveBreakpoint(),
                before,
                after,
                this.sceneGraph,
              )
            : null;
        const responsiveLayout =
          sourceNode && this.responsiveSystem.hasOverrides(sourceNode)
            ? {
                layoutBefore: sourceNode.layout,
                layoutAfter: linkedResponsiveLayout ?? this.responsiveSystem.updateLayout(
                    sourceNode,
                    this.responsiveSystem.getActiveBreakpoint(),
                    {
                      transform: after,
                      ...(textProps ? { props: textProps.after } : {}),
                      manualTransform: true,
                    },
                  ),
              }
            : {};
        return {
          nodeId,
          before,
          after,
          ...(textProps ? { propsBefore: textProps.before, propsAfter: textProps.after } : {}),
          ...responsiveLayout,
        };
      })
      .filter((change): change is NonNullable<typeof change> => Boolean(change))
      .filter((change) => !transformsEqual(change.before, change.after) || Boolean(change.propsBefore || change.propsAfter))
      .map((change) => ({
        nodeId: change.nodeId,
        before: change.before,
        after: change.after,
        ...(change.propsBefore ? { propsBefore: change.propsBefore } : {}),
        ...(change.propsAfter ? { propsAfter: change.propsAfter } : {}),
        ...("layoutBefore" in change ? { layoutBefore: change.layoutBefore } : {}),
        ...("layoutAfter" in change ? { layoutAfter: change.layoutAfter } : {}),
      }));

    try {
      if (changes.length) {
        this.commandManager.dispatch(createTransformCommand(gestureKind, changes), this.commandContext);
      }
    } finally {
      this.clear();
    }
  }

  cancelTransform(): void {
    this.clear();
  }

  flushPreview(): void {
    const next = this.pendingTransforms;
    if (!next) return;
    this.pendingTransforms = null;

    if (this.previewMapsEqual(this.lastPublishedTransforms, next)) return;

    this.store.getState().setPreviewTransformsFromTransformSystem(next);
    this.lastPublishedTransforms = next;
    this.previewListeners.forEach((listener) => listener(next));
  }

  private getSnapDelta(activeNodeIds: NodeId[], delta: TransformDelta): Point {
    if (!isPointDelta(delta) || activeNodeIds.length !== 1) return { x: 0, y: 0 };
    const node = this.readSceneGraph.getNode(activeNodeIds[0]);
    if (!node) return { x: 0, y: 0 };
    const initial = this.initialTransforms[node.id] ?? node.transform;
    const movedNode = { ...node, transform: { ...initial, x: initial.x + delta.x, y: initial.y + delta.y } };
    const activeBounds = this.getWorldBounds(movedNode);
    const targets =
      this.snapTargets?.nodeId === node.id
        ? this.snapTargets.index
        : createSnapTargetIndex(
            this.readSceneGraph
              .getChildren(node.parentId ?? node.id)
              .filter((sibling) => sibling.id !== node.id && !sibling.meta.hidden)
              .map((sibling) => this.getWorldBounds(sibling)),
          );
    return computeSnap(activeBounds, targets, this.gridSize, this.snapThreshold).snappedDelta;
  }

  private createSessionSnapTargets(nodes: SceneNode[], kind: TransformKind) {
    if (kind !== "move" || nodes.length !== 1) return null;
    const node = nodes[0];
    const siblingBounds = this.readSceneGraph
      .getChildren(node.parentId ?? node.id)
      .filter((sibling) => sibling.id !== node.id && !sibling.meta.hidden)
      .map((sibling) => this.getWorldBounds(sibling));
    return { nodeId: node.id, index: createSnapTargetIndex(siblingBounds) };
  }

  private getWorldBounds(node: SceneNode): Rect {
    return polygonToAABB(getTransformedOBB(node, getWorldTransform(node, this.readSceneGraph)));
  }

  private schedulePreviewFlush(): void {
    if (typeof window === "undefined") {
      this.flushPreview();
      return;
    }

    // A single frame gate is the only publication clock. Pointer events may
    // arrive faster than refresh rate; each event replaces pendingTransforms,
    // so renderer, overlay, guides and labels consume the newest absolute
    // transform exactly once before the next paint.
    if (this.frameId !== null) return;
    const generation = this.sessionGeneration;
    this.frameId = window.requestAnimationFrame(() => {
      this.frameId = null;
      if (generation !== this.sessionGeneration) return;
      this.flushPreview();
    });
  }

  private previewMapsEqual(
    previous: Record<NodeId, TransformData> | null,
    next: Record<NodeId, TransformData>,
  ): boolean {
    if (!previous) return false;
    const previousIds = Object.keys(previous);
    const nextIds = Object.keys(next);
    if (previousIds.length !== nextIds.length) return false;
    return nextIds.every((nodeId) => transformsEqual(previous[nodeId], next[nodeId]));
  }

  private clear(): void {
    if (this.frameId !== null && typeof window !== "undefined") {
      window.cancelAnimationFrame(this.frameId);
      this.frameId = null;
    }
    this.pendingTransforms = null;
    this.lastPublishedTransforms = null;
    this.initialTransforms = {};
    this.snapTargets = null;
    this.sessionGeneration += 1;
    this.elevationSystem.clear();
    this.store.getState().clearTransformFromTransformSystem();
  }
}

export const createTransformSystem = (options?: TransformSystemOptions) => new TransformSystem(options);

export const transformSystem = createTransformSystem();
