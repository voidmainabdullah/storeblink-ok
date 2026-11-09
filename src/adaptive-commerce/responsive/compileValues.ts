import type { AxisSizeData, LayoutData } from "@/types";
import {
  ResponsivePrimitiveError,
  resolveResponsiveLength,
  responsiveLengthCss,
} from "./fluid";
import type {
  PrimitiveAxisSize,
  PrimitiveSizing,
  ResponsiveCompileContext,
  ResponsiveLength,
} from "./types";

export const assertResponsiveCompileContext = (context: ResponsiveCompileContext): void => {
  if (context.direction !== "ltr" && context.direction !== "rtl") {
    throw new ResponsivePrimitiveError("Inline direction must be ltr or rtl.");
  }
  if (!Number.isFinite(context.viewportInlineSize) || context.viewportInlineSize <= 0) {
    throw new ResponsivePrimitiveError("Viewport inline size must be positive and finite.");
  }
  if (!Number.isFinite(context.containerInlineSize) || context.containerInlineSize <= 0) {
    throw new ResponsivePrimitiveError("Container inline size must be positive and finite.");
  }
  if (context.blockDirection && context.blockDirection !== "top-to-bottom") {
    throw new ResponsivePrimitiveError("Only top-to-bottom block flow is currently supported.");
  }
};

const axisSize = (
  input: PrimitiveAxisSize | undefined,
  context: ResponsiveCompileContext,
): AxisSizeData | undefined => {
  if (!input) return undefined;
  if (input.percentage !== undefined && (
    !Number.isFinite(input.percentage) || input.percentage < 0 || input.percentage > 1
  )) {
    throw new ResponsivePrimitiveError("Percentage sizing must be between 0 and 1.");
  }
  if (input.mode === "fixed" && input.value === undefined) {
    throw new ResponsivePrimitiveError("Fixed sizing requires a value.");
  }
  if (input.mode === "percentage" && input.percentage === undefined) {
    throw new ResponsivePrimitiveError("Percentage sizing requires a percentage.");
  }
  if (input.mode === "minmax" && input.min === undefined && input.max === undefined) {
    throw new ResponsivePrimitiveError("Minmax sizing requires a minimum or maximum.");
  }
  const output: AxisSizeData = {
    mode: input.mode,
    ...(input.value === undefined ? {} : { value: resolveResponsiveLength(input.value, context) }),
    ...(input.min === undefined ? {} : { min: resolveResponsiveLength(input.min, context) }),
    ...(input.max === undefined ? {} : { max: resolveResponsiveLength(input.max, context) }),
    ...(input.percentage === undefined ? {} : { percentage: input.percentage }),
  };
  const values = [output.value, output.min, output.max]
    .filter((value): value is number => value !== undefined);
  if (values.some((value) => value < 0)) {
    throw new ResponsivePrimitiveError("Axis sizes cannot be negative.");
  }
  if (output.min !== undefined && output.max !== undefined && output.max < output.min) {
    throw new ResponsivePrimitiveError("Axis maximum must be at least its minimum.");
  }
  return output;
};

export const compileSizing = (
  input: PrimitiveSizing | undefined,
  fallback: PrimitiveSizing,
  context: ResponsiveCompileContext,
): LayoutData["sizing"] => ({
  width: axisSize(input?.inline ?? fallback.inline, context),
  height: axisSize(input?.block ?? fallback.block, context),
});

export const resolveNonNegativeLength = (
  value: ResponsiveLength,
  context: ResponsiveCompileContext,
  label: string,
): number => {
  const resolved = resolveResponsiveLength(value, context);
  if (resolved < 0) throw new ResponsivePrimitiveError(`${label} cannot be negative.`);
  return resolved;
};

export const compileFluidValues = (
  values: Readonly<Record<string, ResponsiveLength | undefined>>,
): Readonly<Record<string, string>> | undefined => {
  const entries = Object.entries(values).flatMap(([key, value]) => {
    if (value === undefined) return [];
    const css = responsiveLengthCss(value);
    return css ? [[key, css] as const] : [];
  });
  return entries.length ? Object.freeze(Object.fromEntries(entries)) : undefined;
};
