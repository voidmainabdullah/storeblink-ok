import { z } from "zod";
import { commerceBindingSchema } from "./commerceBinding";
import {
  exactVersionSchema,
  integrityHashSchema,
  packageIdSchema,
  semanticPathSchema,
  STOREFRONT_RESOURCE_SEMANTIC_PREFIXES,
  storefrontResourceTypeSchema,
  versionedPackageRefSchema,
} from "./identifiers";
import { jsonValueSchema } from "./json";

export const GLOBAL_REGION_SLOTS = [
  "announcement",
  "header",
  "footer",
  "cart-drawer",
  "search-overlay",
] as const;

export const globalRegionSlotSchema = z.enum(GLOBAL_REGION_SLOTS);

export const blueprintSlotValueSchema = z.object({
  slotId: packageIdSchema,
  value: jsonValueSchema,
}).strict();

export const blueprintSectionReferenceSchema = z.object({
  path: semanticPathSchema,
  componentId: packageIdSchema,
  variantId: packageIdSchema,
  properties: z.record(jsonValueSchema),
  slots: z.array(blueprintSlotValueSchema),
  bindingIds: z.array(packageIdSchema),
}).strict();

export const globalRegionReferenceSchema = z.object({
  slot: globalRegionSlotSchema,
  path: semanticPathSchema.refine((value) => value.startsWith("global."), "Global region paths must start with global."),
  componentId: packageIdSchema,
  variantId: packageIdSchema,
  properties: z.record(jsonValueSchema),
  slots: z.array(blueprintSlotValueSchema),
  bindingIds: z.array(packageIdSchema),
}).strict();

export const blueprintCompositionPatchSchema = z.object({
  target: semanticPathSchema,
  set: z.record(jsonValueSchema),
}).strict();

export const templateBlueprintSchema = z.object({
  kind: z.literal("template-blueprint"),
  id: packageIdSchema,
  version: exactVersionSchema,
  integrity: integrityHashSchema,
  schemaVersion: z.number().int().positive(),
  name: z.string().min(1),
  resourceType: storefrontResourceTypeSchema,
  extends: versionedPackageRefSchema.nullable(),
  sections: z.array(blueprintSectionReferenceSchema),
  globalRegions: z.array(globalRegionReferenceSchema),
  bindings: z.array(commerceBindingSchema),
  compositionPatches: z.array(blueprintCompositionPatchSchema),
  requiredCapabilities: z.array(packageIdSchema),
}).strict().superRefine((value, context) => {
  const paths = new Set<string>();
  const bindingIds = new Set<string>();
  value.bindings.forEach((binding, index) => {
    if (bindingIds.has(binding.id)) context.addIssue({ code: z.ZodIssueCode.custom, path: ["bindings", index, "id"], message: `Duplicate binding ${binding.id}.` });
    bindingIds.add(binding.id);
  });
  const resourcePrefix = STOREFRONT_RESOURCE_SEMANTIC_PREFIXES[value.resourceType];
  value.sections.forEach((section, index) => {
    if (!section.path.startsWith(`${resourcePrefix}.`)) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ["sections", index, "path"], message: `Section path must start with ${resourcePrefix}.` });
    }
    if (paths.has(section.path)) context.addIssue({ code: z.ZodIssueCode.custom, path: ["sections", index, "path"], message: `Duplicate semantic path ${section.path}.` });
    paths.add(section.path);
    section.bindingIds.forEach((id) => {
      if (!bindingIds.has(id)) context.addIssue({ code: z.ZodIssueCode.custom, path: ["sections", index, "bindingIds"], message: `Unknown binding ${id}.` });
    });
    const slots = new Set<string>();
    section.slots.forEach((slot, slotIndex) => {
      if (slots.has(slot.slotId)) context.addIssue({ code: z.ZodIssueCode.custom, path: ["sections", index, "slots", slotIndex], message: `Duplicate slot ${slot.slotId}.` });
      slots.add(slot.slotId);
    });
  });
  const globalSlots = new Set<string>();
  value.globalRegions.forEach((region, index) => {
    if (globalSlots.has(region.slot)) context.addIssue({ code: z.ZodIssueCode.custom, path: ["globalRegions", index, "slot"], message: `Duplicate global region ${region.slot}.` });
    globalSlots.add(region.slot);
    if (paths.has(region.path)) context.addIssue({ code: z.ZodIssueCode.custom, path: ["globalRegions", index, "path"], message: `Duplicate semantic path ${region.path}.` });
    paths.add(region.path);
    region.bindingIds.forEach((id) => {
      if (!bindingIds.has(id)) context.addIssue({ code: z.ZodIssueCode.custom, path: ["globalRegions", index, "bindingIds"], message: `Unknown binding ${id}.` });
    });
  });
});

export type BlueprintSectionReference = z.infer<typeof blueprintSectionReferenceSchema>;
export type GlobalRegionReference = z.infer<typeof globalRegionReferenceSchema>;
export type TemplateBlueprint = z.infer<typeof templateBlueprintSchema>;
