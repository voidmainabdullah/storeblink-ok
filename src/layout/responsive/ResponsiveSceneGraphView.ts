import type {
  CloneNodeOptions,
  CreateSceneNodeInput,
  SceneGraphAPI,
  SceneNodePatch,
  TreeValidationResult,
} from "@/engine/scene-graph";
import type { NodeId, SceneNode, SceneTree } from "@/types";
import { responsiveSystem, type ResponsiveSystem } from "./ResponsiveSystem";

const readOnlyError = () =>
  new Error("ResponsiveSceneGraphView is read-only. Dispatch a Command against the source Scene Graph.");

/**
 * Resolves breakpoint overrides at the Scene Graph read boundary. Interaction
 * systems can therefore share the exact geometry used by the renderer without
 * creating a second document store or mutating persisted node data.
 */
export class ResponsiveSceneGraphView implements SceneGraphAPI {
  constructor(
    private readonly source: SceneGraphAPI,
    private readonly responsive: ResponsiveSystem = responsiveSystem,
  ) {}

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
    const node = this.source.getNode(id);
    return node ? this.responsive.resolveNode(node) : undefined;
  }

  traverse(visitor: (node: SceneNode) => void, startId?: NodeId): void {
    this.source.traverse((node) => visitor(this.responsive.resolveNode(node)), startId);
  }

  getParent(id: NodeId): SceneNode | undefined {
    const node = this.source.getParent(id);
    return node ? this.responsive.resolveNode(node) : undefined;
  }

  getChildren(id: NodeId): SceneNode[] {
    return this.source.getChildren(id).map((node) => this.responsive.resolveNode(node));
  }

  getAncestors(id: NodeId): SceneNode[] {
    return this.source.getAncestors(id).map((node) => this.responsive.resolveNode(node));
  }

  getDescendants(id: NodeId): SceneNode[] {
    return this.source.getDescendants(id).map((node) => this.responsive.resolveNode(node));
  }

  validateTree(): TreeValidationResult {
    return this.source.validateTree();
  }

  serializeTree(): SceneTree {
    const sourceTree = this.source.serializeTree();
    return {
      rootNodeId: sourceTree.rootNodeId,
      nodes: Object.fromEntries(
        Object.values(sourceTree.nodes).map((node) => {
          const resolved = this.responsive.resolveNode(node);
          return [resolved.id, resolved];
        }),
      ),
    };
  }

  deserializeTree(_tree: unknown): SceneTree {
    throw readOnlyError();
  }
}

export const createResponsiveSceneGraphView = (
  source: SceneGraphAPI,
  responsive: ResponsiveSystem = responsiveSystem,
) => new ResponsiveSceneGraphView(source, responsive);
