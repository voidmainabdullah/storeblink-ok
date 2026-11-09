import { z } from "zod";
import type {
  ComponentLibrary,
  ElementType,
  JsonValue,
  NodeId,
  SceneTree,
} from "@/types";

const builtInElementTypes = ["text", "image", "button", "container", "section", "shape", "svg", "video"] as const;

export const nodeIdSchema = z.string().min(1);

export const elementTypeSchema = z
  .union([
    z.enum(builtInElementTypes),
    z.custom<`custom:${string}`>(
      (value) => typeof value === "string" && value.startsWith("custom:") && value.length > "custom:".length,
      "Custom element types must use the custom:<name> format",
    ),
  ])
  .transform((value) => value as ElementType);

export const transformDataSchema = z.object({
  x: z.number().finite(),
  y: z.number().finite(),
  width: z.number().finite().nonnegative(),
  height: z.number().finite().nonnegative(),
  rotation: z.number().finite(),
  scaleX: z.number().finite(),
  scaleY: z.number().finite(),
  skewX: z.number().finite(),
  skewY: z.number().finite(),
  transformOrigin: z.tuple([z.number().finite(), z.number().finite()]),
  zIndex: z.number().finite(),
});

const axisSizeDataSchema = z.object({
  mode: z.enum(["fixed", "hug", "fill", "minmax", "percentage"]),
  value: z.number().finite().nonnegative().optional(),
  min: z.number().finite().nonnegative().optional(),
  max: z.number().finite().nonnegative().optional(),
  percentage: z.number().finite().min(0).max(1).optional(),
});

const layoutPaddingSchema = z.union([
  z.number().finite().nonnegative(),
  z.object({
    top: z.number().finite().nonnegative(),
    right: z.number().finite().nonnegative(),
    bottom: z.number().finite().nonnegative(),
    left: z.number().finite().nonnegative(),
  }),
]);

export const layoutDataSchema = z.object({
  mode: z.enum(["absolute", "horizontal", "vertical", "grid", "overlay", "flex"]),
  sizing: z.object({
    width: axisSizeDataSchema.optional(),
    height: axisSizeDataSchema.optional(),
  }).optional(),
  constraints: z.object({
    horizontal: z.enum(["left", "right", "center", "stretch", "scale", "fixed", "fill", "hug"]).optional(),
    vertical: z.enum(["top", "bottom", "center", "stretch", "scale", "fixed", "fill", "hug"]).optional(),
    left: z.number().finite().optional(),
    right: z.number().finite().optional(),
    top: z.number().finite().optional(),
    bottom: z.number().finite().optional(),
  }).optional(),
  autoLayout: z.object({
    padding: layoutPaddingSchema.optional(),
    gap: z.number().finite().nonnegative().optional(),
    rowGap: z.number().finite().nonnegative().optional(),
    columnGap: z.number().finite().nonnegative().optional(),
    alignment: z.enum(["start", "center", "end", "stretch"]).optional(),
    distribution: z.enum(["start", "center", "end", "space-between", "space-around", "space-evenly"]).optional(),
    wrap: z.boolean().optional(),
    columns: z.union([z.number().int().positive(), z.literal("auto")]).optional(),
    minColumnWidth: z.number().finite().positive().optional(),
    order: z.number().finite().optional(),
    position: z.enum(["flow", "absolute"]).optional(),
  }).optional(),
  responsiveIntent: z.object({
    width: z.enum(["fixed", "hug", "fill", "minmax", "percentage"]).optional(),
    height: z.enum(["fixed", "hug", "fill", "minmax", "percentage"]).optional(),
    narrowBehavior: z.enum(["preserve", "stack", "wrap", "collapse"]).optional(),
    overflow: z.enum(["visible", "wrap", "clip", "scroll"]).optional(),
    preserveAspectRatio: z.boolean().optional(),
    minimumReadableSize: z.number().finite().positive().optional(),
  }).optional(),
  responsive: z.record(z.unknown()).optional(),
});

export const fillSchema = z.union([
  z.object({ type: z.literal("solid"), color: z.string() }),
  z.object({ type: z.literal("gradient"), value: z.string() }),
  z.object({ type: z.literal("image"), assetId: z.string().optional(), src: z.string().optional() }),
]);

export const strokeSchema = z.object({
  color: z.string(),
  width: z.number().finite().nonnegative(),
  style: z.enum(["solid", "dashed", "dotted"]).optional(),
});

export const effectSchema = z.object({
  type: z.enum(["shadow", "blur", "custom"]),
  value: z.record(z.unknown()),
});

export const cornerRadiusSchema = z.union([
  z.number().finite().nonnegative(),
  z.object({
    topLeft: z.number().finite().nonnegative(),
    topRight: z.number().finite().nonnegative(),
    bottomRight: z.number().finite().nonnegative(),
    bottomLeft: z.number().finite().nonnegative(),
  }),
]);

export const styleDataSchema = z.object({
  fills: z.array(fillSchema),
  strokes: z.array(strokeSchema),
  effects: z.array(effectSchema),
  opacity: z.number().finite().min(0).max(1),
  cornerRadius: cornerRadiusSchema.optional(),
});

export const nodeMetaSchema = z.object({
  locked: z.boolean(),
  hidden: z.boolean(),
  componentId: z.string().optional(),
  componentInstance: z.object({
    componentDefinitionId: z.string().min(1),
    variantId: z.string().min(1),
    overrides: z.array(z.object({
      sourceNodeId: nodeIdSchema,
      scope: z.enum(["text", "image", "link", "product-binding", "visibility"]),
      patch: z.object({
        props: z.record(z.unknown()).optional(),
        style: z.record(z.unknown()).optional(),
        meta: z.object({ hidden: z.boolean().optional() }).optional(),
        extensions: z.record(z.unknown()).optional(),
      }),
    })),
    detached: z.literal(false),
  }).optional(),
  createdAt: z.number().finite(),
  updatedAt: z.number().finite(),
});

export const sceneNodeSchema = z.object({
  id: nodeIdSchema,
  type: elementTypeSchema,
  name: z.string().min(1),
  parentId: nodeIdSchema.nullable(),
  childIds: z.array(nodeIdSchema),
  props: z.record(z.unknown()),
  style: styleDataSchema,
  layout: layoutDataSchema,
  transform: transformDataSchema,
  meta: nodeMetaSchema,
  extensions: z.record(z.unknown()).optional(),
});

export type SceneTreeValidationResult = {
  valid: boolean;
  errors: string[];
};

export const validateSceneTreeStructure = (tree: SceneTree): SceneTreeValidationResult => {
  const errors: string[] = [];
  const ids = Object.keys(tree.nodes);

  for (const [key, node] of Object.entries(tree.nodes)) {
    if (key !== node.id) errors.push(`Node map key ${key} does not match node id ${node.id}.`);
  }

  if (ids.length === 0) {
    if (tree.rootNodeId !== null) errors.push("Empty scene tree must have a null rootNodeId.");
    return { valid: errors.length === 0, errors };
  }

  if (!tree.rootNodeId) errors.push("Non-empty scene tree must have a rootNodeId.");
  if (tree.rootNodeId && !tree.nodes[tree.rootNodeId]) errors.push(`Root node ${tree.rootNodeId} is missing.`);

  for (const node of Object.values(tree.nodes)) {
    if (node.parentId === null && node.id !== tree.rootNodeId) {
      errors.push(`Node ${node.id} has no parent but is not the root node.`);
    }
    if (node.parentId !== null && !tree.nodes[node.parentId]) {
      errors.push(`Node ${node.id} references missing parent ${node.parentId}.`);
    }
    for (const childId of node.childIds) {
      const child = tree.nodes[childId];
      if (!child) {
        errors.push(`Node ${node.id} references missing child ${childId}.`);
      } else if (child.parentId !== node.id) {
        errors.push(`Child ${childId} does not point back to parent ${node.id}.`);
      }
    }
  }

  const visited = new Set<NodeId>();
  const visiting = new Set<NodeId>();
  const visit = (nodeId: NodeId): void => {
    if (visiting.has(nodeId)) {
      errors.push(`Cycle detected at node ${nodeId}.`);
      return;
    }
    if (visited.has(nodeId)) return;
    visiting.add(nodeId);
    const node = tree.nodes[nodeId];
    if (node) {
      for (const childId of node.childIds) visit(childId);
    }
    visiting.delete(nodeId);
    visited.add(nodeId);
  };

  if (tree.rootNodeId && tree.nodes[tree.rootNodeId]) visit(tree.rootNodeId);
  for (const nodeId of ids) {
    if (!visited.has(nodeId)) errors.push(`Node ${nodeId} is not reachable from the root.`);
  }

  return { valid: errors.length === 0, errors };
};

const componentLibraryReferenceSchema = z.custom<ComponentLibrary>((value) => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const library = value as Partial<ComponentLibrary>;
  return library.version === 1 && Boolean(
    library.definitions &&
    typeof library.definitions === "object" &&
    !Array.isArray(library.definitions),
  );
}, "Component library must use the version 1 definition envelope.");

export const sceneTreeSchema = z
  .object({
    rootNodeId: nodeIdSchema.nullable(),
    nodes: z.record(sceneNodeSchema),
    components: componentLibraryReferenceSchema.optional(),
  })
  .superRefine((tree, context) => {
    const result = validateSceneTreeStructure(tree as SceneTree);
    for (const error of result.errors) {
      context.addIssue({ code: z.ZodIssueCode.custom, message: error });
    }
    Object.values(tree.nodes).forEach((node) => {
      const instance = node.meta.componentInstance;
      if (!instance) return;
      if (node.meta.componentId !== instance.componentDefinitionId) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Component instance ${node.id} has inconsistent definition metadata.`,
        });
      }
      const definition = tree.components?.definitions[instance.componentDefinitionId];
      if (!definition) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Component instance ${node.id} references missing definition ${instance.componentDefinitionId}.`,
        });
      } else if (!definition.variants[instance.variantId]) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Component instance ${node.id} references missing variant ${instance.variantId}.`,
        });
      }
    });
    Object.entries(tree.components?.definitions ?? {}).forEach(([definitionId, definition]) => {
      if (definition.id !== definitionId) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Component definition key ${definitionId} does not match ${definition.id}.`,
        });
      }
      if (!definition.variants[definition.defaultVariantId]) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Component ${definitionId} is missing default variant ${definition.defaultVariantId}.`,
        });
      }
      Object.entries(definition.variants).forEach(([variantId, variant]) => {
        if (variant.id !== variantId) {
          context.addIssue({
            code: z.ZodIssueCode.custom,
            message: `Component ${definitionId} variant key ${variantId} does not match ${variant.id}.`,
          });
        }
        const variantStructure = validateSceneTreeStructure(variant.tree as SceneTree);
        variantStructure.errors.forEach((error) => context.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Component ${definitionId}/${variantId}: ${error}`,
        }));
      });
    });
    const sharedChrome = tree.components?.sharedChrome;
    ([sharedChrome?.headerDefinitionId, sharedChrome?.footerDefinitionId])
      .filter((definitionId): definitionId is string => Boolean(definitionId))
      .forEach((definitionId) => {
        if (!tree.components?.definitions[definitionId]) {
          context.addIssue({
            code: z.ZodIssueCode.custom,
            message: `Shared chrome references missing component ${definitionId}.`,
          });
        }
      });
  });

export const jsonValueSchema: z.ZodType<JsonValue> = z.lazy(() =>
  z.union([z.string(), z.number(), z.boolean(), z.null(), z.array(jsonValueSchema), z.record(jsonValueSchema)]),
);

export const assetRefSchema = z.object({
  id: z.string().min(1),
  type: z.enum(["image", "svg", "video", "font", "icon", "palette", "template", "custom"]),
  name: z.string().optional(),
  url: z.string().optional(),
  metadata: z.record(jsonValueSchema).optional(),
});

export const pageSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  rootNodeId: nodeIdSchema,
});

export const projectSchema = z.object({
  id: z.string().min(1),
  schemaVersion: z.number().int().positive(),
  name: z.string().min(1),
  pages: z.array(pageSchema),
  assets: z.array(assetRefSchema),
  preferences: z.record(jsonValueSchema),
  metadata: z.object({
    createdAt: z.number().finite(),
    updatedAt: z.number().finite(),
  }),
});

export const importedDataSchema = z.union([projectSchema, sceneTreeSchema, sceneNodeSchema]);
