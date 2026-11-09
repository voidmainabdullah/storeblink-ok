import type { ElementType, SceneNode, SceneTree } from "@/types";
import type {
  NodeMigrationResult,
  NodeSchema,
  NodeSchemaIssue,
  NodeSchemaRegistryAPI,
  NodeSchemaValidationResult,
  SceneNodeMigrationResult,
} from "./types";
import { NODE_SCHEMA_VERSION_EXTENSION_KEY } from "./types";

const result = (issues: NodeSchemaIssue[]): NodeSchemaValidationResult => ({
  valid: issues.length === 0,
  issues,
});

const matchesType = (patterns: readonly string[], type: ElementType): boolean =>
  patterns.includes("*") ||
  patterns.includes(type) ||
  (type.startsWith("custom:") && patterns.includes("custom:*"));

const cloneNode = (node: SceneNode): SceneNode => structuredClone(node);

const deepFreeze = <T>(value: T): Readonly<T> => {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  Object.values(value as Record<string, unknown>).forEach((entry) => deepFreeze(entry));
  return Object.freeze(value);
};

const sameIdentity = (before: SceneNode, after: SceneNode): boolean =>
  before.id === after.id &&
  before.type === after.type &&
  before.parentId === after.parentId &&
  before.childIds.length === after.childIds.length &&
  before.childIds.every((id, index) => after.childIds[index] === id);

export class NodeSchemaValidationError extends Error {
  readonly issues: readonly NodeSchemaIssue[];

  constructor(issues: readonly NodeSchemaIssue[]) {
    super(issues.map((issue) => `${issue.nodeId}.${issue.path}: ${issue.message}`).join("\n"));
    this.name = "NodeSchemaValidationError";
    this.issues = issues;
  }
}

export class NodeSchemaRegistry implements NodeSchemaRegistryAPI {
  private readonly schemas = new Map<NodeSchema["type"], NodeSchema>();

  register(schema: NodeSchema): void {
    if (!Number.isInteger(schema.version) || schema.version < 1) {
      throw new Error(`Node schema ${schema.type} must have a positive integer version.`);
    }
    if (this.schemas.has(schema.type)) throw new Error(`Node schema ${schema.type} is already registered.`);
    const migrations = [...(schema.migrations ?? [])].sort(
      (left, right) => left.fromVersion - right.fromVersion,
    );
    const seenVersions = new Set<number>();
    const seenIds = new Set<string>();
    migrations.forEach((migration) => {
      if (!migration.id.trim()) throw new Error(`Node schema ${schema.type} has a migration without an id.`);
      if (seenIds.has(migration.id)) {
        throw new Error(`Node schema ${schema.type} has duplicate migration id ${migration.id}.`);
      }
      if (
        !Number.isInteger(migration.fromVersion) ||
        migration.fromVersion < 1 ||
        migration.toVersion !== migration.fromVersion + 1 ||
        migration.toVersion > schema.version
      ) {
        throw new Error(
          `Node migration ${migration.id} must advance one positive version and stop at schema ${schema.version}.`,
        );
      }
      if (seenVersions.has(migration.fromVersion)) {
        throw new Error(
          `Node schema ${schema.type} has multiple migrations from version ${migration.fromVersion}.`,
        );
      }
      seenIds.add(migration.id);
      seenVersions.add(migration.fromVersion);
    });
    for (let version = 1; version < schema.version; version += 1) {
      if (!seenVersions.has(version)) {
        throw new Error(`Node schema ${schema.type} is missing migration ${version} -> ${version + 1}.`);
      }
    }
    this.schemas.set(schema.type, Object.freeze(schema));
  }

  unregister(type: NodeSchema["type"]): void {
    this.schemas.delete(type);
  }

  get(type: ElementType): NodeSchema | undefined {
    return this.schemas.get(type) ?? (type.startsWith("custom:") ? this.schemas.get("custom:*") : undefined);
  }

  require(type: ElementType): NodeSchema {
    const schema = this.get(type);
    if (!schema) throw new Error(`No node schema is registered for ${type}.`);
    return schema;
  }

  list(): readonly NodeSchema[] {
    return [...this.schemas.values()];
  }

  getNodeVersion(node: SceneNode): number {
    const value = node.extensions?.[NODE_SCHEMA_VERSION_EXTENSION_KEY];
    if (value === undefined) return 1;
    if (!Number.isInteger(value) || Number(value) < 1) {
      throw new Error(
        `Node ${node.id} has invalid ${NODE_SCHEMA_VERSION_EXTENSION_KEY} ${String(value)}.`,
      );
    }
    return Number(value);
  }

  migrateNode(node: SceneNode): NodeMigrationResult {
    const schema = this.require(node.type);
    const fromVersion = this.getNodeVersion(node);
    if (fromVersion > schema.version) {
      throw new Error(
        `Node ${node.id} uses future ${node.type} schema ${fromVersion}; runtime supports ${schema.version}.`,
      );
    }
    let current = cloneNode(node);
    let version = fromVersion;
    const appliedMigrationIds: string[] = [];
    while (version < schema.version) {
      const migration = schema.migrations?.find(
        (candidate) => candidate.fromVersion === version,
      );
      if (!migration) {
        throw new Error(`Node ${node.id} is missing ${node.type} migration ${version} -> ${version + 1}.`);
      }
      const input = cloneNode(current);
      const frozenInput = deepFreeze(input);
      const migrated = migration.migrate(frozenInput);
      if (migrated === frozenInput) {
        throw new Error(`Node migration ${migration.id} must return a new node.`);
      }
      if (!sameIdentity(current, migrated)) {
        throw new Error(`Node migration ${migration.id} changed scene identity or hierarchy.`);
      }
      version = migration.toVersion;
      current = {
        ...cloneNode(migrated),
        extensions: {
          ...(migrated.extensions ?? {}),
          [NODE_SCHEMA_VERSION_EXTENSION_KEY]: version,
        },
      };
      appliedMigrationIds.push(migration.id);
    }
    if (current.extensions?.[NODE_SCHEMA_VERSION_EXTENSION_KEY] !== schema.version) {
      current = {
        ...current,
        extensions: {
          ...(current.extensions ?? {}),
          [NODE_SCHEMA_VERSION_EXTENSION_KEY]: schema.version,
        },
      };
    }
    this.assertNode(current);
    return {
      node: cloneNode(current),
      fromVersion,
      toVersion: schema.version,
      appliedMigrationIds,
    };
  }

  migrateTree(tree: SceneTree): SceneNodeMigrationResult {
    const migratedTree = structuredClone(tree);
    const appliedMigrations: Array<{
      nodeId: string;
      nodeType: ElementType;
      migrationIds: readonly string[];
    }> = [];
    Object.values(migratedTree.nodes).forEach((node) => {
      const result = this.migrateNode(node);
      migratedTree.nodes[node.id] = result.node;
      if (result.appliedMigrationIds.length) {
        appliedMigrations.push({
          nodeId: node.id,
          nodeType: node.type,
          migrationIds: result.appliedMigrationIds,
        });
      }
    });
    this.assertTree(migratedTree);
    return { tree: migratedTree, appliedMigrations };
  }

  validateNode(node: SceneNode): NodeSchemaValidationResult {
    const schema = this.get(node.type);
    if (!schema) {
      return result([{ nodeId: node.id, path: "type", message: `No schema is registered for ${node.type}.` }]);
    }
    const issues: NodeSchemaIssue[] = [];
    const rawNodeVersion = node.extensions?.[NODE_SCHEMA_VERSION_EXTENSION_KEY];
    if (
      rawNodeVersion !== undefined &&
      (!Number.isInteger(rawNodeVersion) || Number(rawNodeVersion) < 1)
    ) {
      issues.push({
        nodeId: node.id,
        path: `extensions.${NODE_SCHEMA_VERSION_EXTENSION_KEY}`,
        message: "Node schema version must be a positive integer.",
      });
    } else if (Number(rawNodeVersion ?? 1) > schema.version) {
      issues.push({
        nodeId: node.id,
        path: `extensions.${NODE_SCHEMA_VERSION_EXTENSION_KEY}`,
        message: `Node schema ${String(rawNodeVersion)} is newer than supported schema ${schema.version}.`,
      });
    }
    const validations = [
      ["props", schema.propsSchema.safeParse(node.props)],
      ["style", schema.styleSchema.safeParse(node.style)],
      ["extensions", schema.extensionSchema.safeParse(node.extensions ?? {})],
    ] as const;
    validations.forEach(([field, validation]) => {
      if (validation.success) return;
      validation.error.issues.forEach((issue) => {
        issues.push({
          nodeId: node.id,
          path: [field, ...issue.path].join("."),
          message: issue.message,
        });
      });
    });
    if (!schema.capabilities.acceptsChildren && node.childIds.length) {
      issues.push({ nodeId: node.id, path: "childIds", message: `${node.type} nodes cannot contain children.` });
    }
    return result(issues);
  }

  validateRelationship(parent: SceneNode | null, child: SceneNode): NodeSchemaValidationResult {
    const childSchema = this.get(child.type);
    if (!childSchema) return this.validateNode(child);
    const issues: NodeSchemaIssue[] = [];
    if (!parent) {
      if (!childSchema.allowedParents.includes("$root")) {
        issues.push({ nodeId: child.id, path: "parentId", message: `${child.type} cannot be a scene root.` });
      }
      return result(issues);
    }
    const parentSchema = this.get(parent.type);
    if (!parentSchema) {
      issues.push({ nodeId: parent.id, path: "type", message: `No schema is registered for ${parent.type}.` });
      return result(issues);
    }
    if (!parentSchema.capabilities.acceptsChildren || !matchesType(parentSchema.allowedChildren, child.type)) {
      issues.push({ nodeId: child.id, path: "parentId", message: `${parent.type} cannot contain ${child.type}.` });
    }
    if (!matchesType(childSchema.allowedParents, parent.type)) {
      issues.push({ nodeId: child.id, path: "parentId", message: `${child.type} cannot be placed inside ${parent.type}.` });
    }
    return result(issues);
  }

  validateTree(tree: SceneTree): NodeSchemaValidationResult {
    const issues: NodeSchemaIssue[] = [];
    Object.values(tree.nodes).forEach((node) => {
      issues.push(...this.validateNode(node).issues);
      const parent = node.parentId ? tree.nodes[node.parentId] ?? null : null;
      issues.push(...this.validateRelationship(parent, node).issues);
    });
    return result(issues);
  }

  assertNode(node: SceneNode): void {
    const validation = this.validateNode(node);
    if (!validation.valid) throw new NodeSchemaValidationError(validation.issues);
  }

  assertRelationship(parent: SceneNode | null, child: SceneNode): void {
    const validation = this.validateRelationship(parent, child);
    if (!validation.valid) throw new NodeSchemaValidationError(validation.issues);
  }

  assertTree(tree: SceneTree): void {
    const validation = this.validateTree(tree);
    if (!validation.valid) throw new NodeSchemaValidationError(validation.issues);
  }
}

export const createNodeSchemaRegistry = () => new NodeSchemaRegistry();
