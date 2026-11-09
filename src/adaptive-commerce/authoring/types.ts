import { z } from "zod";
import {
  adaptiveComponentLibrarySchema,
  commerceBindingSchema,
  designPackSchema,
  integrityHashSchema,
  merchantDesignTokenOverridesSchema,
  merchantPatchOperationSchema,
  merchantPatchSchema,
  storeDefinitionSchema,
  templateBlueprintSchema,
} from "@/adaptive-commerce/contracts";

export const adaptiveAuthoringCatalogSchema = z.object({
  designPack: designPackSchema,
  componentLibrary: adaptiveComponentLibrarySchema,
  blueprints: z.array(templateBlueprintSchema).length(8),
}).strict().superRefine((catalog, context) => {
  const routes = new Set(catalog.blueprints.map((blueprint) => blueprint.resourceType));
  if (routes.size !== 8) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["blueprints"],
      message: "Authoring catalog must expose one certified blueprint for every storefront route.",
    });
  }
  catalog.blueprints.forEach((blueprint, blueprintIndex) => {
    blueprint.sections.forEach((section, sectionIndex) => {
      const component = catalog.componentLibrary.components[section.componentId];
      if (!component) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["blueprints", blueprintIndex, "sections", sectionIndex, "componentId"],
          message: `Section ${section.path} references an undeclared certified component.`,
        });
      } else if (!component.variants.some((variant) => variant.id === section.variantId)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["blueprints", blueprintIndex, "sections", sectionIndex, "variantId"],
          message: `Section ${section.path} references an undeclared certified variant.`,
        });
      }
    });
  });
});

export const adaptiveAuthoringSourceSchema = z.object({
  kind: z.literal("adaptive-storefront-authoring-source"),
  storeId: z.string().min(1),
  installationId: z.string().min(1),
  installationStatus: z.enum(["staged", "active"]),
  installationRevision: z.number().int().positive(),
  sourceRevision: z.number().int().positive(),
  sourceHash: integrityHashSchema,
  baseRevisionRowId: z.string().min(1),
  storeDefinition: storeDefinitionSchema,
  merchantPatches: z.array(merchantPatchSchema),
  catalog: adaptiveAuthoringCatalogSchema,
  publishedSourceRevision: z.number().int().positive().nullable(),
  reviewState: z.enum(["current", "review-needed"]),
}).strict().superRefine((source, context) => {
  if (source.storeDefinition.storeId !== source.storeId) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["storeDefinition", "storeId"],
      message: "Authoring source store identity does not match its StoreDefinition.",
    });
  }
  if (source.storeDefinition.installationId !== source.installationId) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["storeDefinition", "installationId"],
      message: "Authoring source installation identity does not match its StoreDefinition.",
    });
  }
  const declared = source.storeDefinition.merchantPatchIds;
  const supplied = source.merchantPatches.map((patch) => patch.id);
  if (declared.length !== supplied.length || declared.some((id, index) => id !== supplied[index])) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["merchantPatches"],
      message: "Merchant patches must exactly match the ordered StoreDefinition patch ids.",
    });
  }
});

export const adaptiveAuthoringSaveRequestSchema = z.object({
  storeId: z.string().min(1),
  installationId: z.string().min(1),
  expectedSourceRevision: z.number().int().positive(),
  idempotencyKey: z.string().min(8).max(160),
  operations: z.array(merchantPatchOperationSchema).max(100),
  designTokens: merchantDesignTokenOverridesSchema,
  commerceBindings: z.array(commerceBindingSchema),
}).strict().superRefine((request, context) => {
  if (!request.operations.length && !request.designTokens.overrides.length) {
    // A preset or binding change can still be meaningful; the server performs
    // the authoritative no-op comparison under the source revision lock.
    return;
  }
  const targets = new Set<string>();
  request.operations.forEach((operation, index) => {
    if (targets.has(operation.target) && operation.op === "set") {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["operations", index, "target"],
        message: `A save batch may set ${operation.target} only once.`,
      });
    }
    if (operation.op === "set") targets.add(operation.target);
  });
});

export const adaptiveAuthoringSaveResultSchema = z.object({
  kind: z.literal("adaptive-storefront-authoring-save-result"),
  outcome: z.enum(["saved", "replayed"]),
  storeId: z.string().min(1),
  installationId: z.string().min(1),
  sourceRevision: z.number().int().positive(),
  sourceHash: integrityHashSchema,
  patchId: z.string().min(1).nullable(),
  reviewState: z.literal("review-needed"),
  compileJobEnqueued: z.literal(false),
}).strict();

export type AdaptiveAuthoringCatalog = z.infer<typeof adaptiveAuthoringCatalogSchema>;
export type AdaptiveAuthoringSource = z.infer<typeof adaptiveAuthoringSourceSchema>;
export type AdaptiveAuthoringSaveRequest = z.infer<typeof adaptiveAuthoringSaveRequestSchema>;
export type AdaptiveAuthoringSaveResult = z.infer<typeof adaptiveAuthoringSaveResultSchema>;
