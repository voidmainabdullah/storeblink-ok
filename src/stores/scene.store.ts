import { create } from "zustand";
import {
  createEmptySceneTree,
  type ComponentLibrary,
  type NodeId,
  type SceneNode,
  type SceneTree,
} from "@/types";
import { validateSceneTree } from "@/engine/validation";
import { cloneSceneNode, cloneSceneTree } from "@/engine/scene-graph";

export type SceneStoreState = {
  rootNodeId: NodeId | null;
  nodes: Record<NodeId, SceneNode>;
  components?: ComponentLibrary;
  revision: number;
  replaceSceneFromEngine: (tree: SceneTree) => void;
  clearSceneFromEngine: () => void;
  getNodeSnapshot: (id: NodeId) => SceneNode | undefined;
  getSceneSnapshot: () => SceneTree;
};

const initialTree = createEmptySceneTree();

export const createSceneStore = () => create<SceneStoreState>()((set, get) => ({
  rootNodeId: initialTree.rootNodeId,
  nodes: initialTree.nodes,
  components: initialTree.components,
  revision: 0,
  replaceSceneFromEngine: (tree) => {
    const validTree = cloneSceneTree(validateSceneTree(tree));
    set((state) => ({
      rootNodeId: validTree.rootNodeId,
      nodes: validTree.nodes,
      components: validTree.components,
      revision: state.revision + 1,
    }));
  },
  clearSceneFromEngine: () => {
    set((state) => ({ ...createEmptySceneTree(), revision: state.revision + 1 }));
  },
  getNodeSnapshot: (id) => {
    const node = get().nodes[id];
    return node ? cloneSceneNode(node) : undefined;
  },
  getSceneSnapshot: () => cloneSceneTree({
    rootNodeId: get().rootNodeId,
    nodes: get().nodes,
    ...(get().components ? { components: get().components } : {}),
  }),
}));

export type SceneStore = ReturnType<typeof createSceneStore>;
export const useSceneStore = createSceneStore();
