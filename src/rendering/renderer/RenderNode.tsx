import { memo, useEffect, useMemo } from "react";
import { useStore } from "zustand";
import { EDITOR_SYSTEM_KEYS } from "@/engine/kernel/systemKeys";
import { useOptionalEditorStores } from "@/engine/kernel/useEditorStores";
import { useOptionalEngineContext } from "@/engine/kernel/useEngine";
import { renderRegisteredNode } from "@/rendering/registry";
import { shouldRenderNode } from "@/rendering/visibility";
import type { NodeId, Rect } from "@/types";
import { rendererSystem, type RendererSystem } from "./RendererSystem";
import { useSceneRenderContext } from "./SceneRenderProvider";
import { responsiveSystem, type ResponsiveSystem } from "@/layout/responsive";
import { dynamicSourceSystem, useDynamicSourceData } from "@/document/dynamic-sources";
import { themeBrandingSystem } from "@/theme-engine/branding";
import { useThemeRuntime } from "@/theme-engine/runtime/ThemeRuntimeProvider";

export type RenderNodeProps = {
  nodeId: NodeId;
};

type RenderNodeContentProps = RenderNodeProps & {
  visibleRegion?: Rect;
};

const RenderNodeContent = memo(({ nodeId, visibleRegion }: RenderNodeContentProps) => {
  const engine = useOptionalEngineContext();
  const stores = useOptionalEditorStores();
  const renderer = engine?.tryResolveSystem<RendererSystem>(EDITOR_SYSTEM_KEYS.renderer) ?? rendererSystem;
  const responsive = engine?.tryResolveSystem<ResponsiveSystem>(EDITOR_SYSTEM_KEYS.responsive) ?? responsiveSystem;
  const renderContext = useSceneRenderContext();
  const dynamicSourceData = useDynamicSourceData();
  const { branding } = useThemeRuntime();
  const storeNode = useStore(stores.scene, (state) => state.nodes[nodeId]);
  const activeBreakpoint = useStore(stores.responsive, (state) => state.activeBreakpoint);
  const sourceNode = renderContext.scene?.nodes[nodeId] ?? storeNode;
  const resolvedBreakpoint = renderContext.breakpoint ?? activeBreakpoint;
  const responsiveNode = sourceNode
    ? renderContext.layoutResolved
      ? sourceNode
      : renderContext.viewportWidth
      ? responsive.resolveNodeForWidth(
          sourceNode,
          renderContext.viewportWidth,
          resolvedBreakpoint,
          renderContext.scene
            ? responsive.getSceneWidth(renderContext.scene, resolvedBreakpoint)
            : undefined,
        )
      : responsive.resolveNode(sourceNode, resolvedBreakpoint)
    : undefined;
  const dynamicNode = responsiveNode
    ? dynamicSourceSystem.resolveNode(responsiveNode, dynamicSourceData)
    : undefined;
  const visibilityOverride = renderContext.visibilityOverrides[nodeId];
  const visibleNode =
    dynamicNode && visibilityOverride !== undefined
      ? { ...dynamicNode, meta: { ...dynamicNode.meta, hidden: !visibilityOverride } }
      : dynamicNode;
  const node = visibleNode ? themeBrandingSystem.resolveNode(visibleNode, branding) : undefined;
  const previewVersion = useStore(stores.transform, (state) => state.previewVersions[nodeId] ?? 0);
  const previewTransform =
    renderContext.interactionPreviewEnabled && previewVersion
      ? stores.transform.getState().previewTransforms[nodeId]
      : undefined;
  const elevatedZIndex = useStore(stores.transform, (state) => state.interactionElevation?.elevatedZIndex[nodeId]);

  useEffect(() => {
    if (sourceNode && !renderContext.scene) renderer.invalidate(sourceNode.id);
  }, [sourceNode, nodeId, renderContext.scene, renderer]);

  if (!node) return null;
  if (node.meta.hidden) return null;
  const effectiveTransform =
    previewTransform || (renderContext.interactionPreviewEnabled && elevatedZIndex !== undefined)
      ? { ...(previewTransform ?? node.transform), zIndex: elevatedZIndex ?? (previewTransform ?? node.transform).zIndex }
      : node.transform;
  const nodeForRender = effectiveTransform === node.transform ? node : { ...node, transform: effectiveTransform };
  if (visibleRegion && !shouldRenderNode(nodeForRender, visibleRegion)) return null;

  return <>{renderRegisteredNode(nodeForRender)}</>;
});

RenderNodeContent.displayName = "RenderNodeContent";

const ViewportCulledRenderNode = memo(({ nodeId }: RenderNodeProps) => {
  const stores = useOptionalEditorStores();
  const zoom = useStore(stores.viewport, (state) => state.zoom);
  const pan = useStore(stores.viewport, (state) => state.pan);
  const viewportSize = useStore(stores.viewport, (state) => state.viewportSize);
  const visibleRegion = useMemo<Rect>(
    () => ({
      x: -pan.x / zoom,
      y: -pan.y / zoom,
      width: viewportSize.width / zoom,
      height: viewportSize.height / zoom,
    }),
    [pan.x, pan.y, viewportSize.height, viewportSize.width, zoom],
  );
  return <RenderNodeContent nodeId={nodeId} visibleRegion={visibleRegion} />;
});

ViewportCulledRenderNode.displayName = "ViewportCulledRenderNode";

export const RenderNode = memo(({ nodeId }: RenderNodeProps) => {
  const { cullingEnabled } = useSceneRenderContext();
  return cullingEnabled
    ? <ViewportCulledRenderNode nodeId={nodeId} />
    : <RenderNodeContent nodeId={nodeId} />;
});

RenderNode.displayName = "RenderNode";
