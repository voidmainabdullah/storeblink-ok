import type {
  AxisSizeData,
  ConstraintData,
  LayoutDistribution,
  LayoutPadding,
  SceneNode,
  Size,
  TransformData,
} from "@/types";
import type { ElementResponsiveRule } from "@/layout/rules";

export type ResolvedPadding = { top: number; right: number; bottom: number; left: number };

export const resolvePadding = (padding: LayoutPadding | undefined): ResolvedPadding =>
  typeof padding === "number"
    ? { top: padding, right: padding, bottom: padding, left: padding }
    : padding ?? { top: 0, right: 0, bottom: 0, left: 0 };

export const clampDimension = (
  value: number,
  minimum = 1,
  maximum = Number.POSITIVE_INFINITY,
): number => Math.min(maximum, Math.max(minimum, Number.isFinite(value) ? value : minimum));

export const resolveAxisSize = ({
  config,
  current,
  intrinsic,
  available,
  fillShare,
  ruleMinimum,
  ruleMaximum,
}: {
  config?: AxisSizeData;
  current: number;
  intrinsic: number;
  available: number;
  fillShare?: number;
  ruleMinimum: number;
  ruleMaximum?: number;
}): number => {
  let value = current;
  if (config?.mode === "fixed") value = config.value ?? current;
  if (config?.mode === "hug") value = intrinsic;
  if (config?.mode === "fill") value = fillShare ?? available;
  if (config?.mode === "percentage") {
    const ratio = config.percentage ?? (config.value === undefined ? 1 : config.value > 1 ? config.value / 100 : config.value);
    value = available * ratio;
  }
  if (config?.mode === "minmax") value = config.value ?? intrinsic;
  const minimum = Math.max(ruleMinimum, config?.min ?? 0);
  const maximum = Math.min(ruleMaximum ?? Number.POSITIVE_INFINITY, config?.max ?? Number.POSITIVE_INFINITY);
  return clampDimension(value, minimum, Math.max(minimum, maximum));
};

const axisConstraint = (
  mode: ConstraintData["horizontal"] | ConstraintData["vertical"] | undefined,
  sourcePosition: number,
  sourceSize: number,
  sourceParentSize: number,
  targetParentSize: number,
  leadingInset: number | undefined,
  trailingInset: number | undefined,
  intrinsicSize: number,
): { position: number; size: number } => {
  const leading = leadingInset ?? sourcePosition;
  const trailing = trailingInset ?? sourceParentSize - sourcePosition - sourceSize;
  if (mode === "right" || mode === "bottom") {
    return { position: targetParentSize - trailing - sourceSize, size: sourceSize };
  }
  if (mode === "center") {
    const sourceOffset = sourcePosition + sourceSize / 2 - sourceParentSize / 2;
    return { position: targetParentSize / 2 + sourceOffset - sourceSize / 2, size: sourceSize };
  }
  if (mode === "stretch") {
    return { position: leading, size: Math.max(1, targetParentSize - leading - trailing) };
  }
  if (mode === "scale") {
    const ratio = targetParentSize / Math.max(1, sourceParentSize);
    return { position: sourcePosition * ratio, size: Math.max(1, sourceSize * ratio) };
  }
  if (mode === "fill") return { position: 0, size: Math.max(1, targetParentSize) };
  if (mode === "hug") return { position: sourcePosition, size: intrinsicSize };
  return { position: leadingInset ?? sourcePosition, size: sourceSize };
};

export const applyConstraints = ({
  source,
  sourceParent,
  targetParent,
  intrinsic,
  rule,
}: {
  source: SceneNode;
  sourceParent: SceneNode;
  targetParent: SceneNode;
  intrinsic: Size;
  rule: ElementResponsiveRule;
}): TransformData => {
  const constraints = source.layout.constraints ?? {};
  const horizontal = axisConstraint(
    constraints.horizontal,
    source.transform.x,
    source.transform.width,
    sourceParent.transform.width,
    targetParent.transform.width,
    constraints.left,
    constraints.right,
    intrinsic.width,
  );
  const vertical = axisConstraint(
    constraints.vertical,
    source.transform.y,
    source.transform.height,
    sourceParent.transform.height,
    targetParent.transform.height,
    constraints.top,
    constraints.bottom,
    intrinsic.height,
  );
  let width = clampDimension(horizontal.size, rule.safeMinWidth, rule.safeMaxWidth);
  let height = clampDimension(vertical.size, rule.safeMinHeight, rule.safeMaxHeight);
  if (rule.preserveAspectRatio && source.transform.width > 0 && source.transform.height > 0) {
    const widthChanged = Math.abs(width - source.transform.width) > 0.01;
    const heightChanged = Math.abs(height - source.transform.height) > 0.01;
    const ratio = source.transform.width / source.transform.height;
    if (widthChanged && !heightChanged) height = width / ratio;
    if (heightChanged && !widthChanged) width = height * ratio;
  }
  return { ...source.transform, x: horizontal.position, y: vertical.position, width, height };
};

export const distributionMetrics = (
  distribution: LayoutDistribution | undefined,
  available: number,
  occupied: number,
  count: number,
  configuredGap: number,
): { offset: number; gap: number } => {
  const free = Math.max(0, available - occupied - Math.max(0, count - 1) * configuredGap);
  if (distribution === "center") return { offset: free / 2, gap: configuredGap };
  if (distribution === "end") return { offset: free, gap: configuredGap };
  if (distribution === "space-between" && count > 1) {
    return { offset: 0, gap: configuredGap + free / (count - 1) };
  }
  if (distribution === "space-around" && count > 0) {
    const extra = free / count;
    return { offset: extra / 2, gap: configuredGap + extra };
  }
  if (distribution === "space-evenly" && count > 0) {
    const extra = free / (count + 1);
    return { offset: extra, gap: configuredGap + extra };
  }
  return { offset: 0, gap: configuredGap };
};

export const transformsEqual = (left: TransformData, right: TransformData): boolean =>
  left.x === right.x &&
  left.y === right.y &&
  left.width === right.width &&
  left.height === right.height &&
  left.rotation === right.rotation &&
  left.scaleX === right.scaleX &&
  left.scaleY === right.scaleY &&
  left.skewX === right.skewX &&
  left.skewY === right.skewY &&
  left.zIndex === right.zIndex &&
  left.transformOrigin[0] === right.transformOrigin[0] &&
  left.transformOrigin[1] === right.transformOrigin[1];
