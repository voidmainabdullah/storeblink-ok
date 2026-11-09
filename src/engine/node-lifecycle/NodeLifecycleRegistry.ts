import type { ElementType, SceneNode } from "@/types";
import type { LifecycleContext, LifecycleHookName, NodeLifecycleAPI, NodeLifecycleHooks } from "./types";

export class NodeLifecycleRegistry implements NodeLifecycleAPI {
  private readonly hooks = new Map<ElementType, NodeLifecycleHooks>();

  registerLifecycle(type: ElementType, hooks: NodeLifecycleHooks): () => void {
    const current = this.hooks.get(type);
    this.hooks.set(type, { ...current, ...hooks });
    return () => {
      if (current) this.hooks.set(type, current);
      else this.hooks.delete(type);
    };
  }

  runCreate(node: SceneNode, context: LifecycleContext = {}): Promise<void> {
    return this.run("onCreate", node, context);
  }

  runMount(node: SceneNode, context: LifecycleContext = {}): Promise<void> {
    return this.run("onMount", node, context);
  }

  runUpdate(node: SceneNode, context: LifecycleContext = {}): Promise<void> {
    return this.run("onUpdate", node, context);
  }

  runMove(node: SceneNode, context: LifecycleContext = {}): Promise<void> {
    return this.run("onMove", node, context);
  }

  runClone(node: SceneNode, context: LifecycleContext = {}): Promise<void> {
    return this.run("onClone", node, context);
  }

  runDelete(node: SceneNode, context: LifecycleContext = {}): Promise<void> {
    return this.run("onDelete", node, context);
  }

  runRestore(node: SceneNode, context: LifecycleContext = {}): Promise<void> {
    return this.run("onRestore", node, context);
  }

  private async run(hookName: LifecycleHookName, node: SceneNode, context: LifecycleContext): Promise<void> {
    const hook = this.hooks.get(node.type)?.[hookName];
    if (!hook) return;
    await hook(node, context);
  }
}

export const createNodeLifecycleRegistry = () => new NodeLifecycleRegistry();
