import type { EngineEventBus, EngineEventMap } from "@/engine/event-bus";
import type {
  CloneNodeOptions,
  CreateSceneNodeInput,
  SceneGraphAPI,
  SceneNodePatch,
  TreeValidationResult,
} from "@/engine/scene-graph";
import { cloneSceneNode, cloneSceneTree } from "@/engine/scene-graph";
import { createSceneNode, generateNodeId } from "@/engine/scene-graph/nodeFactory";
import { validateSceneTree, validateSceneTreeStructure } from "@/engine/validation";
import type { NodeSchemaRegistryAPI } from "@/engine/node-schema";
import { createResponsiveSceneGraphView } from "@/layout/responsive";
import type { NodeId, SceneNode, SceneTree } from "@/types";
import { useSceneStore, type SceneStore } from "./scene.store";

const readOnlyError = () => new Error("SceneStoreGraphAdapter is read-only. Mutate scene.store through the engine command path.");

export class SceneStoreGraphAdapter implements SceneGraphAPI {
  constructor(protected readonly store: SceneStore = useSceneStore) {}

  createNode(_input: CreateSceneNodeInput, _parentId?: NodeId | null, _index?: number): SceneNode {
    throw readOnlyError();
  }

  deleteNode(_id: NodeId): SceneNode[] {
    throw readOnlyError();
  }

  updateNode(_id: NodeId, _patch: SceneNodePatch): SceneNode {
    throw readOnlyError();
  }

  moveNode(_id: NodeId, _newParentId: NodeId | null, _index?: number): SceneNode {
    throw readOnlyError();
  }

  cloneNode(_id: NodeId, _options?: CloneNodeOptions): SceneNode {
    throw readOnlyError();
  }

  findNode(id: NodeId): SceneNode | undefined {
    return this.getNode(id);
  }

  getNode(id: NodeId): SceneNode | undefined {
    const node = this.getTree().nodes[id];
    return node ? cloneSceneNode(node) : undefined;
  }

  traverse(visitor: (node: SceneNode) => void, startId: NodeId | null = this.getTree().rootNodeId): void {
    if (!startId) return;
    const tree = this.getTree();
    const visit = (nodeId: NodeId) => {
      const node = tree.nodes[nodeId];
      if (!node) return;
      visitor(cloneSceneNode(node));
      node.childIds.forEach(visit);
    };
    visit(startId);
  }

  getParent(id: NodeId): SceneNode | undefined {
    const parentId = this.requireNode(id).parentId;
    return parentId ? this.getNode(parentId) : undefined;
  }

  getChildren(id: NodeId): SceneNode[] {
    const tree = this.getTree();
    return this.requireNode(id).childIds.map((childId) => cloneSceneNode(tree.nodes[childId]));
  }

  getAncestors(id: NodeId): SceneNode[] {
    const tree = this.getTree();
    const ancestors: SceneNode[] = [];
    let parentId = this.requireNode(id).parentId;
    while (parentId) {
      const parent = tree.nodes[parentId];
      ancestors.push(cloneSceneNode(parent));
      parentId = parent.parentId;
    }
    return ancestors;
  }

  getDescendants(id: NodeId): SceneNode[] {
    const tree = this.getTree();
    const descendants: SceneNode[] = [];
    const visit = (nodeId: NodeId) => {
      const node = tree.nodes[nodeId];
      if (!node) return;
      for (const childId of node.childIds) {
        const child = tree.nodes[childId];
        if (!child) continue;
        descendants.push(cloneSceneNode(child));
        visit(childId);
      }
    };
    visit(id);
    return descendants;
  }

  validateTree(): TreeValidationResult {
    return validateSceneTreeStructure(this.getTree());
  }

  serializeTree(): SceneTree {
    return cloneSceneTree(this.getTree());
  }

  deserializeTree(_tree: unknown): SceneTree {
    throw readOnlyError();
  }

  private getTree(): SceneTree {
    const { rootNodeId, nodes, components } = this.store.getState();
    return { rootNodeId, nodes, ...(components ? { components } : {}) };
  }

  private requireNode(id: NodeId): SceneNode {
    const node = this.getTree().nodes[id];
    if (!node) throw new Error(`Node ${id} does not exist.`);
    return node;
  }
}

export const createSceneStoreGraph = (store: SceneStore) => new SceneStoreGraphAdapter(store);
export const sceneStoreGraph = createSceneStoreGraph(useSceneStore);
export const responsiveSceneStoreGraph = createResponsiveSceneGraphView(sceneStoreGraph);

const indexOfChild = (tree: SceneTree, parentId: NodeId | null, nodeId: NodeId): number => {
  if (!parentId) return tree.rootNodeId === nodeId ? 0 : -1;
  return tree.nodes[parentId]?.childIds.indexOf(nodeId) ?? -1;
};

const sameNodeSnapshot = (a: SceneNode, b: SceneNode): boolean => JSON.stringify(a) === JSON.stringify(b);

export class SceneStoreCommandGraph extends SceneStoreGraphAdapter {
  constructor(
    private eventBus?: EngineEventBus<EngineEventMap>,
    private nodeSchemaRegistry?: NodeSchemaRegistryAPI,
    store: SceneStore = useSceneStore,
  ) {
    super(store);
  }

  configure(options: {
    eventBus?: EngineEventBus<EngineEventMap>;
    nodeSchemaRegistry?: NodeSchemaRegistryAPI;
  } = {}): void {
    this.eventBus = options.eventBus;
    this.nodeSchemaRegistry = options.nodeSchemaRegistry ?? this.nodeSchemaRegistry;
  }

  createNode(input: CreateSceneNodeInput, parentId: NodeId | null = null, index?: number): SceneNode {
    const state = this.store.getState();
    if (parentId && !state.nodes[parentId]) throw new Error(`Parent node ${parentId} does not exist.`);
    if (parentId === null && state.rootNodeId) throw new Error("A scene tree can only have one root node.");

    const node = createSceneNode(input, parentId);
    this.nodeSchemaRegistry?.assertNode(node);
    this.nodeSchemaRegistry?.assertRelationship(parentId ? state.nodes[parentId] : null, node);
    const nextTree = validateSceneTree({
      rootNodeId: parentId === null ? node.id : state.rootNodeId,
      nodes: {
        ...state.nodes,
        [node.id]: node,
        ...(parentId
          ? {
              [parentId]: {
                ...state.nodes[parentId],
                childIds: [
                  ...state.nodes[parentId].childIds.slice(0, index ?? state.nodes[parentId].childIds.length),
                  node.id,
                  ...state.nodes[parentId].childIds.slice(index ?? state.nodes[parentId].childIds.length),
                ],
              },
            }
          : {}),
      },
      ...(state.components ? { components: state.components } : {}),
    });

    this.commitTree(nextTree);
    const created = cloneSceneNode(nextTree.nodes[node.id]);
    this.eventBus?.emit("scene:node:created", { node: created, parentId, index: index ?? null });
    return created;
  }

  deleteNode(id: NodeId): SceneNode[] {
    const state = this.store.getState();
    const node = state.nodes[id];
    if (!node) throw new Error(`Node ${id} does not exist.`);
    const deleted: SceneNode[] = [];
    const nextNodes = { ...state.nodes };
    const collect = (nodeId: NodeId) => {
      const current = nextNodes[nodeId];
      if (!current) return;
      deleted.push(cloneSceneNode(current));
      current.childIds.forEach(collect);
      delete nextNodes[nodeId];
    };
    collect(id);

    if (node.parentId && nextNodes[node.parentId]) {
      nextNodes[node.parentId] = {
        ...nextNodes[node.parentId],
        childIds: nextNodes[node.parentId].childIds.filter((childId) => childId !== id),
      };
    }
    const nextTree = validateSceneTree({
      rootNodeId: state.rootNodeId === id ? null : state.rootNodeId,
      nodes: nextNodes,
      ...(state.components ? { components: state.components } : {}),
    });

    this.commitTree(nextTree);
    deleted.forEach((deletedNode) => {
      this.eventBus?.emit("scene:node:deleted", {
        nodeId: deletedNode.id,
        node: deletedNode,
        parentId: deletedNode.parentId,
      });
    });
    return deleted;
  }

  updateNode(id: NodeId, patch: SceneNodePatch): SceneNode {
    const state = this.store.getState();
    const previousNode = state.getNodeSnapshot(id);
    const current = state.nodes[id];
    if (!previousNode || !current) throw new Error(`Node ${id} does not exist.`);

    const updatedNode: SceneNode = {
      ...current,
      ...patch,
      props: patch.props ? { ...current.props, ...patch.props } : current.props,
      style: patch.style ? { ...current.style, ...patch.style } : current.style,
      layout: patch.layout ? { ...current.layout, ...patch.layout } : current.layout,
      transform: patch.transform ? { ...current.transform, ...patch.transform } : current.transform,
      meta: { ...current.meta, ...(patch.meta ?? {}), updatedAt: Date.now() },
      extensions: patch.extensions ? { ...(current.extensions ?? {}), ...patch.extensions } : current.extensions,
      parentId: current.parentId,
      childIds: current.childIds,
      id: current.id,
    };
    this.nodeSchemaRegistry?.assertNode(updatedNode);
    this.nodeSchemaRegistry?.assertRelationship(
      updatedNode.parentId ? state.nodes[updatedNode.parentId] : null,
      updatedNode,
    );
    updatedNode.childIds.forEach((childId) =>
      this.nodeSchemaRegistry?.assertRelationship(updatedNode, state.nodes[childId]),
    );

    const nextTree = validateSceneTree({
      rootNodeId: state.rootNodeId,
      nodes: { ...state.nodes, [id]: updatedNode },
      ...(state.components ? { components: state.components } : {}),
    });

    this.commitTree(nextTree);

    const node = cloneSceneNode(nextTree.nodes[id]);
    this.eventBus?.emit("scene:node:updated", {
      nodeId: id,
      node,
      previousNode,
    });
    return node;
  }

  moveNode(id: NodeId, newParentId: NodeId | null, index?: number): SceneNode {
    const state = this.store.getState();
    const node = state.nodes[id];
    if (!node) throw new Error(`Node ${id} does not exist.`);
    if (newParentId && !state.nodes[newParentId]) throw new Error(`Parent node ${newParentId} does not exist.`);
    if (newParentId === id) throw new Error("A node cannot be moved into itself.");

    const descendants = this.getDescendants(id).map((descendant) => descendant.id);
    if (newParentId && descendants.includes(newParentId)) throw new Error("A node cannot be moved into its own descendant.");
    this.nodeSchemaRegistry?.assertRelationship(newParentId ? state.nodes[newParentId] : null, node);

    const nextNodes = { ...state.nodes };
    const previousParentId = node.parentId;
    const previousIndex = indexOfChild({ rootNodeId: state.rootNodeId, nodes: state.nodes }, previousParentId, id);

    if (previousParentId && nextNodes[previousParentId]) {
      nextNodes[previousParentId] = {
        ...nextNodes[previousParentId],
        childIds: nextNodes[previousParentId].childIds.filter((childId) => childId !== id),
      };
    }

    if (newParentId) {
      const parent = nextNodes[newParentId];
      const safeIndex = Math.max(0, Math.min(index ?? parent.childIds.length, parent.childIds.length));
      nextNodes[newParentId] = {
        ...parent,
        childIds: [...parent.childIds.slice(0, safeIndex), id, ...parent.childIds.slice(safeIndex)],
      };
    }

    nextNodes[id] = {
      ...node,
      parentId: newParentId,
      meta: { ...node.meta, updatedAt: Date.now() },
    };

    const nextTree = validateSceneTree({
      rootNodeId: state.rootNodeId,
      nodes: nextNodes,
      ...(state.components ? { components: state.components } : {}),
    });

    this.commitTree(nextTree);
    const nextIndex = indexOfChild(nextTree, newParentId, id);
    this.eventBus?.emit("scene:node:moved", { nodeId: id, previousParentId, nextParentId: newParentId, previousIndex, nextIndex });
    return cloneSceneNode(nextTree.nodes[id]);
  }

  cloneNode(id: NodeId, options: CloneNodeOptions = {}): SceneNode {
    const source = this.getNode(id);
    if (!source) throw new Error(`Node ${id} does not exist.`);
    const parentId = options.parentId === undefined ? source.parentId : options.parentId;
    if (parentId === null) throw new Error("Clone target parentId is required for root nodes.");
    const state = this.store.getState();
    this.nodeSchemaRegistry?.assertRelationship(state.nodes[parentId], source);
    const nextNodes = { ...state.nodes };
    const cloneSubtree = (node: SceneNode, nextParentId: NodeId): SceneNode => {
      const now = Date.now();
      const cloneId = options.idFactory?.(node) ?? generateNodeId(node.type.replace("custom:", "custom-"));
      const cloned: SceneNode = {
        ...cloneSceneNode(node),
        id: cloneId,
        parentId: nextParentId,
        childIds: [],
        meta: { ...node.meta, createdAt: now, updatedAt: now },
      };
      nextNodes[cloneId] = cloned;
      if (options.deep !== false) {
        node.childIds.forEach((childId) => {
          const child = state.nodes[childId];
          if (!child) return;
          const childClone = cloneSubtree(child, cloneId);
          cloned.childIds.push(childClone.id);
        });
      }
      return cloned;
    };

    const clonedRoot = cloneSubtree(source, parentId);
    const parent = nextNodes[parentId];
    const safeIndex = Math.max(0, Math.min(options.index ?? parent.childIds.length, parent.childIds.length));
    nextNodes[parentId] = {
      ...parent,
      childIds: [...parent.childIds.slice(0, safeIndex), clonedRoot.id, ...parent.childIds.slice(safeIndex)],
    };

    const nextTree = validateSceneTree({
      rootNodeId: state.rootNodeId,
      nodes: nextNodes,
      ...(state.components ? { components: state.components } : {}),
    });
    this.commitTree(nextTree);
    this.traverse((node) => {
      this.eventBus?.emit("scene:node:created", { node, parentId: node.parentId, index: null });
    }, clonedRoot.id);
    return cloneSceneNode(nextTree.nodes[clonedRoot.id]);
  }

  deserializeTree(tree: unknown): SceneTree {
    const beforeTree = this.serializeTree();
    const nextTree = validateSceneTree(tree);
    this.nodeSchemaRegistry?.assertTree(nextTree);
    this.commitTree(nextTree);
    this.emitTreeDiff(beforeTree, nextTree);
    return cloneSceneTree(nextTree);
  }

  private commitTree(nextTree: SceneTree): void {
    this.store.setState((currentState) => {
      const nodes = Object.fromEntries(
        Object.entries(nextTree.nodes).map(([nodeId, node]) => {
          const currentNode = currentState.nodes[nodeId];
          return [nodeId, currentNode && sameNodeSnapshot(currentNode, node) ? currentNode : node];
        }),
      );
      return {
        rootNodeId: nextTree.rootNodeId,
        nodes,
        components: nextTree.components,
        revision: currentState.revision + 1,
      };
    });
  }

  private emitTreeDiff(beforeTree: SceneTree, afterTree: SceneTree): void {
    if (!this.eventBus) return;
    for (const node of Object.values(beforeTree.nodes)) {
      if (!afterTree.nodes[node.id]) {
        this.eventBus.emit("scene:node:deleted", { nodeId: node.id, node: cloneSceneNode(node), parentId: node.parentId });
      }
    }
    for (const node of Object.values(afterTree.nodes)) {
      const previous = beforeTree.nodes[node.id];
      if (!previous) {
        this.eventBus.emit("scene:node:created", { node: cloneSceneNode(node), parentId: node.parentId, index: indexOfChild(afterTree, node.parentId, node.id) });
        continue;
      }
      if (previous.parentId !== node.parentId || indexOfChild(beforeTree, previous.parentId, node.id) !== indexOfChild(afterTree, node.parentId, node.id)) {
        this.eventBus.emit("scene:node:moved", {
          nodeId: node.id,
          previousParentId: previous.parentId,
          nextParentId: node.parentId,
          previousIndex: indexOfChild(beforeTree, previous.parentId, node.id),
          nextIndex: indexOfChild(afterTree, node.parentId, node.id),
        });
      }
      if (!sameNodeSnapshot(previous, node)) {
        this.eventBus.emit("scene:node:updated", { nodeId: node.id, node: cloneSceneNode(node), previousNode: cloneSceneNode(previous) });
      }
    }
  }
}

export const createSceneStoreCommandGraph = (
  store: SceneStore,
  eventBus?: EngineEventBus<EngineEventMap>,
  nodeSchemaRegistry?: NodeSchemaRegistryAPI,
) => new SceneStoreCommandGraph(eventBus, nodeSchemaRegistry, store);

export const sceneStoreCommandGraph = createSceneStoreCommandGraph(useSceneStore);
