import { cloneSceneTree } from "@/engine/scene-graph";
import { validateSceneTree } from "@/engine/validation";
import {
  IntrinsicMeasurementSystem,
  intrinsicMeasurementSystem,
} from "@/layout/measurement";
import {
  RESPONSIVE_BREAKPOINTS,
  ResponsiveSystem,
  responsiveSystem,
} from "@/layout/responsive";
import {
  ResponsiveRuleRegistry,
  responsiveRuleRegistry,
} from "@/layout/rules";
import type { ResponsiveBreakpoint } from "@/stores/responsive.store";
import type {
  AxisSizeData,
  LayoutMode,
  NodeId,
  SceneNode,
  SceneTree,
  Size,
  TransformData,
} from "@/types";
import {
  applyConstraints,
  clampDimension,
  distributionMetrics,
  resolveAxisSize,
  resolvePadding,
  transformsEqual,
} from "./layoutMath";
import type {
  LayoutComputationResult,
  LayoutEngineAPI,
  LayoutPassOptions,
} from "./types";

const BREAKPOINTS = Object.keys(RESPONSIVE_BREAKPOINTS) as ResponsiveBreakpoint[];
const GENERIC_MODES = new Set<LayoutMode>(["horizontal", "vertical", "grid", "overlay", "flex"]);

type ChildLayout = {
  node: SceneNode;
  source: SceneNode;
  intrinsic: Size;
  width: number;
  height: number;
};

const axisConfig = (node: SceneNode, axis: "width" | "height"): AxisSizeData | undefined => {
  const explicit = node.layout.sizing?.[axis];
  if (explicit) return explicit;
  const intent = node.layout.responsiveIntent?.[axis];
  return intent ? { mode: intent } : undefined;
};

const isGenericNode = (node: SceneNode): boolean =>
  GENERIC_MODES.has(node.layout.mode) ||
  Boolean(node.layout.sizing || node.layout.constraints || node.layout.responsiveIntent);

const orderedChildren = (scene: SceneTree, node: SceneNode): SceneNode[] =>
  node.childIds
    .map((id, index) => ({ node: scene.nodes[id], index }))
    .filter((entry): entry is { node: SceneNode; index: number } => Boolean(entry.node && !entry.node.meta.hidden))
    .sort((left, right) => {
      const orderDelta = Number(left.node.layout.autoLayout?.order ?? left.index) -
        Number(right.node.layout.autoLayout?.order ?? right.index);
      return orderDelta || left.index - right.index;
    })
    .map((entry) => entry.node);

const withTransform = (node: SceneNode, transform: TransformData): SceneNode => ({
  ...node,
  transform: { ...transform, transformOrigin: [...transform.transformOrigin] },
});

const scaledProps = (
  node: SceneNode,
  ratio: number,
  minimumFontSize: number | undefined,
): SceneNode["props"] => {
  const props = { ...node.props };
  const fontSize = Number(props.fontSize);
  if (Number.isFinite(fontSize) && fontSize > 0 && ratio < 1) {
    props.fontSize = Math.max(minimumFontSize ?? 1, fontSize * ratio);
  }
  const letterSpacing = Number(props.letterSpacing);
  if (Number.isFinite(letterSpacing)) props.letterSpacing = letterSpacing * ratio;
  return props;
};

export class LayoutEngine implements LayoutEngineAPI {
  constructor(
    private readonly responsive: ResponsiveSystem = responsiveSystem,
    private readonly measurement: IntrinsicMeasurementSystem = intrinsicMeasurementSystem,
    private readonly rules: ResponsiveRuleRegistry = responsiveRuleRegistry,
  ) {}

  hasGenericLayout(scene: SceneTree): boolean {
    return Object.values(scene.nodes).some(isGenericNode);
  }

  compute(scene: SceneTree, options: LayoutPassOptions): LayoutComputationResult {
    const source = cloneSceneTree(scene);
    Object.values(source.nodes).forEach((node) => {
      source.nodes[node.id] = this.responsive.resolveNode(node, options.breakpoint);
    });
    const working = cloneSceneTree(source);
    const touched = new Set<NodeId>();
    const canonicalWidth = this.responsive.getSceneWidth(scene, options.breakpoint);
    const viewportWidth = Math.max(1, options.viewportWidth ?? canonicalWidth);
    const rootId = working.rootNodeId;
    if (!rootId) return { scene: working, breakpoint: options.breakpoint, viewportWidth, touchedNodeIds: touched };

    const root = working.nodes[rootId];
    if (options.forceViewportWidth || isGenericNode(root)) {
      this.setTransform(working, rootId, { ...root.transform, x: 0, width: viewportWidth }, touched);
    }
    this.layoutNode(scene, source, working, rootId, options.breakpoint, touched);
    return {
      scene: working,
      breakpoint: options.breakpoint,
      viewportWidth,
      touchedNodeIds: touched,
    };
  }

  reflowScene(scene: SceneTree): SceneTree {
    let next = cloneSceneTree(scene);
    BREAKPOINTS.forEach((breakpoint) => {
      const computed = this.compute(next, {
        breakpoint,
        viewportWidth: this.responsive.getSceneWidth(next, breakpoint),
      });
      computed.touchedNodeIds.forEach((nodeId) => {
        const node = next.nodes[nodeId];
        const calculated = computed.scene.nodes[nodeId];
        if (!node || !calculated || this.responsive.hasManualTransform(node, breakpoint)) return;
        const transform: TransformData = {
          ...calculated.transform,
          transformOrigin: [
            calculated.transform.transformOrigin[0],
            calculated.transform.transformOrigin[1],
          ],
        };
        next.nodes[nodeId] = {
          ...node,
          ...(breakpoint === "desktop" ? { transform } : {}),
          layout: this.responsive.updateLayout(node, breakpoint, { transform }),
        };
      });
    });
    return validateSceneTree(next);
  }

  resolveSceneForViewport(scene: SceneTree, viewportWidth: number): LayoutComputationResult {
    const breakpoint = this.responsive.breakpointForWidth(viewportWidth);
    const canonicalWidth = this.responsive.getSceneWidth(scene, breakpoint);
    const targetWidth = breakpoint === "desktop"
      ? Math.min(canonicalWidth, Math.max(1, viewportWidth))
      : Math.max(1, viewportWidth);
    const root = scene.rootNodeId ? scene.nodes[scene.rootNodeId] : undefined;
    const authoredResponsiveLayout =
      root?.extensions?.structuredLayoutPolicy === "authored-responsive";
    if (!authoredResponsiveLayout && this.hasGenericLayout(scene)) {
      return this.compute(scene, { breakpoint, viewportWidth: targetWidth, forceViewportWidth: true });
    }

    const structured = Boolean(
      scene.rootNodeId && scene.nodes[scene.rootNodeId]?.extensions?.structuredPage === true,
    );
    const resolved = cloneSceneTree(scene);
    const touched = new Set<NodeId>();
    const ratio = Math.min(1, targetWidth / Math.max(1, canonicalWidth));
    Object.values(scene.nodes).forEach((node) => {
      const responsiveNode = structured
        ? this.responsive.resolveNodeForWidth(node, targetWidth, breakpoint, canonicalWidth)
        : this.responsive.resolveNode(node, breakpoint);
      const rule = this.rules.resolve(responsiveNode);
      const nextNode = structured
        ? responsiveNode
        : {
            ...responsiveNode,
            props: scaledProps(responsiveNode, ratio, rule.minimumFontSize),
            transform: {
              ...responsiveNode.transform,
              x: responsiveNode.transform.x * ratio,
              y: responsiveNode.transform.y * ratio,
              width: Math.max(1, responsiveNode.transform.width * ratio),
              height: Math.max(1, responsiveNode.transform.height * ratio),
            },
          };
      resolved.nodes[node.id] = nextNode;
      if (!transformsEqual(node.transform, nextNode.transform)) touched.add(node.id);
    });
    return { scene: resolved, breakpoint, viewportWidth: targetWidth, touchedNodeIds: touched };
  }

  private layoutNode(
    persisted: SceneTree,
    source: SceneTree,
    working: SceneTree,
    nodeId: NodeId,
    breakpoint: ResponsiveBreakpoint,
    touched: Set<NodeId>,
  ): void {
    const parent = working.nodes[nodeId];
    const sourceParent = source.nodes[nodeId];
    if (!parent || !sourceParent) return;
    const declaredMode = parent.layout.mode === "flex" ? "horizontal" : parent.layout.mode;
    const mode =
      breakpoint === "mobile" &&
      declaredMode === "horizontal" &&
      parent.layout.responsiveIntent?.narrowBehavior === "stack"
        ? "vertical"
        : declaredMode;

    if (mode === "horizontal" || mode === "vertical") {
      this.layoutLinear(persisted, source, working, parent, mode, breakpoint, touched);
    } else if (mode === "grid") {
      this.layoutGrid(persisted, source, working, parent, breakpoint, touched);
    } else {
      this.layoutConstrainedChildren(persisted, source, working, parent, breakpoint, touched);
    }

    const refreshedParent = working.nodes[nodeId];
    refreshedParent.childIds.forEach((childId) =>
      this.layoutNode(persisted, source, working, childId, breakpoint, touched),
    );
    this.applyHugSizing(working, nodeId, touched);
  }

  private childLayout(
    working: SceneTree,
    node: SceneNode,
    sourceNode: SceneNode,
    availableWidth: number,
    availableHeight: number,
    fillWidth?: number,
    fillHeight?: number,
  ): ChildLayout {
    const rule = this.rules.resolve(node);
    const intrinsic = this.measurement.measure(node, { scene: working, availableWidth });
    let width = resolveAxisSize({
      config: axisConfig(node, "width"),
      current: node.transform.width,
      intrinsic: intrinsic.width,
      available: availableWidth,
      fillShare: fillWidth,
      ruleMinimum: rule.safeMinWidth,
      ruleMaximum: rule.safeMaxWidth,
    });
    let height = resolveAxisSize({
      config: axisConfig(node, "height"),
      current: node.transform.height,
      intrinsic: intrinsic.height,
      available: availableHeight,
      fillShare: fillHeight,
      ruleMinimum: rule.safeMinHeight,
      ruleMaximum: rule.safeMaxHeight,
    });
    if (rule.preserveAspectRatio && sourceNode.transform.width > 0 && sourceNode.transform.height > 0) {
      const ratio = sourceNode.transform.width / sourceNode.transform.height;
      const widthConfigured = Boolean(axisConfig(node, "width"));
      const heightConfigured = Boolean(axisConfig(node, "height"));
      if (widthConfigured && !heightConfigured) height = width / ratio;
      if (heightConfigured && !widthConfigured) width = height * ratio;
    }
    return { node, source: sourceNode, intrinsic, width, height };
  }

  private layoutLinear(
    persisted: SceneTree,
    source: SceneTree,
    working: SceneTree,
    parent: SceneNode,
    mode: "horizontal" | "vertical",
    breakpoint: ResponsiveBreakpoint,
    touched: Set<NodeId>,
  ): void {
    const padding = resolvePadding(parent.layout.autoLayout?.padding);
    const configuredGap = Math.max(0, Number(parent.layout.autoLayout?.gap ?? 0));
    const contentWidth = Math.max(1, parent.transform.width - padding.left - padding.right);
    const contentHeight = Math.max(1, parent.transform.height - padding.top - padding.bottom);
    const flowChildren = orderedChildren(working, parent).filter((child) => {
      const persistedNode = persisted.nodes[child.id];
      return child.layout.autoLayout?.position !== "absolute" &&
        !this.responsive.hasManualTransform(persistedNode, breakpoint);
    });
    const horizontal = mode === "horizontal";
    const fillCount = flowChildren.filter((child) => axisConfig(child, horizontal ? "width" : "height")?.mode === "fill").length;
    const preliminary = flowChildren.map((child) =>
      this.childLayout(working, child, source.nodes[child.id], contentWidth, contentHeight),
    );
    const fixedMain = preliminary.reduce((sum, item) => {
      const config = axisConfig(item.node, horizontal ? "width" : "height");
      return sum + (config?.mode === "fill" ? 0 : horizontal ? item.width : item.height);
    }, 0);
    const fillShare = fillCount
      ? Math.max(1, (horizontal ? contentWidth : contentHeight) - fixedMain - configuredGap * Math.max(0, flowChildren.length - 1)) / fillCount
      : undefined;
    const items = flowChildren.map((child) =>
      this.childLayout(
        working,
        child,
        source.nodes[child.id],
        contentWidth,
        contentHeight,
        horizontal && axisConfig(child, "width")?.mode === "fill" ? fillShare : undefined,
        !horizontal && axisConfig(child, "height")?.mode === "fill" ? fillShare : undefined,
      ),
    );
    const wrap = horizontal && (
      parent.layout.autoLayout?.wrap === true ||
      parent.layout.responsiveIntent?.overflow === "wrap" ||
      (breakpoint === "mobile" && parent.layout.responsiveIntent?.narrowBehavior === "wrap")
    );

    if (wrap) {
      this.placeWrappedRows(working, parent, items, padding, contentWidth, configuredGap, touched);
      return;
    }

    const occupied = items.reduce((sum, item) => sum + (horizontal ? item.width : item.height), 0);
    const metrics = distributionMetrics(
      parent.layout.autoLayout?.distribution,
      horizontal ? contentWidth : contentHeight,
      occupied,
      items.length,
      configuredGap,
    );
    let cursor = (horizontal ? padding.left : padding.top) + metrics.offset;
    items.forEach((item) => {
      let x = horizontal ? cursor : padding.left;
      let y = horizontal ? padding.top : cursor;
      let width = item.width;
      let height = item.height;
      const alignment = parent.layout.autoLayout?.alignment ?? "start";
      if (horizontal) {
        if (alignment === "center") y += (contentHeight - height) / 2;
        if (alignment === "end") y += contentHeight - height;
        if (alignment === "stretch" && !axisConfig(item.node, "height")) height = contentHeight;
      } else {
        if (alignment === "center") x += (contentWidth - width) / 2;
        if (alignment === "end") x += contentWidth - width;
        if (alignment === "stretch" && !axisConfig(item.node, "width")) width = contentWidth;
      }
      this.setTransform(working, item.node.id, { ...item.node.transform, x, y, width, height }, touched);
      cursor += (horizontal ? width : height) + metrics.gap;
    });
  }

  private placeWrappedRows(
    working: SceneTree,
    parent: SceneNode,
    items: ChildLayout[],
    padding: ReturnType<typeof resolvePadding>,
    contentWidth: number,
    gap: number,
    touched: Set<NodeId>,
  ): void {
    const rows: ChildLayout[][] = [];
    let row: ChildLayout[] = [];
    let rowWidth = 0;
    items.forEach((item) => {
      const nextWidth = rowWidth + (row.length ? gap : 0) + item.width;
      if (row.length && nextWidth > contentWidth) {
        rows.push(row);
        row = [];
        rowWidth = 0;
      }
      row.push(item);
      rowWidth += (row.length > 1 ? gap : 0) + item.width;
    });
    if (row.length) rows.push(row);
    let y = padding.top;
    rows.forEach((currentRow) => {
      const rowHeight = Math.max(...currentRow.map((item) => item.height));
      const occupied = currentRow.reduce((sum, item) => sum + item.width, 0);
      const metrics = distributionMetrics(
        parent.layout.autoLayout?.distribution,
        contentWidth,
        occupied,
        currentRow.length,
        gap,
      );
      let x = padding.left + metrics.offset;
      currentRow.forEach((item) => {
        const alignment = parent.layout.autoLayout?.alignment ?? "start";
        const itemY = alignment === "center"
          ? y + (rowHeight - item.height) / 2
          : alignment === "end"
            ? y + rowHeight - item.height
            : y;
        const height = alignment === "stretch" && !axisConfig(item.node, "height")
          ? rowHeight
          : item.height;
        this.setTransform(working, item.node.id, {
          ...item.node.transform,
          x,
          y: itemY,
          width: item.width,
          height,
        }, touched);
        x += item.width + metrics.gap;
      });
      y += rowHeight + (parent.layout.autoLayout?.rowGap ?? gap);
    });
  }

  private layoutGrid(
    persisted: SceneTree,
    source: SceneTree,
    working: SceneTree,
    parent: SceneNode,
    breakpoint: ResponsiveBreakpoint,
    touched: Set<NodeId>,
  ): void {
    const padding = resolvePadding(parent.layout.autoLayout?.padding);
    const columnGap = Math.max(0, Number(parent.layout.autoLayout?.columnGap ?? parent.layout.autoLayout?.gap ?? 0));
    const rowGap = Math.max(0, Number(parent.layout.autoLayout?.rowGap ?? parent.layout.autoLayout?.gap ?? 0));
    const contentWidth = Math.max(1, parent.transform.width - padding.left - padding.right);
    const children = orderedChildren(working, parent).filter((child) =>
      child.layout.autoLayout?.position !== "absolute" &&
      !this.responsive.hasManualTransform(persisted.nodes[child.id], breakpoint),
    );
    const requestedColumns = parent.layout.autoLayout?.columns ?? "auto";
    const minimumColumnWidth = Math.max(1, Number(parent.layout.autoLayout?.minColumnWidth ?? 220));
    const columns = requestedColumns === "auto"
      ? Math.max(1, Math.floor((contentWidth + columnGap) / (minimumColumnWidth + columnGap)))
      : Math.max(1, Math.min(children.length || 1, requestedColumns));
    const cellWidth = Math.max(1, (contentWidth - columnGap * Math.max(0, columns - 1)) / columns);
    const rows: ChildLayout[][] = [];
    children.forEach((child, index) => {
      const item = this.childLayout(working, child, source.nodes[child.id], cellWidth, parent.transform.height);
      item.width = axisConfig(child, "width")?.mode === "fixed" ? Math.min(cellWidth, item.width) : cellWidth;
      const rowIndex = Math.floor(index / columns);
      (rows[rowIndex] ??= []).push(item);
    });
    let y = padding.top;
    rows.forEach((row) => {
      const rowHeight = Math.max(1, ...row.map((item) => item.height));
      row.forEach((item, column) => {
        const alignment = parent.layout.autoLayout?.alignment ?? "stretch";
        const width = alignment === "stretch" ? cellWidth : item.width;
        const xOffset = alignment === "center"
          ? (cellWidth - width) / 2
          : alignment === "end"
            ? cellWidth - width
            : 0;
        this.setTransform(working, item.node.id, {
          ...item.node.transform,
          x: padding.left + column * (cellWidth + columnGap) + xOffset,
          y,
          width,
          height: item.height,
        }, touched);
      });
      y += rowHeight + rowGap;
    });
  }

  private layoutConstrainedChildren(
    persisted: SceneTree,
    source: SceneTree,
    working: SceneTree,
    parent: SceneNode,
    breakpoint: ResponsiveBreakpoint,
    touched: Set<NodeId>,
  ): void {
    orderedChildren(working, parent).forEach((child) => {
      const persistedChild = persisted.nodes[child.id];
      if (this.responsive.hasManualTransform(persistedChild, breakpoint)) return;
      const sourceChild = source.nodes[child.id];
      const sourceParent = source.nodes[parent.id];
      if (!isGenericNode(child)) {
        const ratio = parent.transform.width / Math.max(1, sourceParent.transform.width);
        if (Math.abs(ratio - 1) < 0.001) return;
        const rule = this.rules.resolve(child);
        working.nodes[child.id] = {
          ...working.nodes[child.id],
          props: scaledProps(child, ratio, rule.minimumFontSize),
        };
        this.setTransform(working, child.id, {
          ...child.transform,
          x: child.transform.x * ratio,
          width: clampDimension(
            child.transform.width * ratio,
            Math.min(rule.safeMinWidth, parent.transform.width),
            Math.min(rule.safeMaxWidth ?? Number.POSITIVE_INFINITY, parent.transform.width),
          ),
        }, touched);
        return;
      }
      const intrinsic = this.measurement.measure(child, {
        scene: working,
        availableWidth: parent.transform.width,
        availableHeight: parent.transform.height,
      });
      let transform = applyConstraints({
        source: sourceChild,
        sourceParent,
        targetParent: parent,
        intrinsic,
        rule: this.rules.resolve(child),
      });
      const rule = this.rules.resolve(child);
      transform = {
        ...transform,
        width: resolveAxisSize({
          config: axisConfig(child, "width"),
          current: transform.width,
          intrinsic: intrinsic.width,
          available: parent.transform.width,
          ruleMinimum: rule.safeMinWidth,
          ruleMaximum: rule.safeMaxWidth,
        }),
        height: resolveAxisSize({
          config: axisConfig(child, "height"),
          current: transform.height,
          intrinsic: intrinsic.height,
          available: parent.transform.height,
          ruleMinimum: rule.safeMinHeight,
          ruleMaximum: rule.safeMaxHeight,
        }),
      };
      this.setTransform(working, child.id, transform, touched);
    });
  }

  private applyHugSizing(working: SceneTree, nodeId: NodeId, touched: Set<NodeId>): void {
    const node = working.nodes[nodeId];
    if (!node) return;
    const padding = resolvePadding(node.layout.autoLayout?.padding);
    const visibleChildren = node.childIds
      .map((id) => working.nodes[id])
      .filter((child): child is SceneNode => Boolean(child && !child.meta.hidden));
    if (!visibleChildren.length) return;
    const widthConfig = axisConfig(node, "width");
    const heightConfig = axisConfig(node, "height");
    if (widthConfig?.mode !== "hug" && heightConfig?.mode !== "hug") return;
    const contentWidth = Math.max(...visibleChildren.map((child) => child.transform.x + child.transform.width)) + padding.right;
    const contentHeight = Math.max(...visibleChildren.map((child) => child.transform.y + child.transform.height)) + padding.bottom;
    const rule = this.rules.resolve(node);
    this.setTransform(working, nodeId, {
      ...node.transform,
      width: widthConfig?.mode === "hug"
        ? clampDimension(contentWidth, rule.safeMinWidth, rule.safeMaxWidth)
        : node.transform.width,
      height: heightConfig?.mode === "hug"
        ? clampDimension(contentHeight, rule.safeMinHeight, rule.safeMaxHeight)
        : node.transform.height,
    }, touched);
  }

  private setTransform(
    scene: SceneTree,
    nodeId: NodeId,
    transform: TransformData,
    touched: Set<NodeId>,
  ): void {
    const node = scene.nodes[nodeId];
    if (!node || transformsEqual(node.transform, transform)) return;
    scene.nodes[nodeId] = withTransform(node, transform);
    touched.add(nodeId);
  }
}

export const createLayoutEngine = (options: {
  responsive?: ResponsiveSystem;
  measurement?: IntrinsicMeasurementSystem;
  rules?: ResponsiveRuleRegistry;
} = {}) => new LayoutEngine(options.responsive, options.measurement, options.rules);

export const layoutEngine = createLayoutEngine();
