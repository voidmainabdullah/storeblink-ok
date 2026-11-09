import type { Command } from "@/engine/command/types";
import type { NodeId, SceneTree } from "@/types";

export type DeleteCommandPayload = {
  ids: NodeId[];
};

const cloneTree = (tree: SceneTree): SceneTree => JSON.parse(JSON.stringify(tree)) as SceneTree;

const removeSubtree = (tree: SceneTree, nodeId: NodeId) => {
  const node = tree.nodes[nodeId];
  if (!node) return;
  node.childIds.forEach((childId) => removeSubtree(tree, childId));
  if (node.parentId && tree.nodes[node.parentId]) {
    tree.nodes[node.parentId] = {
      ...tree.nodes[node.parentId],
      childIds: tree.nodes[node.parentId].childIds.filter((id) => id !== nodeId),
    };
  }
  if (tree.rootNodeId === nodeId) tree.rootNodeId = null;
  delete tree.nodes[nodeId];
};

export const createDeleteCommand = (ids: NodeId[]): Command<DeleteCommandPayload> => {
  let beforeTree: SceneTree | null = null;
  let afterTree: SceneTree | null = null;
  return {
    id: `delete-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    type: "node:delete",
    label: ids.length === 1 ? "Delete node" : `Delete ${ids.length} nodes`,
    timestamp: Date.now(),
    payload: { ids },
    execute: (ctx) => {
      if (!beforeTree) {
        beforeTree = ctx.sceneGraph.serializeTree();
        afterTree = cloneTree(beforeTree);
        ids.forEach((id) => removeSubtree(afterTree!, id));
      }
      if (afterTree) ctx.sceneGraph.deserializeTree(afterTree);
    },
    undo: (ctx) => {
      if (beforeTree) ctx.sceneGraph.deserializeTree(beforeTree);
    },
  };
};
