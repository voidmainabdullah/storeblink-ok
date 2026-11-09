import type { LayoutPadding } from "@/types";
import { ResponsivePrimitiveError, resolveResponsiveLength } from "./fluid";
import type {
  LogicalEdges,
  ResponsiveCompileContext,
  ResponsiveLength,
} from "./types";

const length = (
  value: ResponsiveLength | undefined,
  context: ResponsiveCompileContext,
): number => {
  const resolved = value === undefined ? 0 : resolveResponsiveLength(value, context);
  if (resolved < 0) throw new ResponsivePrimitiveError("Logical padding cannot be negative.");
  return resolved;
};

export const resolveLogicalEdges = (
  edges: LogicalEdges<ResponsiveLength> | undefined,
  context: ResponsiveCompileContext,
): Exclude<LayoutPadding, number> => {
  const inlineStart = length(edges?.inlineStart, context);
  const inlineEnd = length(edges?.inlineEnd, context);
  return {
    top: length(edges?.blockStart, context),
    right: context.direction === "rtl" ? inlineStart : inlineEnd,
    bottom: length(edges?.blockEnd, context),
    left: context.direction === "rtl" ? inlineEnd : inlineStart,
  };
};

export const logicalInlineStartToX = (input: {
  inlineStart: number;
  selfInlineSize: number;
  containerInlineSize: number;
  direction: "ltr" | "rtl";
}): number => input.direction === "rtl"
  ? input.containerInlineSize - input.inlineStart - input.selfInlineSize
  : input.inlineStart;
