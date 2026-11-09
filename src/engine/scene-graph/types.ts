import type {
  ElementType,
  LayoutData,
  NodeId,
  NodeMeta,
  SceneNode,
  SceneTree,
  StyleData,
  TransformData,
} from "@/types";

export type CreateSceneNodeInput = {
  id?: NodeId;
  type: ElementType;
  name: string;
  props?: Record<string, unknown>;
  style?: Partial<StyleData>;
  layout?: Partial<LayoutData>;
  transform?: Partial<TransformData>;
  meta?: Partial<NodeMeta>;
  extensions?: Record<string, unknown>;
};

export type SceneNodePatch = {
  type?: ElementType;
  name?: string;
  props?: Record<string, unknown>;
  style?: Partial<StyleData>;
  layout?: Partial<LayoutData>;
  transform?: Partial<TransformData>;
  meta?: Partial<NodeMeta>;
  extensions?: Record<string, unknown>;
};

export type CloneNodeOptions = {
  parentId?: NodeId | null;
  index?: number;
  deep?: boolean;
  idFactory?: (source: SceneNode) => NodeId;
};

export type TreeValidationResult = {
  valid: boolean;
  errors: string[];
};

export type SceneGraphAPI = {
  createNode(input: CreateSceneNodeInput, parentId?: NodeId | null, index?: number): SceneNode;
  deleteNode(id: NodeId): SceneNode[];
  updateNode(id: NodeId, patch: SceneNodePatch): SceneNode;
  moveNode(id: NodeId, newParentId: NodeId | null, index?: number): SceneNode;
  cloneNode(id: NodeId, options?: CloneNodeOptions): SceneNode;
  findNode(id: NodeId): SceneNode | undefined;
  getNode(id: NodeId): SceneNode | undefined;
  traverse(visitor: (node: SceneNode) => void, startId?: NodeId): void;
  getParent(id: NodeId): SceneNode | undefined;
  getChildren(id: NodeId): SceneNode[];
  getAncestors(id: NodeId): SceneNode[];
  getDescendants(id: NodeId): SceneNode[];
  validateTree(): TreeValidationResult;
  serializeTree(): SceneTree;
  deserializeTree(tree: unknown): SceneTree;
};
