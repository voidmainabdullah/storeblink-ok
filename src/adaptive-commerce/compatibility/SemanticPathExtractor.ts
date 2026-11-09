import {
  STOREFRONT_RESOURCE_SEMANTIC_PREFIXES,
  semanticPathSchema,
  type SemanticPath,
  type StorefrontResourceType,
} from "@/adaptive-commerce/contracts";
import { validateSceneTreeStructure } from "@/engine/validation";
import type { SceneNode, SceneTree } from "@/types";

export const SEMANTIC_PATH_EXTENSION_KEYS = {
  path: "semanticPath",
  key: "semanticKey",
  role: "semanticRole",
  canonicalSectionType: "canonicalSectionType",
  sectionType: "sectionType",
  blockType: "blockType",
  editorKind: "editorKind",
} as const;

export type SemanticPathExtractionIssue = Readonly<{
  code: "invalid-tree" | "invalid-metadata" | "unmapped" | "ambiguous";
  nodeId: string | null;
  message: string;
}>;

export type SemanticPathExtraction = Readonly<{
  resourceType: StorefrontResourceType;
  byNodeId: Readonly<Record<string, SemanticPath>>;
  byPath: Readonly<Record<string, string>>;
}>;

export class SemanticPathExtractionError extends Error {
  readonly issues: readonly SemanticPathExtractionIssue[];

  constructor(issues: readonly SemanticPathExtractionIssue[]) {
    super(issues[0]?.message ?? "Scene tree has no unambiguous semantic mapping.");
    this.name = "SemanticPathExtractionError";
    this.issues = structuredClone(issues);
  }
}

const stringExtension = (
  node: SceneNode,
  key: string,
  issues: SemanticPathExtractionIssue[],
): string | null => {
  const value = node.extensions?.[key];
  if (value === undefined) return null;
  if (typeof value !== "string" || value.trim() !== value || value.length === 0) {
    issues.push({
      code: "invalid-metadata",
      nodeId: node.id,
      message: `Node ${node.id} extension ${key} must be a non-empty, trimmed string.`,
    });
    return null;
  }
  return value;
};

const semanticSegment = (
  node: SceneNode,
  value: string | null,
  key: string,
  issues: SemanticPathExtractionIssue[],
): string | null => {
  if (value === null) return null;
  const candidate = semanticPathSchema.safeParse(`root.${value}`);
  if (!candidate.success || value.includes(".")) {
    issues.push({
      code: "invalid-metadata",
      nodeId: node.id,
      message: `Node ${node.id} extension ${key} is not a canonical semantic segment.`,
    });
    return null;
  }
  return value;
};

const inferredKey = (
  node: SceneNode,
  editorKind: string | null,
  issues: SemanticPathExtractionIssue[],
): string | null => {
  const explicit = semanticSegment(
    node,
    stringExtension(node, SEMANTIC_PATH_EXTENSION_KEYS.key, issues),
    SEMANTIC_PATH_EXTENSION_KEYS.key,
    issues,
  );
  if (explicit) return explicit;
  if (editorKind === "section" || node.type === "section") {
    const canonical = semanticSegment(
      node,
      stringExtension(node, SEMANTIC_PATH_EXTENSION_KEYS.canonicalSectionType, issues),
      SEMANTIC_PATH_EXTENSION_KEYS.canonicalSectionType,
      issues,
    );
    if (canonical) return canonical;
    return semanticSegment(
      node,
      stringExtension(node, SEMANTIC_PATH_EXTENSION_KEYS.sectionType, issues),
      SEMANTIC_PATH_EXTENSION_KEYS.sectionType,
      issues,
    );
  }
  if (editorKind === "block") {
    return semanticSegment(
      node,
      stringExtension(node, SEMANTIC_PATH_EXTENSION_KEYS.blockType, issues),
      SEMANTIC_PATH_EXTENSION_KEYS.blockType,
      issues,
    );
  }
  return semanticSegment(
    node,
    stringExtension(node, SEMANTIC_PATH_EXTENSION_KEYS.role, issues),
    SEMANTIC_PATH_EXTENSION_KEYS.role,
    issues,
  );
};

/**
 * Creates a compatibility index without using node ids, labels, or positional
 * order as semantic meaning. Missing metadata and duplicate mappings are hard
 * failures so migrations cannot silently attach merchant patches to the wrong UI.
 */
export const extractSemanticPaths = (
  tree: SceneTree,
  resourceType: StorefrontResourceType,
): SemanticPathExtraction => {
  const structural = validateSceneTreeStructure(tree);
  if (!structural.valid || !tree.rootNodeId) {
    throw new SemanticPathExtractionError(structural.errors.length
      ? structural.errors.map((message) => ({
        code: "invalid-tree" as const,
        nodeId: null,
        message,
      }))
      : [{ code: "invalid-tree", nodeId: null, message: "Semantic extraction requires a non-empty scene tree." }]);
  }

  const prefix = STOREFRONT_RESOURCE_SEMANTIC_PREFIXES[resourceType];
  const byNodeId: Record<string, SemanticPath> = {};
  const byPath: Record<string, string> = {};
  const issues: SemanticPathExtractionIssue[] = [];

  const mapNode = (
    node: SceneNode,
    parentPath: SemanticPath | null,
    parentIsRoot: boolean,
  ): void => {
    const rawExplicitPath = stringExtension(
      node,
      SEMANTIC_PATH_EXTENSION_KEYS.path,
      issues,
    );
    let path: SemanticPath | null = null;
    if (rawExplicitPath !== null) {
      const parsed = semanticPathSchema.safeParse(rawExplicitPath);
      if (!parsed.success || (
        !rawExplicitPath.startsWith(`${prefix}.`) &&
        !rawExplicitPath.startsWith("global.")
      )) {
        issues.push({
          code: "invalid-metadata",
          nodeId: node.id,
          message: `Node ${node.id} semanticPath must start with ${prefix}. or global..`,
        });
      } else {
        path = parsed.data;
      }
    } else if (node.id === tree.rootNodeId) {
      path = semanticPathSchema.parse(`${prefix}.root`);
    } else if (parentPath) {
      const editorKind = stringExtension(
        node,
        SEMANTIC_PATH_EXTENSION_KEYS.editorKind,
        issues,
      );
      const key = inferredKey(node, editorKind, issues);
      if (key) {
        const base = parentIsRoot && (editorKind === "section" || node.type === "section")
          ? prefix
          : parentPath;
        path = semanticPathSchema.parse(`${base}.${key}`);
      }
    }

    if (!path) {
      issues.push({
        code: "unmapped",
        nodeId: node.id,
        message: `Node ${node.id} has no explicit or compatible semantic mapping.`,
      });
    } else if (byPath[path]) {
      issues.push({
        code: "ambiguous",
        nodeId: node.id,
        message: `Nodes ${byPath[path]} and ${node.id} both map to ${path}.`,
      });
    } else {
      byNodeId[node.id] = path;
      byPath[path] = node.id;
    }

    node.childIds.forEach((childId) => {
      const child = tree.nodes[childId];
      if (child) mapNode(child, path, node.id === tree.rootNodeId);
    });
  };

  mapNode(tree.nodes[tree.rootNodeId], null, false);
  if (issues.length) throw new SemanticPathExtractionError(issues);
  return {
    resourceType,
    byNodeId: structuredClone(byNodeId),
    byPath: structuredClone(byPath),
  };
};
