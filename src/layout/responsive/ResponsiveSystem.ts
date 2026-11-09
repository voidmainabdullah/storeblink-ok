import { cloneSceneTree } from "@/engine/scene-graph";
import type { SceneGraphAPI } from "@/engine/scene-graph";
import { useResponsiveStore, type ResponsiveBreakpoint, type ResponsiveStore } from "@/stores/responsive.store";
import type { LayoutData, NodeMeta, SceneNode, SceneTree, StyleData, TransformData } from "@/types";

export type ResponsiveNodeOverride = {
  transform?: TransformData;
  props?: Record<string, unknown>;
  style?: Partial<StyleData>;
  meta?: Partial<Pick<NodeMeta, "hidden" | "locked">>;
  manualTransform?: boolean;
};

export type ResponsiveOverrideMap = Partial<Record<ResponsiveBreakpoint, ResponsiveNodeOverride>>;
export type ResponsiveOverrideTarget = "transform" | "props" | "style" | "meta";
export type ResponsiveValueSource = ResponsiveBreakpoint | "base";

export const RESPONSIVE_BREAKPOINTS: Record<ResponsiveBreakpoint, { label: string; width: number }> = {
  desktop: { label: "Desktop", width: 1200 },
  tablet: { label: "Tablet", width: 768 },
  mobile: { label: "Mobile", width: 390 },
};

export type ResponsiveSceneWidths = Record<ResponsiveBreakpoint, number>;

const positiveWidth = (value: unknown): number | null => {
  const width = Number(value);
  return Number.isFinite(width) && width > 0 ? width : null;
};

const cloneTransform = (transform: TransformData): TransformData => ({
  ...transform,
  transformOrigin: [...transform.transformOrigin],
});

const cloneStyle = (style: StyleData): StyleData => ({
  ...style,
  fills: style.fills.map((fill) => ({ ...fill })),
  strokes: style.strokes.map((stroke) => ({ ...stroke })),
  effects: style.effects.map((effect) => ({ ...effect, value: { ...effect.value } })),
  cornerRadius:
    typeof style.cornerRadius === "object" && style.cornerRadius
      ? { ...style.cornerRadius }
      : style.cornerRadius,
});

const cloneStylePatch = (style: Partial<StyleData>): Partial<StyleData> => ({
  ...style,
  ...(style.fills ? { fills: style.fills.map((fill) => ({ ...fill })) } : {}),
  ...(style.strokes ? { strokes: style.strokes.map((stroke) => ({ ...stroke })) } : {}),
  ...(style.effects
    ? { effects: style.effects.map((effect) => ({ ...effect, value: { ...effect.value } })) }
    : {}),
  ...(typeof style.cornerRadius === "object" && style.cornerRadius
    ? { cornerRadius: { ...style.cornerRadius } }
    : {}),
});

const readOverrides = (layout: LayoutData): ResponsiveOverrideMap => {
  const responsive = layout.responsive;
  if (!responsive || typeof responsive !== "object") return {};
  return responsive as ResponsiveOverrideMap;
};

const overrideChain = (
  overrides: ResponsiveOverrideMap,
  breakpoint: ResponsiveBreakpoint,
): ResponsiveNodeOverride[] => {
  const chain = [overrides.desktop];
  if (breakpoint === "tablet" || breakpoint === "mobile") chain.push(overrides.tablet);
  if (breakpoint === "mobile") chain.push(overrides.mobile);
  return chain.filter((entry): entry is ResponsiveNodeOverride => Boolean(entry));
};

const scaledTransform = (transform: TransformData, ratio: number): TransformData => ({
  ...cloneTransform(transform),
  x: transform.x * ratio,
  y: transform.y * ratio,
  width: Math.max(1, transform.width * ratio),
  height: Math.max(1, transform.height * ratio),
});

const scaledProps = (props: Record<string, unknown>, ratio: number): Record<string, unknown> => {
  const next = { ...props };
  if (typeof props.fontSize === "number") next.fontSize = Math.max(7, Math.round(props.fontSize * ratio * 100) / 100);
  if (typeof props.letterSpacing === "number") next.letterSpacing = props.letterSpacing * ratio;
  return next;
};

type AxisAnchor = "start" | "center" | "end";

const axisAnchor = (position: number, size: number, containerSize: number): AxisAnchor => {
  const center = (position + size / 2) / Math.max(1, containerSize);
  if (center <= 0.34) return "start";
  if (center >= 0.66) return "end";
  return "center";
};

const axisOffsetRatio = (
  anchor: AxisAnchor,
  position: number,
  size: number,
  containerSize: number,
): number => {
  const safeSize = Math.max(1, containerSize);
  if (anchor === "start") return position / safeSize;
  if (anchor === "end") return (containerSize - position - size) / safeSize;
  return (position + size / 2 - containerSize / 2) / safeSize;
};

const linkedAxisPosition = (
  anchor: AxisAnchor,
  offsetRatio: number,
  size: number,
  containerSize: number,
): number => {
  if (anchor === "start") return containerSize * offsetRatio;
  if (anchor === "end") return containerSize - size - containerSize * offsetRatio;
  return containerSize / 2 + containerSize * offsetRatio - size / 2;
};

export class ResponsiveSystem {
  constructor(private readonly store: ResponsiveStore = useResponsiveStore) {}

  activate(breakpoint: ResponsiveBreakpoint): void {
    this.store.getState().setActiveBreakpointFromResponsiveSystem(breakpoint);
  }

  getActiveBreakpoint(): ResponsiveBreakpoint {
    return this.store.getState().activeBreakpoint;
  }

  breakpointForWidth(width: number): ResponsiveBreakpoint {
    if (width < 640) return "mobile";
    if (width < 1024) return "tablet";
    return "desktop";
  }

  getSceneWidths(scene: SceneTree): ResponsiveSceneWidths {
    const root = scene.rootNodeId ? scene.nodes[scene.rootNodeId] : undefined;
    const configured =
      root?.extensions?.responsiveWidths &&
      typeof root.extensions.responsiveWidths === "object"
        ? (root.extensions.responsiveWidths as Partial<Record<ResponsiveBreakpoint, unknown>>)
        : {};
    return {
      desktop:
        positiveWidth(configured.desktop) ??
        positiveWidth(root?.extensions?.responsiveBaseWidth) ??
        positiveWidth(root?.transform.width) ??
        RESPONSIVE_BREAKPOINTS.desktop.width,
      tablet: positiveWidth(configured.tablet) ?? RESPONSIVE_BREAKPOINTS.tablet.width,
      mobile: positiveWidth(configured.mobile) ?? RESPONSIVE_BREAKPOINTS.mobile.width,
    };
  }

  getSceneWidth(scene: SceneTree, breakpoint: ResponsiveBreakpoint): number {
    return this.getSceneWidths(scene)[breakpoint];
  }

  hasOverrides(node: SceneNode): boolean {
    return Object.keys(readOverrides(node.layout)).length > 0;
  }

  resolveNode(node: SceneNode, breakpoint = this.getActiveBreakpoint()): SceneNode {
    const chain = overrideChain(readOverrides(node.layout), breakpoint);
    if (!chain.length) return node;
    const override = chain.reduce<ResponsiveNodeOverride>(
      (resolved, current) => ({
        transform: current.transform ?? resolved.transform,
        props: current.props ? { ...(resolved.props ?? {}), ...current.props } : resolved.props,
        style: current.style ? { ...(resolved.style ?? {}), ...current.style } : resolved.style,
        meta: current.meta ? { ...(resolved.meta ?? { hidden: node.meta.hidden, locked: node.meta.locked }), ...current.meta } : resolved.meta,
      }),
      {},
    );
    return {
      ...node,
      transform: override.transform ? cloneTransform(override.transform) : node.transform,
      props: override.props ? { ...node.props, ...override.props } : node.props,
      style: override.style ? cloneStyle({ ...node.style, ...override.style }) : node.style,
      meta: override.meta ? { ...node.meta, ...override.meta } : node.meta,
    };
  }

  resolveNodeForWidth(
    node: SceneNode,
    viewportWidth: number,
    breakpoint = this.breakpointForWidth(viewportWidth),
    canonicalWidth = RESPONSIVE_BREAKPOINTS[breakpoint].width,
  ): SceneNode {
    const resolved = this.resolveNode(node, breakpoint);
    const safeCanonicalWidth = Math.max(1, canonicalWidth);
    const targetWidth = Math.max(
      1,
      breakpoint === "desktop"
        ? Math.min(safeCanonicalWidth, viewportWidth)
        : viewportWidth,
    );
    if (Math.abs(targetWidth - safeCanonicalWidth) < 0.01) return resolved;
    const horizontalRatio = targetWidth / safeCanonicalWidth;
    const fontSize = Number(resolved.props.fontSize);
    const fluidProps =
      horizontalRatio < 1 && Number.isFinite(fontSize) && fontSize >= 24
        ? { ...resolved.props, fontSize: Math.max(fontSize * 0.82, fontSize * horizontalRatio) }
        : resolved.props;
    return {
      ...resolved,
      props: fluidProps,
      transform: {
        ...resolved.transform,
        x: resolved.transform.x * horizontalRatio,
        width: Math.max(1, resolved.transform.width * horizontalRatio),
      },
    };
  }

  updateLayout(
    node: SceneNode,
    breakpoint: ResponsiveBreakpoint,
    patch: ResponsiveNodeOverride,
  ): LayoutData {
    const current = readOverrides(node.layout);
    const existing = current[breakpoint] ?? {};
    return {
      ...node.layout,
      responsive: {
        ...current,
        [breakpoint]: {
          ...existing,
          ...(patch.transform ? { transform: cloneTransform(patch.transform) } : {}),
          ...(patch.props ? { props: { ...(existing.props ?? {}), ...patch.props } } : {}),
          ...(patch.style
            ? { style: { ...(existing.style ?? {}), ...cloneStylePatch(patch.style) } }
            : {}),
          ...(patch.meta ? {
            meta: {
              ...(existing.meta ?? {}),
              ...patch.meta,
            },
          } : {}),
          ...(patch.manualTransform !== undefined
            ? { manualTransform: patch.manualTransform }
            : {}),
        },
      },
    };
  }

  hasManualTransform(
    node: SceneNode,
    breakpoint: ResponsiveBreakpoint,
  ): boolean {
    return readOverrides(node.layout)[breakpoint]?.manualTransform === true;
  }

  hasExplicitOverride(
    node: SceneNode,
    breakpoint: ResponsiveBreakpoint,
    target?: ResponsiveOverrideTarget,
    property?: string,
  ): boolean {
    const override = readOverrides(node.layout)[breakpoint];
    if (!override) return false;
    if (!target) return true;
    const targetOverride = override[target];
    if (!targetOverride || typeof targetOverride !== "object") return false;
    return property ? Object.prototype.hasOwnProperty.call(targetOverride, property) : true;
  }

  getValueSource(
    node: SceneNode,
    breakpoint: ResponsiveBreakpoint,
    target: ResponsiveOverrideTarget,
    property: string,
  ): ResponsiveValueSource {
    const overrides = readOverrides(node.layout);
    const candidates: ResponsiveBreakpoint[] =
      breakpoint === "mobile"
        ? ["mobile", "tablet", "desktop"]
        : breakpoint === "tablet"
          ? ["tablet", "desktop"]
          : ["desktop"];
    return candidates.find((candidate) => {
      const value = overrides[candidate]?.[target];
      return Boolean(value && typeof value === "object" && Object.prototype.hasOwnProperty.call(value, property));
    }) ?? "base";
  }

  resetValueOverride(
    node: SceneNode,
    breakpoint: ResponsiveBreakpoint,
    target: ResponsiveOverrideTarget,
    property: string,
  ): LayoutData {
    if (breakpoint === "desktop") return node.layout;
    const current = readOverrides(node.layout);
    const override = current[breakpoint];
    const targetOverride = override?.[target];
    if (!override || !targetOverride || typeof targetOverride !== "object") return node.layout;

    const nextTarget = { ...targetOverride } as Record<string, unknown>;
    delete nextTarget[property];
    const nextOverride: ResponsiveNodeOverride = { ...override };
    if (Object.keys(nextTarget).length) {
      Object.assign(nextOverride, { [target]: nextTarget });
    } else {
      delete nextOverride[target];
    }
    const nextResponsive: ResponsiveOverrideMap = { ...current };
    if (Object.keys(nextOverride).length) nextResponsive[breakpoint] = nextOverride;
    else delete nextResponsive[breakpoint];
    return { ...node.layout, responsive: nextResponsive };
  }

  resetOverride(node: SceneNode, breakpoint: ResponsiveBreakpoint): LayoutData {
    if (breakpoint === "desktop") return node.layout;
    const current = readOverrides(node.layout);
    const { [breakpoint]: _removed, ...remaining } = current;
    return { ...node.layout, responsive: remaining };
  }

  shareCurrentLayout(node: SceneNode, breakpoint = this.getActiveBreakpoint()): LayoutData {
    const resolved = this.resolveNode(node, breakpoint);
    const override: ResponsiveNodeOverride = {
      transform: resolved.transform,
      props: resolved.props,
      style: resolved.style,
      meta: { hidden: resolved.meta.hidden, locked: resolved.meta.locked },
      manualTransform: true,
    };
    return (Object.keys(RESPONSIVE_BREAKPOINTS) as ResponsiveBreakpoint[]).reduce(
      (layout, targetBreakpoint) => this.updateLayout({ ...node, layout }, targetBreakpoint, override),
      node.layout,
    );
  }

  updateLinkedTransformLayout(
    node: SceneNode,
    breakpoint: ResponsiveBreakpoint,
    before: TransformData,
    after: TransformData,
    sceneGraph: Pick<SceneGraphAPI, "getNode">,
  ): LayoutData {
    const parent = node.parentId ? sceneGraph.getNode(node.parentId) : undefined;
    const activeParent = parent ? this.resolveNode(parent, breakpoint) : undefined;
    const activeContainerWidth = activeParent?.transform.width ?? RESPONSIVE_BREAKPOINTS[breakpoint].width;
    const activeContainerHeight = activeParent?.transform.height ?? Math.max(before.height, after.height, 1);
    const horizontalAnchor = axisAnchor(after.x, after.width, activeContainerWidth);
    const verticalAnchor = axisAnchor(after.y, after.height, activeContainerHeight);
    const horizontalOffset = axisOffsetRatio(
      horizontalAnchor,
      after.x,
      after.width,
      activeContainerWidth,
    );
    const verticalOffset = axisOffsetRatio(
      verticalAnchor,
      after.y,
      after.height,
      activeContainerHeight,
    );
    const widthRatio = after.width / Math.max(1, before.width);
    const heightRatio = after.height / Math.max(1, before.height);
    const scaleXRatio = after.scaleX / Math.max(0.0001, before.scaleX);
    const scaleYRatio = after.scaleY / Math.max(0.0001, before.scaleY);
    const rotationDelta = after.rotation - before.rotation;

    return (Object.keys(RESPONSIVE_BREAKPOINTS) as ResponsiveBreakpoint[]).reduce(
      (layout, targetBreakpoint) => {
        if (targetBreakpoint === breakpoint) {
          return this.updateLayout({ ...node, layout }, targetBreakpoint, {
            transform: after,
            manualTransform: true,
          });
        }
        const targetNode = this.resolveNode({ ...node, layout }, targetBreakpoint);
        const targetParent = parent ? this.resolveNode(parent, targetBreakpoint) : undefined;
        const containerWidth = targetParent?.transform.width ?? RESPONSIVE_BREAKPOINTS[targetBreakpoint].width;
        const containerHeight = targetParent?.transform.height ?? activeContainerHeight;
        const width = Math.min(containerWidth, Math.max(1, targetNode.transform.width * widthRatio));
        const height = Math.min(containerHeight, Math.max(1, targetNode.transform.height * heightRatio));
        const transform: TransformData = {
          ...targetNode.transform,
          x: linkedAxisPosition(horizontalAnchor, horizontalOffset, width, containerWidth),
          y: linkedAxisPosition(verticalAnchor, verticalOffset, height, containerHeight),
          width,
          height,
          rotation: targetNode.transform.rotation + rotationDelta,
          scaleX: targetNode.transform.scaleX * scaleXRatio,
          scaleY: targetNode.transform.scaleY * scaleYRatio,
        };
        return this.updateLayout({ ...node, layout }, targetBreakpoint, {
          transform,
          manualTransform: true,
        });
      },
      node.layout,
    );
  }

  ensureSceneOverrides(scene: SceneTree): SceneTree {
    const next = cloneSceneTree(scene);
    const sceneWidths = this.getSceneWidths(next);
    Object.values(next.nodes).forEach((node) => {
      const current = readOverrides(node.layout);
      const baseWidth = sceneWidths.desktop;
      const makeOverride = (breakpoint: ResponsiveBreakpoint): ResponsiveNodeOverride => {
        const ratio = sceneWidths[breakpoint] / Math.max(1, baseWidth);
        return {
          transform: breakpoint === "desktop" ? cloneTransform(node.transform) : scaledTransform(node.transform, ratio),
          props: breakpoint === "desktop" ? { ...node.props } : scaledProps(node.props, ratio),
          style: cloneStyle(node.style),
          meta: { hidden: node.meta.hidden, locked: node.meta.locked },
        };
      };
      node.layout = {
        ...node.layout,
        responsive: {
          desktop: current.desktop ?? makeOverride("desktop"),
          tablet: current.tablet ?? makeOverride("tablet"),
          mobile: current.mobile ?? makeOverride("mobile"),
        },
      };
    });
    return next;
  }
}

export const createResponsiveSystem = (store?: ResponsiveStore) => new ResponsiveSystem(store);
export const responsiveSystem = createResponsiveSystem();
