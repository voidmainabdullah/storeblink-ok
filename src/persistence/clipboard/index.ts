import type { CommandContext } from "@/engine/command";
import { validateSceneNode } from "@/engine/validation";
import { useClipboardStore } from "@/stores/clipboard.store";
import type { NodeId, SceneNode } from "@/types";

export type SerializedNode = SceneNode;

let content: SerializedNode[] | null = null;

const cloneNodes = (nodes: SerializedNode[]): SerializedNode[] => JSON.parse(JSON.stringify(nodes)) as SerializedNode[];

const collectSubtree = (id: NodeId, nodes: Record<NodeId, SceneNode>, output: SceneNode[]) => {
  const node = nodes[id];
  if (!node) return;
  output.push(JSON.parse(JSON.stringify(node)) as SceneNode);
  node.childIds.forEach((childId) => collectSubtree(childId, nodes, output));
};

export const copy = (ids: NodeId[], ctx: CommandContext): void => {
  const tree = ctx.sceneGraph.serializeTree();
  const copied: SceneNode[] = [];
  ids.forEach((id) => collectSubtree(id, tree.nodes, copied));
  content = copied.map(validateSceneNode);
  useClipboardStore.getState().setHasContent(copied.length > 0);
};

export const getContent = (): SerializedNode[] | null => (content ? cloneNodes(content) : null);
export const hasContent = (): boolean => !!content?.length;
export const clear = (): void => {
  content = null;
  useClipboardStore.getState().setHasContent(false);
};

export const cloneWithFreshIds = (
  nodes: SerializedNode[],
  createId: (source: SerializedNode) => NodeId = (source) => `${source.id}-${Date.now()}-${Math.random().toString(36).slice(2)}`,
): SerializedNode[] => {
  const idMap = new Map<NodeId, NodeId>();
  nodes.forEach((node) => idMap.set(node.id, createId(node)));
  return cloneNodes(nodes).map((node) => ({
    ...node,
    id: idMap.get(node.id)!,
    parentId: node.parentId && idMap.has(node.parentId) ? idMap.get(node.parentId)! : node.parentId,
    childIds: node.childIds.map((childId) => idMap.get(childId) ?? childId),
    meta: { ...node.meta, createdAt: Date.now(), updatedAt: Date.now() },
  }));
};

export const clipboard = {
  copy,
  getContent,
  hasContent,
  clear,
  cloneWithFreshIds,
};
