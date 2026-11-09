import type { Command } from "@/engine/command/types";
import type { NodeId, SceneNode, SceneTree } from "@/types";

export type InsertCommandPayload = {
  parentId: NodeId | null;
  nodes: SceneNode[];
};

const cloneTree = (tree: SceneTree): SceneTree => JSON.parse(JSON.stringify(tree)) as SceneTree;
const cloneNodes = (nodes: SceneNode[]): SceneNode[] => JSON.parse(JSON.stringify(nodes)) as SceneNode[];

export const createInsertCommand = (nodes: SceneNode[], parentId: NodeId | null): Command<InsertCommandPayload> => {
  const insertedNodes = cloneNodes(nodes);
  let beforeTree: SceneTree | null = null;
  let afterTree: SceneTree | null = null;
  return {
    id: `insert-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    type: "node:insert",
    label: insertedNodes.length === 1 ? "Insert node" : `Insert ${insertedNodes.length} nodes`,
    timestamp: Date.now(),
    payload: { parentId, nodes: insertedNodes },
    execute: (ctx) => {
      if (!beforeTree) {
        beforeTree = ctx.sceneGraph.serializeTree();
        afterTree = cloneTree(beforeTree);
        const insertedIds = new Set(insertedNodes.map((node) => node.id));
        const rootIds = insertedNodes.filter((node) => !node.parentId || !insertedIds.has(node.parentId)).map((node) => node.id);
        insertedNodes.forEach((node) => {
          afterTree!.nodes[node.id] = {
            ...node,
            parentId: rootIds.includes(node.id) ? parentId : node.parentId,
          };
        });
        if (parentId) {
          const parent = afterTree!.nodes[parentId];
          if (!parent) throw new Error(`Parent node ${parentId} does not exist.`);
          parent.childIds = [...parent.childIds, ...rootIds];
        } else {
          if (rootIds.length !== 1) throw new Error("Root insert requires exactly one root node.");
          afterTree!.rootNodeId = rootIds[0];
        }
      }
      if (afterTree) ctx.sceneGraph.deserializeTree(afterTree);
    },
    undo: (ctx) => {
      if (beforeTree) ctx.sceneGraph.deserializeTree(beforeTree);
    },
  };
};
