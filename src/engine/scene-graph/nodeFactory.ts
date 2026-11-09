import {
  DEFAULT_LAYOUT,
  DEFAULT_STYLE,
  DEFAULT_TRANSFORM,
  createNodeMeta,
  type NodeId,
  type SceneNode,
  type SceneTree,
} from "@/types";
import type { CreateSceneNodeInput } from "./types";

export const generateNodeId = (prefix = "node"): NodeId => {
  const cryptoApi = globalThis.crypto;
  if (cryptoApi?.randomUUID) return `${prefix}-${cryptoApi.randomUUID()}`;
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
};

export const createSceneNode = (
  input: CreateSceneNodeInput,
  parentId: NodeId | null,
  timestamp = Date.now(),
): SceneNode => ({
  id: input.id ?? generateNodeId(input.type.replace("custom:", "custom-")),
  type: input.type,
  name: input.name,
  parentId,
  childIds: [],
  props: input.props ?? {},
  style: { ...DEFAULT_STYLE, ...input.style },
  layout: { ...DEFAULT_LAYOUT, ...input.layout },
  transform: { ...DEFAULT_TRANSFORM, ...input.transform },
  meta: { ...createNodeMeta(timestamp), ...input.meta, updatedAt: timestamp },
  ...(input.extensions ? { extensions: input.extensions } : {}),
});

export const cloneSceneNode = (node: SceneNode): SceneNode => ({
  ...node,
  childIds: [...node.childIds],
  props: { ...node.props },
  style: {
    ...node.style,
    fills: [...node.style.fills],
    strokes: [...node.style.strokes],
    effects: [...node.style.effects],
  },
  layout: { ...node.layout },
  transform: { ...node.transform, transformOrigin: [...node.transform.transformOrigin] },
  meta: {
    ...node.meta,
    ...(node.meta.componentInstance
      ? { componentInstance: structuredClone(node.meta.componentInstance) }
      : {}),
  },
  ...(node.extensions ? { extensions: { ...node.extensions } } : {}),
});

export const cloneSceneTree = (tree: SceneTree): SceneTree => ({
  rootNodeId: tree.rootNodeId,
  nodes: Object.fromEntries(Object.entries(tree.nodes).map(([id, node]) => [id, cloneSceneNode(node)])),
  // Component definitions are immutable and copy-on-write through ComponentSystem.
  ...(tree.components ? { components: tree.components } : {}),
});
