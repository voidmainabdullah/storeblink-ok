import type { LayoutData } from "@/types";

export const RESPONSIVE_PRIMITIVE_KINDS = [
  "Stack",
  "Grid",
  "Container",
  "Cluster",
  "Overlay",
  "MediaFrame",
  "Freeform",
  "Anchor",
] as const;

export type ResponsivePrimitiveKind = (typeof RESPONSIVE_PRIMITIVE_KINDS)[number];

export type InlineDirection = "ltr" | "rtl";
export type BlockDirection = "top-to-bottom";

export type ResponsiveCompileContext = Readonly<{
  direction: InlineDirection;
  blockDirection?: BlockDirection;
  viewportInlineSize: number;
  containerInlineSize: number;
  anchorPositioningSupported?: boolean;
}>;

export type FluidClampValue = Readonly<{
  kind: "fluid-clamp";
  min: number;
  preferred: Readonly<{
    base: number;
    scale: number;
    basis: "container-inline" | "viewport-inline";
  }>;
  max: number;
  unit?: "px";
}>;

export type ResponsiveLength = number | FluidClampValue;

export type LogicalEdges<T> = Readonly<{
  inlineStart?: T;
  inlineEnd?: T;
  blockStart?: T;
  blockEnd?: T;
}>;

export type PrimitiveAxisSize = Readonly<{
  mode: "fixed" | "hug" | "fill" | "minmax" | "percentage";
  value?: ResponsiveLength;
  min?: ResponsiveLength;
  max?: ResponsiveLength;
  percentage?: number;
}>;

export type PrimitiveSizing = Readonly<{
  inline?: PrimitiveAxisSize;
  block?: PrimitiveAxisSize;
}>;

export type PrimitiveAlignment = "start" | "center" | "end" | "stretch";
export type PrimitiveDistribution =
  | "start"
  | "center"
  | "end"
  | "space-between"
  | "space-around"
  | "space-evenly";

export type PrimitiveBase = Readonly<{
  id: string;
  sizing?: PrimitiveSizing;
  padding?: LogicalEdges<ResponsiveLength>;
}>;

export type StackPrimitive = PrimitiveBase & Readonly<{
  kind: "Stack";
  axis?: "inline" | "block";
  gap?: ResponsiveLength;
  alignment?: PrimitiveAlignment;
  distribution?: PrimitiveDistribution;
  wrap?: boolean;
}>;

export type GridPrimitive = PrimitiveBase & Readonly<{
  kind: "Grid";
  columns: number | "auto-fit";
  maxColumns?: number;
  minItemInlineSize?: ResponsiveLength;
  gap?: ResponsiveLength;
  rowGap?: ResponsiveLength;
  columnGap?: ResponsiveLength;
  namedAreas?: Readonly<Record<string, readonly string[]>>;
}>;

export type ContainerQueryRule = Readonly<{
  variant: string;
  minInlineSize?: number;
  maxInlineSize?: number;
}>;

export type ContainerQueryPolicy = Readonly<{
  name: string;
  fallbackVariant: string;
  rules: readonly ContainerQueryRule[];
}>;

export type ContainerPrimitive = PrimitiveBase & Readonly<{
  kind: "Container";
  maxInlineSize?: ResponsiveLength;
  gutter?: ResponsiveLength;
  query?: ContainerQueryPolicy;
}>;

export type ClusterPrimitive = PrimitiveBase & Readonly<{
  kind: "Cluster";
  gap?: ResponsiveLength;
  alignment?: PrimitiveAlignment;
  distribution?: PrimitiveDistribution;
}>;

export type OverlayPrimitive = PrimitiveBase & Readonly<{
  kind: "Overlay";
  alignment?: PrimitiveAlignment;
}>;

export type MediaFramePrimitive = PrimitiveBase & Readonly<{
  kind: "MediaFrame";
  aspectRatio: number | readonly [number, number];
  focalPoint?: Readonly<{ inline: number; block: number }>;
  fit?: "cover" | "contain";
  src?: string;
  srcSet?: string;
  sizes?: string;
  alt?: string;
  loading?: "lazy" | "eager";
}>;

export type FreeformPrimitive = PrimitiveBase & Readonly<{
  kind: "Freeform";
  inlineSize: ResponsiveLength;
  blockSize: ResponsiveLength;
}>;

export type AnchorLogicalSide =
  | "inline-start"
  | "inline-end"
  | "block-start"
  | "block-end"
  | "center";

export type AnchorPrimitive = PrimitiveBase & Readonly<{
  kind: "Anchor";
  targetId: string;
  targetSide: AnchorLogicalSide;
  selfSide?: AnchorLogicalSide;
  progressiveEnhancement?: boolean;
  offset?: LogicalEdges<ResponsiveLength>;
  fallback: Readonly<{
    inlineStart: ResponsiveLength;
    blockStart: ResponsiveLength;
    selfInlineSize?: ResponsiveLength;
  }>;
}>;

export type ResponsivePrimitive =
  | StackPrimitive
  | GridPrimitive
  | ContainerPrimitive
  | ClusterPrimitive
  | OverlayPrimitive
  | MediaFramePrimitive
  | FreeformPrimitive
  | AnchorPrimitive;

export type CompiledResponsivePrimitive = Readonly<{
  id: string;
  kind: ResponsivePrimitive["kind"];
  layout: LayoutData;
  props: Readonly<Record<string, unknown>>;
  extensions: Readonly<{
    adaptivePrimitive: Readonly<Record<string, unknown>>;
    fluidValues?: Readonly<Record<string, string>>;
  }>;
  placement?: Readonly<{ x: number; y: number }>;
}>;
