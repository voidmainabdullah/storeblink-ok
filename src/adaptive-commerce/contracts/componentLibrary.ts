import { z } from "zod";
import { exactVersionSchema, integrityHashSchema, packageIdSchema } from "./identifiers";
import { jsonValueSchema } from "./json";

export const componentPropertyDefinitionSchema = z.object({
  id: packageIdSchema,
  label: z.string().min(1),
  valueType: z.enum(["string", "number", "boolean", "color", "rich-text", "image", "link", "product", "collection", "menu"]),
  required: z.boolean(),
  defaultValue: jsonValueSchema.optional(),
}).strict();

export const componentSlotDefinitionSchema = z.object({
  id: packageIdSchema,
  accepts: z.array(z.string().min(1)).min(1),
  required: z.boolean(),
  minimumItems: z.number().int().nonnegative(),
  maximumItems: z.number().int().positive().nullable(),
  static: z.boolean(),
}).strict().superRefine((value, context) => {
  if (value.maximumItems !== null && value.maximumItems < value.minimumItems) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "Slot maximumItems must be at least minimumItems." });
  }
});

export const componentVariantDefinitionSchema = z.object({
  id: packageIdSchema,
  name: z.string().min(1),
  requiredSlots: z.array(packageIdSchema),
  defaults: z.record(jsonValueSchema),
}).strict();

export const componentAccessibilitySchema = z.object({
  landmark: z.enum(["none", "header", "nav", "main", "section", "aside", "footer", "form"]),
  accessibleNameProperty: packageIdSchema.nullable(),
  requiredAltSlots: z.array(packageIdSchema),
  requiresHeading: z.boolean(),
}).strict();

export const componentCustomizationPolicySchema = z.object({
  allowVariantChange: z.boolean(),
  allowSlotReorder: z.boolean(),
  allowBlocks: z.boolean(),
  allowFreeform: z.boolean(),
  editableProperties: z.array(packageIdSchema),
  editableSlots: z.array(packageIdSchema),
}).strict();

export const adaptiveComponentDefinitionSchema = z.object({
  id: packageIdSchema,
  version: exactVersionSchema,
  name: z.string().min(1),
  role: z.enum(["section", "block", "global-region"]),
  properties: z.array(componentPropertyDefinitionSchema),
  slots: z.array(componentSlotDefinitionSchema),
  variants: z.array(componentVariantDefinitionSchema).min(1),
  defaultVariantId: packageIdSchema,
  responsivePolicy: packageIdSchema,
  commerceBindingIds: z.array(packageIdSchema),
  customization: componentCustomizationPolicySchema,
  a11y: componentAccessibilitySchema,
}).strict().superRefine((value, context) => {
  const unique = (items: readonly string[], path: string) => {
    const seen = new Set<string>();
    items.forEach((item, index) => {
      if (seen.has(item)) {
        context.addIssue({ code: z.ZodIssueCode.custom, path: [path, index], message: `Duplicate ${path} id ${item}.` });
      }
      seen.add(item);
    });
    return seen;
  };
  const properties = unique(value.properties.map((entry) => entry.id), "properties");
  const slots = unique(value.slots.map((entry) => entry.id), "slots");
  const variants = unique(value.variants.map((entry) => entry.id), "variants");
  if (!variants.has(value.defaultVariantId)) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["defaultVariantId"], message: "Default variant is not declared." });
  }
  value.variants.forEach((variant, index) => variant.requiredSlots.forEach((slot) => {
    if (!slots.has(slot)) context.addIssue({ code: z.ZodIssueCode.custom, path: ["variants", index, "requiredSlots"], message: `Unknown slot ${slot}.` });
  }));
  value.customization.editableProperties.forEach((property) => {
    if (!properties.has(property)) context.addIssue({ code: z.ZodIssueCode.custom, path: ["customization", "editableProperties"], message: `Unknown property ${property}.` });
  });
  value.customization.editableSlots.forEach((slot) => {
    if (!slots.has(slot)) context.addIssue({ code: z.ZodIssueCode.custom, path: ["customization", "editableSlots"], message: `Unknown slot ${slot}.` });
  });
  value.a11y.requiredAltSlots.forEach((slot) => {
    if (!slots.has(slot)) context.addIssue({ code: z.ZodIssueCode.custom, path: ["a11y", "requiredAltSlots"], message: `Unknown alt-text slot ${slot}.` });
  });
  if (value.a11y.accessibleNameProperty && !properties.has(value.a11y.accessibleNameProperty)) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["a11y", "accessibleNameProperty"], message: "Accessible-name property is not declared." });
  }
});

export const adaptiveComponentLibrarySchema = z.object({
  kind: z.literal("component-library"),
  id: packageIdSchema,
  version: exactVersionSchema,
  integrity: integrityHashSchema,
  schemaVersion: z.number().int().positive(),
  name: z.string().min(1),
  components: z.record(packageIdSchema, adaptiveComponentDefinitionSchema),
}).strict().superRefine((value, context) => {
  Object.entries(value.components).forEach(([key, component]) => {
    if (key !== component.id) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ["components", key], message: `Component key ${key} does not match id ${component.id}.` });
    }
  });
});

export type ComponentPropertyDefinition = z.infer<typeof componentPropertyDefinitionSchema>;
export type ComponentSlotDefinition = z.infer<typeof componentSlotDefinitionSchema>;
export type ComponentVariantDefinition = z.infer<typeof componentVariantDefinitionSchema>;
export type AdaptiveComponentDefinition = z.infer<typeof adaptiveComponentDefinitionSchema>;
export type AdaptiveComponentLibrary = z.infer<typeof adaptiveComponentLibrarySchema>;

