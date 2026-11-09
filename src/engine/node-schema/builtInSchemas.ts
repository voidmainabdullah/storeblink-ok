import { z } from "zod";
import { createSceneNode } from "@/engine/scene-graph/nodeFactory";
import { styleDataSchema } from "@/engine/validation/schemas";
import type { BuiltInElementType, ElementType, SceneNode, StyleData } from "@/types";
import type { NodeCapabilities, NodeMigration, NodeSchema } from "./types";
import { createNodeSchemaRegistry, type NodeSchemaRegistry } from "./NodeSchemaRegistry";

const finiteNumber = z.number().finite();
const optionalString = z.string().optional();
const commonProps = z.object({
  ariaLabel: optionalString,
}).passthrough();

const propsSchemas: Record<BuiltInElementType, z.ZodType<Record<string, unknown>>> = {
  text: commonProps.extend({
    text: optionalString,
    content: optionalString,
    color: optionalString,
    fontFamily: optionalString,
    fontSize: finiteNumber.positive().optional(),
    fontWeight: z.union([z.string(), finiteNumber]).optional(),
    lineHeight: z.union([z.literal("normal"), finiteNumber.positive()]).optional(),
    letterSpacing: finiteNumber.optional(),
    textAlign: z.enum(["left", "center", "right", "justify", "start", "end"]).optional(),
  }).passthrough(),
  image: commonProps.extend({
    src: optionalString,
    assetId: optionalString,
    alt: optionalString,
    objectFit: z.enum(["fill", "contain", "cover", "none", "scale-down"]).optional(),
    imageScale: finiteNumber.positive().optional(),
  }).passthrough(),
  button: commonProps.extend({
    label: optionalString,
    text: optionalString,
    color: optionalString,
    background: optionalString,
    disabled: z.boolean().optional(),
  }).passthrough(),
  container: commonProps.extend({
    overflow: z.enum(["visible", "hidden", "clip", "auto", "scroll"]).optional(),
  }).passthrough(),
  section: commonProps.extend({
    overflow: z.enum(["visible", "hidden", "clip", "auto", "scroll"]).optional(),
  }).passthrough(),
  shape: commonProps.extend({
    shapeKind: z.enum(["rectangle", "circle", "ellipse", "triangle", "line", "arrow", "star", "polygon", "diamond"]).optional(),
  }).passthrough(),
  svg: commonProps.extend({
    src: optionalString,
    svg: z.unknown().optional(),
    markup: z.unknown().optional(),
  }).passthrough(),
  video: commonProps.extend({
    src: optionalString,
    poster: optionalString,
    controls: z.boolean().optional(),
  }).passthrough(),
};

const leafCapabilities = (overrides: Partial<NodeCapabilities> = {}): NodeCapabilities => ({
  selectable: true,
  movable: true,
  resizable: true,
  rotatable: true,
  croppable: false,
  bindable: false,
  layoutContainer: false,
  acceptsChildren: false,
  supportsAutoLayout: false,
  supportsResponsiveOverrides: true,
  ...overrides,
});

const containerCapabilities = leafCapabilities({
  bindable: true,
  layoutContainer: true,
  acceptsChildren: true,
  supportsAutoLayout: true,
});

const parentTypes = ["section", "container", "custom:*"] as const;
const rootParentTypes = ["$root", ...parentTypes] as const;
const responsiveProperties = [
  "transform.x",
  "transform.y",
  "transform.width",
  "transform.height",
  "transform.rotation",
  "layout.sizing.width",
  "layout.sizing.height",
  "layout.constraints.horizontal",
  "layout.constraints.vertical",
  "layout.autoLayout",
  "layout.responsiveIntent",
  "props.fontSize",
  "props.lineHeight",
  "props.letterSpacing",
  "meta.hidden",
] as const;

const imageMigrations: readonly NodeMigration[] = [{
  id: "image-fit-to-object-fit-v2",
  fromVersion: 1,
  toVersion: 2,
  migrate: (node) => {
    const { fit, ...props } = node.props;
    const objectFit =
      props.objectFit ??
      (["fill", "contain", "cover", "none", "scale-down"].includes(String(fit))
        ? fit
        : undefined);
    return {
      ...structuredClone(node),
      props: {
        ...props,
        ...(objectFit ? { objectFit } : {}),
      },
    } as SceneNode;
  },
}];

const schemaFor = (type: BuiltInElementType): NodeSchema => {
  const acceptsChildren = type === "container" || type === "section";
  const capabilities = acceptsChildren
    ? containerCapabilities
    : leafCapabilities({
        croppable: type === "image",
        bindable: ["text", "image", "button", "video"].includes(type),
      });
  return {
    type,
    version: type === "image" ? 2 : 1,
    allowedParents: type === "section" || type === "container" ? rootParentTypes : parentTypes,
    allowedChildren: acceptsChildren ? ["*"] : [],
    defaultFactory: () => createSceneNode({ type, name: type[0].toUpperCase() + type.slice(1) }, null),
    propsSchema: propsSchemas[type],
    styleSchema: styleDataSchema as unknown as z.ZodType<StyleData>,
    extensionSchema: z.record(z.unknown()),
    responsiveProperties,
    capabilities,
    ...(type === "image" ? { migrations: imageMigrations } : {}),
  };
};

const customSchema = (): NodeSchema => ({
  type: "custom:*",
  version: 1,
  allowedParents: rootParentTypes,
  allowedChildren: ["*"],
  defaultFactory: () => createSceneNode({ type: "custom:element", name: "Custom element" }, null),
  propsSchema: z.record(z.unknown()),
  styleSchema: styleDataSchema as unknown as z.ZodType<StyleData>,
  extensionSchema: z.record(z.unknown()),
  responsiveProperties,
  capabilities: containerCapabilities,
});

export const registerBuiltInNodeSchemas = (registry: NodeSchemaRegistry): NodeSchemaRegistry => {
  (["text", "image", "button", "container", "section", "shape", "svg", "video"] satisfies BuiltInElementType[])
    .forEach((type) => registry.register(schemaFor(type)));
  registry.register(customSchema());
  return registry;
};

export const createBuiltInNodeSchemaRegistry = (): NodeSchemaRegistry =>
  registerBuiltInNodeSchemas(createNodeSchemaRegistry());

export const isRegisteredElementType = (registry: NodeSchemaRegistry, type: string): type is ElementType =>
  Boolean(registry.get(type as ElementType));
