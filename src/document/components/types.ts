import type {
  ComponentDefinition,
  ComponentNodeOverride,
  ComponentOverrideScope,
  SceneTree,
} from "@/types";

export type ComponentSceneResult = {
  scene: SceneTree;
  definition?: ComponentDefinition;
  instanceRootId?: string;
};

export type ComponentImpact = {
  definitionId: string;
  instanceCount: number;
  pageCount: number;
  pages: Array<{
    pageId: string;
    instanceIds: string[];
  }>;
};

export type CreateComponentOptions = {
  name?: string;
  definitionId?: string;
  defaultVariantId?: string;
};

export type InstantiateComponentOptions = {
  x?: number;
  y?: number;
  zIndex?: number;
  index?: number;
  variantId?: string;
};

export type ComponentSystemAPI = {
  createDefinition(scene: SceneTree, nodeId: string, options?: CreateComponentOptions): ComponentSceneResult;
  createVariant(
    scene: SceneTree,
    definitionId: string,
    sourceNodeId: string,
    input: { id?: string; name: string },
  ): ComponentSceneResult;
  instantiate(
    scene: SceneTree,
    definitionId: string,
    parentId: string,
    options?: InstantiateComponentOptions,
  ): ComponentSceneResult;
  updateDefinition(scene: SceneTree, definitionId: string, variantId?: string): ComponentSceneResult;
  refreshDefinitionsFromMasters(scene: SceneTree): SceneTree;
  propagate(scene: SceneTree, definitionId: string): SceneTree;
  propagateAll(scene: SceneTree): SceneTree;
  applyOverride(scene: SceneTree, instanceRootId: string, override: ComponentNodeOverride): SceneTree;
  resetOverrides(
    scene: SceneTree,
    instanceRootId: string,
    filter?: { sourceNodeId?: string; scope?: ComponentOverrideScope },
  ): SceneTree;
  captureOverrides(scene: SceneTree, instanceRootId?: string): SceneTree;
  swapVariant(scene: SceneTree, instanceRootId: string, variantId: string): SceneTree;
  detach(scene: SceneTree, instanceRootId: string): SceneTree;
  getInstanceRootId(scene: SceneTree, nodeId: string): string | null;
  getImpact(
    definitionId: string,
    pages: ReadonlyArray<{ pageId: string; scene: SceneTree }>,
  ): ComponentImpact;
  assertScene(scene: SceneTree): void;
};
