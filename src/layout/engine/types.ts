import type { ResponsiveBreakpoint } from "@/stores/responsive.store";
import type { NodeId, SceneTree } from "@/types";

export type LayoutPassOptions = {
  breakpoint: ResponsiveBreakpoint;
  viewportWidth?: number;
  forceViewportWidth?: boolean;
};

export type LayoutComputationResult = {
  scene: SceneTree;
  breakpoint: ResponsiveBreakpoint;
  viewportWidth: number;
  touchedNodeIds: ReadonlySet<NodeId>;
};

export interface LayoutEngineAPI {
  hasGenericLayout(scene: SceneTree): boolean;
  compute(scene: SceneTree, options: LayoutPassOptions): LayoutComputationResult;
  reflowScene(scene: SceneTree): SceneTree;
  resolveSceneForViewport(scene: SceneTree, viewportWidth: number): LayoutComputationResult;
}
