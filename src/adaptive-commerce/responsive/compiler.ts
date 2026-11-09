import { cloneAndFreeze } from "@/adaptive-commerce/compiler/immutable";
import type { LayoutData } from "@/types";
import { ResponsivePrimitiveError } from "./fluid";
import {
  assertResponsiveCompileContext,
  compileFluidValues,
  compileSizing,
  resolveNonNegativeLength,
} from "./compileValues";
import { resolveContainerQueryVariant } from "./containerQuery";
import { resolveLogicalEdges } from "./logical";
import { resolveAnchorFallbackPlacement, resolveMediaAspectRatio } from "./primitiveGeometry";
import type {
  CompiledResponsivePrimitive,
  PrimitiveAxisSize,
  PrimitiveSizing,
  ResponsiveCompileContext,
  ResponsivePrimitive,
} from "./types";

const primitiveId = /^[A-Za-z0-9][A-Za-z0-9:_-]{0,127}$/;

const baseExtensions = (
  primitive: ResponsivePrimitive,
  context: ResponsiveCompileContext,
): Record<string, unknown> => ({
  kind: primitive.kind,
  logicalDirection: {
    inline: context.direction,
    block: context.blockDirection ?? "top-to-bottom",
  },
  contentSizing: "intrinsic",
});

export const compileResponsivePrimitive = (
  primitive: ResponsivePrimitive,
  context: ResponsiveCompileContext,
): CompiledResponsivePrimitive => {
  assertResponsiveCompileContext(context);
  if (!primitiveId.test(primitive.id)) throw new ResponsivePrimitiveError("Primitive id is invalid.");
  const extensions = baseExtensions(primitive, context);
  const props: Record<string, unknown> = {};
  let layout: LayoutData;
  let placement: { x: number; y: number } | undefined;
  let fluid: Readonly<Record<string, string>> | undefined;
  const padding = resolveLogicalEdges(primitive.padding, context);
  const flowSizing: PrimitiveSizing = {
    inline: { mode: "fill" },
    block: { mode: "hug" },
  };

  if (primitive.kind === "Stack" || primitive.kind === "Cluster") {
    const gap = resolveNonNegativeLength(primitive.gap ?? 0, context, "Flow gap");
    const inlineFlow = primitive.kind === "Cluster" || primitive.axis === "inline";
    layout = {
      mode: inlineFlow ? "horizontal" : "vertical",
      sizing: compileSizing(primitive.sizing, flowSizing, context),
      autoLayout: {
        padding,
        gap,
        alignment: primitive.alignment ?? "start",
        distribution: primitive.distribution ?? "start",
        wrap: primitive.kind === "Cluster" ? true : primitive.wrap ?? false,
      },
      responsiveIntent: { width: "fill", height: "hug", overflow: "wrap" },
    };
    fluid = compileFluidValues({ gap: primitive.gap, ...primitive.padding });
  } else if (primitive.kind === "Grid") {
    if (typeof primitive.columns === "number" && (!Number.isInteger(primitive.columns) || primitive.columns < 1)) {
      throw new ResponsivePrimitiveError("Grid columns must be a positive integer or auto-fit.");
    }
    if (primitive.maxColumns !== undefined && (!Number.isInteger(primitive.maxColumns) || primitive.maxColumns < 1)) {
      throw new ResponsivePrimitiveError("Grid maximum columns must be a positive integer.");
    }
    layout = {
      mode: "grid",
      sizing: compileSizing(primitive.sizing, flowSizing, context),
      autoLayout: {
        padding,
        gap: resolveNonNegativeLength(primitive.gap ?? 0, context, "Grid gap"),
        rowGap: resolveNonNegativeLength(primitive.rowGap ?? primitive.gap ?? 0, context, "Grid row gap"),
        columnGap: resolveNonNegativeLength(primitive.columnGap ?? primitive.gap ?? 0, context, "Grid column gap"),
        columns: primitive.columns === "auto-fit" ? "auto" : primitive.columns,
        ...(primitive.minItemInlineSize === undefined
          ? {}
          : { minColumnWidth: resolveNonNegativeLength(primitive.minItemInlineSize, context, "Grid item size") }),
      },
      responsiveIntent: { width: "fill", height: "hug", narrowBehavior: "stack", overflow: "wrap" },
    };
    extensions.grid = {
      columns: primitive.columns,
      ...(primitive.maxColumns === undefined ? {} : { maxColumns: primitive.maxColumns }),
      ...(primitive.namedAreas ? { namedAreas: structuredClone(primitive.namedAreas) } : {}),
    };
    fluid = compileFluidValues({ gap: primitive.gap, rowGap: primitive.rowGap, columnGap: primitive.columnGap, minItemInlineSize: primitive.minItemInlineSize });
  } else if (primitive.kind === "Container") {
    const gutter = primitive.gutter ?? 0;
    const containerPadding = primitive.padding ?? { inlineStart: gutter, inlineEnd: gutter };
    const inlineSizing: PrimitiveAxisSize = primitive.maxInlineSize === undefined
      ? { mode: "fill" }
      : { mode: "minmax", max: primitive.maxInlineSize };
    layout = {
      mode: "vertical",
      sizing: compileSizing(primitive.sizing, { inline: inlineSizing, block: { mode: "hug" } }, context),
      autoLayout: { padding: resolveLogicalEdges(containerPadding, context), alignment: "stretch" },
      responsiveIntent: { width: "fill", height: "hug", overflow: "wrap" },
    };
    if (primitive.query) {
      extensions.containerQuery = {
        name: primitive.query.name,
        activeVariant: resolveContainerQueryVariant(primitive.query, context.containerInlineSize),
        basisInlineSize: context.containerInlineSize,
      };
    }
    fluid = compileFluidValues({ gutter: primitive.gutter, maxInlineSize: primitive.maxInlineSize, ...containerPadding });
  } else if (primitive.kind === "Overlay") {
    layout = {
      mode: "overlay",
      sizing: compileSizing(primitive.sizing, { inline: { mode: "fill" }, block: { mode: "fill" } }, context),
      autoLayout: { padding, alignment: primitive.alignment ?? "stretch" },
      responsiveIntent: { width: "fill", height: "fill", overflow: "visible" },
    };
  } else if (primitive.kind === "MediaFrame") {
    const ratio = resolveMediaAspectRatio(primitive.aspectRatio);
    const focal = primitive.focalPoint ?? { inline: 0.5, block: 0.5 };
    if ([focal.inline, focal.block].some((value) => !Number.isFinite(value) || value < 0 || value > 1)) {
      throw new ResponsivePrimitiveError("MediaFrame focal points must be between 0 and 1.");
    }
    const physicalX = context.direction === "rtl" ? 1 - focal.inline : focal.inline;
    Object.assign(props, {
      ...(primitive.src === undefined ? {} : { src: primitive.src }),
      ...(primitive.srcSet === undefined ? {} : { srcSet: primitive.srcSet }),
      ...(primitive.sizes === undefined ? {} : { sizes: primitive.sizes }),
      alt: primitive.alt ?? "",
      loading: primitive.loading ?? "lazy",
      objectFit: primitive.fit ?? "cover",
      imagePositionX: physicalX * 100,
      imagePositionY: focal.block * 100,
    });
    layout = {
      mode: "absolute",
      sizing: compileSizing(primitive.sizing, flowSizing, context),
      responsiveIntent: { width: "fill", height: "hug", preserveAspectRatio: true },
    };
    extensions.media = { aspectRatio: ratio, focalPoint: { ...focal } };
  } else if (primitive.kind === "Freeform") {
    layout = {
      mode: "absolute",
      sizing: compileSizing(primitive.sizing, {
        inline: { mode: "fixed", value: primitive.inlineSize },
        block: { mode: "fixed", value: primitive.blockSize },
      }, context),
      responsiveIntent: { width: "fixed", height: "fixed", overflow: "visible" },
    };
    extensions.compatibilityIsland = true;
    fluid = compileFluidValues({ inlineSize: primitive.inlineSize, blockSize: primitive.blockSize });
  } else {
    if (!primitiveId.test(primitive.targetId)) throw new ResponsivePrimitiveError("Anchor target id is invalid.");
    const fallback = resolveAnchorFallbackPlacement(primitive, context);
    const native = primitive.progressiveEnhancement !== false && context.anchorPositioningSupported === true;
    placement = { x: fallback.x, y: fallback.y };
    layout = {
      mode: "absolute",
      sizing: compileSizing(primitive.sizing, {
        inline: { mode: "hug" },
        block: { mode: "hug" },
      }, context),
      responsiveIntent: { width: "hug", height: "hug", overflow: "visible" },
    };
    extensions.anchor = {
      strategy: native ? "native" : "fallback",
      targetId: primitive.targetId,
      targetSide: primitive.targetSide,
      selfSide: primitive.selfSide ?? primitive.targetSide,
      fallback: { x: fallback.x, y: fallback.y },
    };
    fluid = compileFluidValues({ ...primitive.offset, inlineStart: primitive.fallback.inlineStart, blockStart: primitive.fallback.blockStart });
  }

  return cloneAndFreeze({
    id: primitive.id,
    kind: primitive.kind,
    layout,
    props,
    extensions: {
      adaptivePrimitive: extensions,
      ...(fluid ? { fluidValues: fluid } : {}),
    },
    ...(placement ? { placement } : {}),
  }) as CompiledResponsivePrimitive;
};
