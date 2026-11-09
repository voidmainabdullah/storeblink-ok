import type { z } from "zod";
import type { ElementType, SceneNode, SceneTree, StyleData } from "@/types";

export const NODE_SCHEMA_VERSION_EXTENSION_KEY = "nodeSchemaVersion";

export type NodeCapabilities = Readonly<{
  selectable: boolean;
  movable: boolean;
  resizable: boolean;
  rotatable: boolean;
  croppable: boolean;
  bindable: boolean;
  layoutContainer: boolean;
  acceptsChildren: boolean;
  supportsAutoLayout: boolean;
  supportsResponsiveOverrides: boolean;
}>;

export type NodeMigration = Readonly<{
  id: string;
  fromVersion: number;
  toVersion: number;
  migrate(node: Readonly<SceneNode>): SceneNode;
}>;

export type NodeMigrationResult = Readonly<{
  node: SceneNode;
  fromVersion: number;
  toVersion: number;
  appliedMigrationIds: readonly string[];
}>;

export type SceneNodeMigrationResult = Readonly<{
  tree: SceneTree;
  appliedMigrations: readonly Readonly<{
    nodeId: string;
    nodeType: ElementType;
    migrationIds: readonly string[];
  }>[];
}>;

export type NodeSchema<
  TProps extends Record<string, unknown> = Record<string, unknown>,
  TStyle extends StyleData = StyleData,
  TExtensions extends Record<string, unknown> = Record<string, unknown>,
> = Readonly<{
  type: ElementType | "custom:*";
  version: number;
  allowedParents: readonly string[];
  allowedChildren: readonly string[];
  defaultFactory(): SceneNode;
  propsSchema: z.ZodType<TProps>;
  styleSchema: z.ZodType<TStyle>;
  extensionSchema: z.ZodType<TExtensions>;
  responsiveProperties: readonly string[];
  capabilities: NodeCapabilities;
  migrations?: readonly NodeMigration[];
}>;

export type NodeSchemaIssue = Readonly<{
  nodeId: string;
  path: string;
  message: string;
}>;

export type NodeSchemaValidationResult = Readonly<{
  valid: boolean;
  issues: readonly NodeSchemaIssue[];
}>;

export interface NodeSchemaRegistryAPI {
  register(schema: NodeSchema): void;
  unregister(type: NodeSchema["type"]): void;
  get(type: ElementType): NodeSchema | undefined;
  require(type: ElementType): NodeSchema;
  list(): readonly NodeSchema[];
  getNodeVersion(node: SceneNode): number;
  migrateNode(node: SceneNode): NodeMigrationResult;
  migrateTree(tree: SceneTree): SceneNodeMigrationResult;
  validateNode(node: SceneNode): NodeSchemaValidationResult;
  validateRelationship(parent: SceneNode | null, child: SceneNode): NodeSchemaValidationResult;
  validateTree(tree: SceneTree): NodeSchemaValidationResult;
  assertNode(node: SceneNode): void;
  assertRelationship(parent: SceneNode | null, child: SceneNode): void;
  assertTree(tree: SceneTree): void;
}
