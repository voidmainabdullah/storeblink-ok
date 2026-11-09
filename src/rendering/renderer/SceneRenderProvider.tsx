import { createContext, useContext, useMemo, type PropsWithChildren } from "react";
import type { StorefrontLinkContext } from "@/content/menus";
import type { ResponsiveBreakpoint } from "@/stores/responsive.store";
import type { NodeId, SceneTree } from "@/types";

type SceneRenderContextValue = {
  scene: SceneTree | null;
  cullingEnabled: boolean;
  interactionPreviewEnabled: boolean;
  layoutResolved: boolean;
  breakpoint: ResponsiveBreakpoint | null;
  viewportWidth: number | null;
  linkContext: StorefrontLinkContext | null;
  visibilityOverrides: Partial<Record<NodeId, boolean>>;
};

const DEFAULT_RENDER_CONTEXT: SceneRenderContextValue = {
  scene: null,
  cullingEnabled: false,
  interactionPreviewEnabled: true,
  layoutResolved: false,
  breakpoint: null,
  viewportWidth: null,
  linkContext: null,
  visibilityOverrides: {},
};

const SceneRenderContext = createContext<SceneRenderContextValue>(DEFAULT_RENDER_CONTEXT);

export type SceneRenderProviderProps = PropsWithChildren<{
  scene: SceneTree;
  cullingEnabled?: boolean;
  interactionPreviewEnabled?: boolean;
  layoutResolved?: boolean;
  breakpoint?: ResponsiveBreakpoint;
  viewportWidth?: number;
  linkContext?: StorefrontLinkContext;
  visibilityOverrides?: Partial<Record<NodeId, boolean>>;
}>;

export const SceneRenderProvider = ({
  scene,
  cullingEnabled = false,
  interactionPreviewEnabled = false,
  layoutResolved = false,
  breakpoint,
  viewportWidth,
  linkContext,
  visibilityOverrides = {},
  children,
}: SceneRenderProviderProps) => {
  const value = useMemo(
    () => ({
      scene,
      cullingEnabled,
      interactionPreviewEnabled,
      layoutResolved,
      breakpoint: breakpoint ?? null,
      viewportWidth: viewportWidth ?? null,
      linkContext: linkContext ?? null,
      visibilityOverrides,
    }),
    [breakpoint, cullingEnabled, interactionPreviewEnabled, layoutResolved, linkContext, scene, viewportWidth, visibilityOverrides],
  );

  return <SceneRenderContext.Provider value={value}>{children}</SceneRenderContext.Provider>;
};

export const useSceneRenderContext = (): SceneRenderContextValue => useContext(SceneRenderContext);
