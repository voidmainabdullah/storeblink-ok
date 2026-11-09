import { createFieldUpdateCommand, dispatch, type CommandContext } from "@/engine/command";
import { sceneStoreCommandGraph, sceneStoreGraph } from "@/stores/sceneGraphAdapter";
import type { NodeId, SceneNode } from "@/types";
import { propertyRegistry, type PropertyRegistry } from "./registry";

export type MixedPropertyValue = {
  value: unknown;
  mixed: boolean;
};

export type PropertyEngineOptions = {
  registry?: PropertyRegistry;
  readContext?: CommandContext;
  commandContext?: CommandContext;
  onDispatch?: typeof dispatch;
};

const getPath = (node: SceneNode, key: string): unknown => {
  return key.split(".").reduce<unknown>((current, part) => {
    if (current == null || typeof current !== "object") return undefined;
    return (current as Record<string, unknown>)[part];
  }, node);
};

const sameValue = (a: unknown, b: unknown): boolean => JSON.stringify(a) === JSON.stringify(b);

export class PropertyEngine {
  private readonly registry: PropertyRegistry;
  private readonly readContext: CommandContext;
  private readonly commandContext: CommandContext;
  private readonly dispatchFn: typeof dispatch;

  constructor(options: PropertyEngineOptions = {}) {
    this.registry = options.registry ?? propertyRegistry;
    this.readContext = options.readContext ?? { sceneGraph: sceneStoreGraph };
    this.commandContext = options.commandContext ?? { sceneGraph: sceneStoreCommandGraph };
    this.dispatchFn = options.onDispatch ?? dispatch;
  }

  read(nodeId: NodeId, key: string): unknown {
    const node = this.getNode(nodeId);
    const value = getPath(node, key);
    return value === undefined ? this.registry.getSchema(node.type, key, node)?.defaultValue : value;
  }

  readMixed(nodeIds: NodeId[], key: string): MixedPropertyValue {
    if (nodeIds.length === 0) return { value: undefined, mixed: false };
    const [firstId, ...rest] = nodeIds;
    const first = this.read(firstId, key);
    return {
      value: first,
      mixed: rest.some((nodeId) => !sameValue(first, this.read(nodeId, key))),
    };
  }

  write(nodeIds: NodeId[], key: string, value: unknown): void {
    const nodes = nodeIds.map((nodeId) => this.getNode(nodeId));
    for (const node of nodes) {
      const schema = this.registry.getSchema(node.type, key, node);
      if (!schema) throw new Error(`Property ${key} is not registered for ${node.type}.`);
      if (!schema.validate(value)) throw new Error(`Invalid value for ${key}.`);
    }
    const changes = nodes
      .map((node) => ({ nodeId: node.id, before: this.read(node.id, key), after: value }))
      .filter((change) => !sameValue(change.before, change.after));
    if (changes.length === 0) return;
    this.dispatchFn(createFieldUpdateCommand(key, changes), this.commandContext);
  }

  private getNode(nodeId: NodeId): SceneNode {
    const node = this.readContext.sceneGraph.getNode(nodeId);
    if (!node) throw new Error(`Node ${nodeId} does not exist.`);
    return node;
  }
}

export const createPropertyEngine = (options?: PropertyEngineOptions) => new PropertyEngine(options);
export const propertyEngine = createPropertyEngine();
