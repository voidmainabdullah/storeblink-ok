export type NodeId = string;

export type BuiltInElementType =
  | "text"
  | "image"
  | "button"
  | "container"
  | "section"
  | "shape"
  | "svg"
  | "video";

export type ElementType = BuiltInElementType | `custom:${string}`;

export type Point = {
  x: number;
  y: number;
};

export type Size = {
  width: number;
  height: number;
};

export type Rect = Point & Size;

export type TransformData = {
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  scaleX: number;
  scaleY: number;
  skewX: number;
  skewY: number;
  transformOrigin: [number, number];
  zIndex: number;
};

export type LayoutMode =
  | "absolute"
  | "horizontal"
  | "vertical"
  | "grid"
  | "overlay"
  /** @deprecated Persisted compatibility alias. New documents use horizontal. */
  | "flex";

export type SizeMode = "fixed" | "hug" | "fill" | "minmax" | "percentage";

export type AxisSizeData = {
  mode: SizeMode;
  value?: number;
  min?: number;
  max?: number;
  percentage?: number;
};

export type LayoutSizingData = {
  width?: AxisSizeData;
  height?: AxisSizeData;
};

export type HorizontalConstraint =
  | "left"
  | "right"
  | "center"
  | "stretch"
  | "scale"
  | "fixed"
  | "fill"
  | "hug";

export type VerticalConstraint =
  | "top"
  | "bottom"
  | "center"
  | "stretch"
  | "scale"
  | "fixed"
  | "fill"
  | "hug";

export type ConstraintData = {
  horizontal?: HorizontalConstraint;
  vertical?: VerticalConstraint;
  left?: number;
  right?: number;
  top?: number;
  bottom?: number;
};

export type LayoutPadding =
  | number
  | {
      top: number;
      right: number;
      bottom: number;
      left: number;
    };

export type LayoutAlignment = "start" | "center" | "end" | "stretch";
export type LayoutDistribution =
  | "start"
  | "center"
  | "end"
  | "space-between"
  | "space-around"
  | "space-evenly";

export type AutoLayoutData = {
  padding?: LayoutPadding;
  gap?: number;
  rowGap?: number;
  columnGap?: number;
  alignment?: LayoutAlignment;
  distribution?: LayoutDistribution;
  wrap?: boolean;
  columns?: number | "auto";
  minColumnWidth?: number;
  order?: number;
  position?: "flow" | "absolute";
};

export type ResponsiveNarrowBehavior = "preserve" | "stack" | "wrap" | "collapse";
export type ResponsiveOverflowIntent = "visible" | "wrap" | "clip" | "scroll";

export type ResponsiveIntent = {
  width?: SizeMode;
  height?: SizeMode;
  narrowBehavior?: ResponsiveNarrowBehavior;
  overflow?: ResponsiveOverflowIntent;
  preserveAspectRatio?: boolean;
  minimumReadableSize?: number;
};

export type ResponsiveData = Record<string, unknown>;

export type LayoutData = {
  mode: LayoutMode;
  sizing?: LayoutSizingData;
  constraints?: ConstraintData;
  autoLayout?: AutoLayoutData;
  responsiveIntent?: ResponsiveIntent;
  responsive?: ResponsiveData;
};

export type FillPresentation = {
  opacity?: number;
  visible?: boolean;
};

export type Fill =
  | ({ type: "solid"; color: string } & FillPresentation)
  | ({ type: "gradient"; value: string } & FillPresentation)
  | ({ type: "image"; assetId?: string; src?: string } & FillPresentation);

export type Stroke = {
  color: string;
  width: number;
  style?: "solid" | "dashed" | "dotted";
  opacity?: number;
  visible?: boolean;
  position?: "inside" | "center" | "outside";
  dash?: number[];
};

export type Effect = {
  type: "shadow" | "blur" | "custom";
  value: Record<string, unknown>;
};

export type CornerRadiusPerCorner = {
  topLeft: number;
  topRight: number;
  bottomRight: number;
  bottomLeft: number;
};

export type StyleData = {
  fills: Fill[];
  strokes: Stroke[];
  effects: Effect[];
  opacity: number;
  cornerRadius?: number | CornerRadiusPerCorner;
};

export type ComponentOverrideScope =
  | "text"
  | "image"
  | "link"
  | "product-binding"
  | "visibility";

export type ComponentOverridePatch = {
  props?: Record<string, unknown>;
  style?: Partial<StyleData>;
  meta?: { hidden?: boolean };
  extensions?: Record<string, unknown>;
};

export type ComponentNodeOverride = {
  sourceNodeId: NodeId;
  scope: ComponentOverrideScope;
  patch: ComponentOverridePatch;
};

export type ComponentInstanceData = {
  componentDefinitionId: string;
  variantId: string;
  overrides: ComponentNodeOverride[];
  detached: false;
};

export type NodeMeta = {
  locked: boolean;
  hidden: boolean;
  componentId?: string;
  componentInstance?: ComponentInstanceData;
  createdAt: number;
  updatedAt: number;
};

export type SceneNode = {
  id: NodeId;
  type: ElementType;
  name: string;
  parentId: NodeId | null;
  childIds: NodeId[];
  props: Record<string, unknown>;
  style: StyleData;
  layout: LayoutData;
  transform: TransformData;
  meta: NodeMeta;
  extensions?: Record<string, unknown>;
};

export type ComponentDefinitionTree = {
  rootNodeId: NodeId;
  nodes: Record<NodeId, SceneNode>;
};

export type ComponentVariant = {
  id: string;
  name: string;
  tree: ComponentDefinitionTree;
};

export type ComponentDefinition = {
  id: string;
  name: string;
  defaultVariantId: string;
  variants: Record<string, ComponentVariant>;
  masterNodeId?: NodeId;
  createdAt: number;
  updatedAt: number;
};

export type SharedChromeComponentReferences = {
  headerDefinitionId?: string;
  footerDefinitionId?: string;
};

export type ComponentLibrary = {
  version: 1;
  definitions: Record<string, ComponentDefinition>;
  sharedChrome?: SharedChromeComponentReferences;
};

export type SceneTree = {
  rootNodeId: NodeId | null;
  nodes: Record<NodeId, SceneNode>;
  components?: ComponentLibrary;
};

export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };

export type AssetRef = {
  id: string;
  type: "image" | "svg" | "video" | "font" | "icon" | "palette" | "template" | "custom";
  name?: string;
  url?: string;
  metadata?: Record<string, JsonValue>;
};

export type ProjectPreferences = Record<string, JsonValue>;

export type Page = {
  id: string;
  name: string;
  rootNodeId: NodeId;
};

export type Project = {
  id: string;
  schemaVersion: number;
  name: string;
  pages: Page[];
  assets: AssetRef[];
  preferences: ProjectPreferences;
  metadata: {
    createdAt: number;
    updatedAt: number;
  };
};

export const DEFAULT_TRANSFORM: TransformData = {
  x: 0,
  y: 0,
  width: 100,
  height: 100,
  rotation: 0,
  scaleX: 1,
  scaleY: 1,
  skewX: 0,
  skewY: 0,
  transformOrigin: [0.5, 0.5],
  zIndex: 0,
};

export const DEFAULT_LAYOUT: LayoutData = {
  mode: "absolute",
};

export const DEFAULT_STYLE: StyleData = {
  fills: [],
  strokes: [],
  effects: [],
  opacity: 1,
};

export const createNodeMeta = (timestamp = Date.now()): NodeMeta => ({
  locked: false,
  hidden: false,
  createdAt: timestamp,
  updatedAt: timestamp,
});

export const createEmptySceneTree = (): SceneTree => ({
  rootNodeId: null,
  nodes: {},
});
