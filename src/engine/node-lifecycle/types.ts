import type { ElementType, NodeId, SceneNode } from "@/types";

export type LifecycleContext = {
  parentId?: NodeId | null;
  previousParentId?: NodeId | null;
  nextParentId?: NodeId | null;
  sourceNodeId?: NodeId;
};

export type LifecycleHook = (node: SceneNode, context: Readonly<LifecycleContext>) => void | Promise<void>;

export type NodeLifecycleHooks = {
  onCreate?: LifecycleHook;
  onMount?: LifecycleHook;
  onUpdate?: LifecycleHook;
  onMove?: LifecycleHook;
  onClone?: LifecycleHook;
  onDelete?: LifecycleHook;
  onRestore?: LifecycleHook;
};

export type LifecycleHookName = keyof NodeLifecycleHooks;

export type NodeLifecycleAPI = {
  registerLifecycle(type: ElementType, hooks: NodeLifecycleHooks): () => void;
  runCreate(node: SceneNode, context?: LifecycleContext): Promise<void>;
  runMount(node: SceneNode, context?: LifecycleContext): Promise<void>;
  runUpdate(node: SceneNode, context?: LifecycleContext): Promise<void>;
  runMove(node: SceneNode, context?: LifecycleContext): Promise<void>;
  runClone(node: SceneNode, context?: LifecycleContext): Promise<void>;
  runDelete(node: SceneNode, context?: LifecycleContext): Promise<void>;
  runRestore(node: SceneNode, context?: LifecycleContext): Promise<void>;
};
