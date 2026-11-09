import { EngineEventBus, type EngineEventMap } from "@/engine/event-bus";
import { createEmptySceneTree, type NodeId, type SceneNode, type SceneTree } from "@/types";
import { validateSceneTree, validateSceneTreeStructure } from "@/engine/validation";
import type { NodeSchemaRegistryAPI } from "@/engine/node-schema";
import { cloneSceneNode, cloneSceneTree, createSceneNode, generateNodeId } from "./nodeFactory";
import type { CloneNodeOptions, CreateSceneNodeInput, SceneGraphAPI, SceneNodePatch, TreeValidationResult } from "./types";

export type SceneGraphOptions = {
  eventBus?: EngineEventBus<EngineEventMap>;
  initialTree?: SceneTree;
  onChange?: (tree: SceneTree) => void;
  nodeSchemaRegistry?: NodeSchemaRegistryAPI;
};

export class SceneGraph implements SceneGraphAPI {
  private tree: SceneTree;
  private readonly eventBus?: EngineEventBus<EngineEventMap>;
  private readonly onChange?: (tree: SceneTree) => void;
  private readonly nodeSchemaRegistry?: NodeSchemaRegistryAPI;

  constructor(options: SceneGraphOptions = {}) {
    this.tree = options.initialTree ? validateSceneTree(options.initialTree) : createEmptySceneTree();
    this.eventBus = options.eventBus;
    this.onChange = options.onChange;
    this.nodeSchemaRegistry = options.nodeSchemaRegistry;
    this.nodeSchemaRegistry?.assertTree(this.tree);
  }

  createNode(input: CreateSceneNodeInput, parentId: NodeId | null = null, index?: number): SceneNode {
    if (parentId && !this.tree.nodes[parentId]) throw new Error(`Parent node ${parentId} does not exist.`);
    if (parentId === null && this.tree.rootNodeId) throw new Error("A scene tree can only have one root node.");
    const node = createSceneNode(input, parentId);
    this.nodeSchemaRegistry?.assertNode(node);
    this.nodeSchemaRegistry?.assertRelationship(parentId ? this.requireNode(parentId) : null, node);
    const next = cloneSceneTree(this.tree);
    next.nodes[node.id] = node;
    if (parentId) this.insertChild(next.nodes[parentId], node.id, index);
    else next.rootNodeId = node.id;
    this.commit(next);
    this.eventBus?.emit("scene:node:created", { node: cloneSceneNode(node), parentId, index: index ?? null });
    return cloneSceneNode(node);
  }

  deleteNode(id: NodeId): SceneNode[] {
    const node = this.requireNode(id);
    const deleted = [node, ...this.getDescendants(id)].map(cloneSceneNode);
    const next = cloneSceneTree(this.tree);
    const parentId = node.parentId;
    if (parentId) {
      next.nodes[parentId].childIds = next.nodes[parentId].childIds.filter((childId) => childId !== id);
    } else {
      next.rootNodeId = null;
    }
    for (const deletedNode of deleted) delete next.nodes[deletedNode.id];
    this.commit(next);
    for (const deletedNode of deleted) {
      this.eventBus?.emit("scene:node:deleted", {
        nodeId: deletedNode.id,
        node: deletedNode,
        parentId: deletedNode.parentId,
      });
    }
    return deleted;
  }

  updateNode(id: NodeId, patch: SceneNodePatch): SceneNode {
    const previousNode = this.requireNode(id);
    const next = cloneSceneTree(this.tree);
    const current = next.nodes[id];
    next.nodes[id] = {
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
    this.nodeSchemaRegistry?.assertNode(next.nodes[id]);
    this.nodeSchemaRegistry?.assertRelationship(
      next.nodes[id].parentId ? next.nodes[next.nodes[id].parentId as NodeId] : null,
      next.nodes[id],
    );
    next.nodes[id].childIds.forEach((childId) =>
      this.nodeSchemaRegistry?.assertRelationship(next.nodes[id], next.nodes[childId]),
    );
    this.commit(next);
    const updatedNode = cloneSceneNode(next.nodes[id]);
    this.eventBus?.emit("scene:node:updated", { nodeId: id, node: updatedNode, previousNode: cloneSceneNode(previousNode) });
    return updatedNode;
  }

  moveNode(id: NodeId, newParentId: NodeId | null, index?: number): SceneNode {
    const node = this.requireNode(id);
    if (newParentId && !this.tree.nodes[newParentId]) throw new Error(`Parent node ${newParentId} does not exist.`);
    if (newParentId === null && id !== this.tree.rootNodeId) throw new Error("Only the current root can have a null parent.");
    if (newParentId && this.getDescendants(id).some((descendant) => descendant.id === newParentId)) {
      throw new Error("A node cannot be moved into its own descendant.");
    }
    this.nodeSchemaRegistry?.assertRelationship(newParentId ? this.requireNode(newParentId) : null, node);

    const next = cloneSceneTree(this.tree);
    const previousParentId = node.parentId;
    const previousIndex = previousParentId ? next.nodes[previousParentId].childIds.indexOf(id) : 0;
    if (previousParentId) next.nodes[previousParentId].childIds = next.nodes[previousParentId].childIds.filter((childId) => childId !== id);
    if (newParentId) this.insertChild(next.nodes[newParentId], id, index);
    next.nodes[id] = { ...next.nodes[id], parentId: newParentId, meta: { ...next.nodes[id].meta, updatedAt: Date.now() } };
    const nextIndex = newParentId ? next.nodes[newParentId].childIds.indexOf(id) : 0;
    this.commit(next);
    this.eventBus?.emit("scene:node:moved", { nodeId: id, previousParentId, nextParentId: newParentId, previousIndex, nextIndex });
    return cloneSceneNode(next.nodes[id]);
  }

  cloneNode(id: NodeId, options: CloneNodeOptions = {}): SceneNode {
    const source = this.requireNode(id);
    const parentId = options.parentId === undefined ? source.parentId : options.parentId;
    if (parentId === null) throw new Error("Clone target parentId is required for root nodes.");
    this.nodeSchemaRegistry?.assertRelationship(this.requireNode(parentId), source);
    const next = cloneSceneTree(this.tree);
    const clonedRoot = this.cloneSubtree(next, source, parentId, options);
    this.insertChild(next.nodes[parentId], clonedRoot.id, options.index);
    this.commit(next);
    this.traverse((node) => this.eventBus?.emit("scene:node:created", { node: cloneSceneNode(node), parentId: node.parentId, index: null }), clonedRoot.id);
    return cloneSceneNode(clonedRoot);
  }

  findNode(id: NodeId): SceneNode | undefined {
    return this.getNode(id);
  }

  getNode(id: NodeId): SceneNode | undefined {
    const node = this.tree.nodes[id];
    return node ? cloneSceneNode(node) : undefined;
  }

  traverse(visitor: (node: SceneNode) => void, startId: NodeId | null = this.tree.rootNodeId): void {
    if (!startId) return;
    const node = this.tree.nodes[startId];
    if (!node) return;
    visitor(cloneSceneNode(node));
    for (const childId of node.childIds) this.traverse(visitor, childId);
  }

  getParent(id: NodeId): SceneNode | undefined {
    const parentId = this.requireNode(id).parentId;
    return parentId ? this.getNode(parentId) : undefined;
  }

  getChildren(id: NodeId): SceneNode[] {
    return this.requireNode(id).childIds.map((childId) => cloneSceneNode(this.tree.nodes[childId]));
  }

  getAncestors(id: NodeId): SceneNode[] {
    const ancestors: SceneNode[] = [];
    let parentId = this.requireNode(id).parentId;
    while (parentId) {
      const parent = this.tree.nodes[parentId];
      ancestors.push(cloneSceneNode(parent));
      parentId = parent.parentId;
    }
    return ancestors;
  }

  getDescendants(id: NodeId): SceneNode[] {
    const descendants: SceneNode[] = [];
    for (const childId of this.requireNode(id).childIds) {
      descendants.push(cloneSceneNode(this.tree.nodes[childId]), ...this.getDescendants(childId));
    }
    return descendants;
  }

  validateTree(): TreeValidationResult {
    const structural = validateSceneTreeStructure(this.tree);
    const schema = this.nodeSchemaRegistry?.validateTree(this.tree);
    return {
      valid: structural.valid && (schema?.valid ?? true),
      errors: [...structural.errors, ...(schema?.issues.map((issue) => `${issue.nodeId}.${issue.path}: ${issue.message}`) ?? [])],
    };
  }

  serializeTree(): SceneTree {
    return cloneSceneTree(this.tree);
  }

  deserializeTree(tree: unknown): SceneTree {
    const next = validateSceneTree(tree);
    this.nodeSchemaRegistry?.assertTree(next);
    this.commit(next);
    return cloneSceneTree(next);
  }

  private requireNode(id: NodeId): SceneNode {
    const node = this.tree.nodes[id];
    if (!node) throw new Error(`Node ${id} does not exist.`);
    return node;
  }

  private insertChild(parent: SceneNode, childId: NodeId, index = parent.childIds.length): void {
    const safeIndex = Math.max(0, Math.min(index, parent.childIds.length));
    parent.childIds.splice(safeIndex, 0, childId);
  }

  private cloneSubtree(tree: SceneTree, source: SceneNode, parentId: NodeId, options: CloneNodeOptions): SceneNode {
    const now = Date.now();
    const cloneId = options.idFactory?.(source) ?? generateNodeId(source.type.replace("custom:", "custom-"));
    const cloned = { ...cloneSceneNode(source), id: cloneId, parentId, childIds: [], meta: { ...source.meta, createdAt: now, updatedAt: now } };
    tree.nodes[cloneId] = cloned;
    if (options.deep !== false) {
      for (const childId of source.childIds) {
        const childClone = this.cloneSubtree(tree, this.tree.nodes[childId], cloneId, options);
        cloned.childIds.push(childClone.id);
      }
    }
    return cloned;
  }

  private commit(next: SceneTree): void {
    this.tree = validateSceneTree(next);
    this.onChange?.(this.serializeTree());
  }
}

export const createSceneGraph = (options?: SceneGraphOptions) => new SceneGraph(options);
