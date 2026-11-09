import { z } from "zod";
import type { Project, SceneNode, SceneTree } from "@/types";
import {
  importedDataSchema,
  projectSchema,
  sceneNodeSchema,
  sceneTreeSchema,
  validateSceneTreeStructure,
} from "./schemas";
import { normalizeSceneSvgContent, normalizeSvgNode } from "./safeSvg";

export * from "./schemas";
export * from "./safeSvg";

export const validateSceneNode = (value: unknown): SceneNode =>
  normalizeSvgNode(sceneNodeSchema.parse(value) as SceneNode);

export const validateSceneTree = (value: unknown): SceneTree =>
  normalizeSceneSvgContent(sceneTreeSchema.parse(value) as SceneTree);

export const validateProject = (value: unknown): Project => projectSchema.parse(value) as Project;

export const validateImportedData = (value: unknown): Project | SceneTree | SceneNode => {
  const parsed = importedDataSchema.parse(value) as Project | SceneTree | SceneNode;
  if ("rootNodeId" in parsed && "nodes" in parsed) return normalizeSceneSvgContent(parsed);
  if ("type" in parsed && "props" in parsed) return normalizeSvgNode(parsed);
  return parsed;
};

export const formatValidationError = (error: unknown): string => {
  if (error instanceof z.ZodError) {
    return error.issues.map((issue) => issue.message).join("; ");
  }
  return error instanceof Error ? error.message : "Unknown validation error";
};

export const assertValidSceneTreeStructure = (tree: SceneTree): void => {
  const result = validateSceneTreeStructure(tree);
  if (!result.valid) throw new Error(result.errors.join("; "));
};
