import type { CSSProperties } from "react";
import type { StorefrontLinkContext } from "@/content/menus";
import { DynamicSourceProvider, type DynamicSourceData } from "@/document/dynamic-sources";
import { SceneRenderErrorBoundary } from "@/infrastructure/error-boundary";
import { RenderNode, SceneRenderProvider } from "@/rendering/renderer";
import type { ResponsiveBreakpoint } from "@/stores/responsive.store";
import { ExtensionSlot } from "@/theme-engine/extensions";
import type { SceneTree } from "@/types";
import { ThemeRuntimeProvider } from "./ThemeRuntimeProvider";
import { themeBrandingSystem } from "@/theme-engine/branding";

export type StorefrontRuntimeProps = {
  scene: SceneTree;
  breakpoint: ResponsiveBreakpoint;
  viewportWidth?: number;
  layoutResolved?: boolean;
  linkContext?: StorefrontLinkContext;
  dynamicData: DynamicSourceData;
  visibilityOverrides?: Record<string, boolean>;
  pageType?: string;
  storeId?: string;
  onRenderError?: () => void;
  className?: string;
  style?: CSSProperties;
};

export const themeIdForScene = (scene: SceneTree): string => {
  const root = scene.rootNodeId ? scene.nodes[scene.rootNodeId] : undefined;
  const themeId = root?.extensions?.themeId ?? root?.extensions?.template;
  return typeof themeId === "string" && themeId.trim() ? themeId : "universal";
};

export const StorefrontRuntime = ({
  scene,
  breakpoint,
  viewportWidth,
  layoutResolved = false,
  linkContext,
  dynamicData,
  visibilityOverrides = {},
  pageType,
  storeId,
  onRenderError,
  className,
  style,
}: StorefrontRuntimeProps) => {
  const rootNodeId = scene.rootNodeId;
  if (!rootNodeId) return null;
  const extensionContext = { pageType, storeId };
  const branding = themeBrandingSystem.getAppliedSettings(scene);

  return (
    <div
      data-storefront-runtime
      data-active-theme={themeIdForScene(scene)}
      className={className}
      style={style}
    >
      <ThemeRuntimeProvider themeId={themeIdForScene(scene)} mode="storefront" branding={branding}>
        <ExtensionSlot target="main-before" context={extensionContext} />
        <SceneRenderErrorBoundary surfaceName="Storefront" onError={onRenderError}>
          <DynamicSourceProvider data={dynamicData}>
            <SceneRenderProvider
              scene={scene}
              breakpoint={breakpoint}
              viewportWidth={viewportWidth}
              layoutResolved={layoutResolved}
              linkContext={linkContext}
              visibilityOverrides={visibilityOverrides}
            >
              <RenderNode nodeId={rootNodeId} />
            </SceneRenderProvider>
          </DynamicSourceProvider>
        </SceneRenderErrorBoundary>
        <ExtensionSlot target="main-after" context={extensionContext} />
      </ThemeRuntimeProvider>
    </div>
  );
};
