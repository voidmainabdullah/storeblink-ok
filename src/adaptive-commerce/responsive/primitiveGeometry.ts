import { ResponsivePrimitiveError, resolveResponsiveLength } from "./fluid";
import { logicalInlineStartToX } from "./logical";
import type { AnchorPrimitive, ResponsiveCompileContext } from "./types";

export const resolveMediaAspectRatio = (
  value: number | readonly [number, number],
): number => {
  const ratio = typeof value === "number" ? value : value[0] / value[1];
  if (!Number.isFinite(ratio) || ratio <= 0) {
    throw new ResponsivePrimitiveError("MediaFrame aspect ratio must be positive and finite.");
  }
  return ratio;
};

export const resolveAnchorFallbackPlacement = (
  primitive: AnchorPrimitive,
  context: ResponsiveCompileContext,
): { x: number; y: number; selfInlineSize: number } => {
  const inlineStart = resolveResponsiveLength(primitive.fallback.inlineStart, context);
  const blockStart = resolveResponsiveLength(primitive.fallback.blockStart, context);
  const selfInlineSize = primitive.fallback.selfInlineSize === undefined
    ? resolveResponsiveLength(primitive.sizing?.inline?.value ?? 0, context)
    : resolveResponsiveLength(primitive.fallback.selfInlineSize, context);
  if (selfInlineSize < 0) {
    throw new ResponsivePrimitiveError("Anchor fallback inline size cannot be negative.");
  }
  return {
    x: logicalInlineStartToX({
      inlineStart,
      selfInlineSize,
      containerInlineSize: context.containerInlineSize,
      direction: context.direction,
    }),
    y: blockStart,
    selfInlineSize,
  };
};
