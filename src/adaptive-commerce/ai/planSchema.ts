import { z } from "zod";
import {
  packageIdSchema,
  semanticPathSchema,
  versionedPackageRefSchema,
} from "@/adaptive-commerce/contracts";
import type { SemanticPath, VersionedPackageRef } from "@/adaptive-commerce/contracts";

export const ADAPTIVE_PLAN_CONTENT_SOURCES = [
  "store.name",
  "store.tagline",
  "store.about",
  "store.logo",
  "catalog.featured-products",
  "catalog.featured-collections",
  "catalog.recommendations",
] as const;

export const adaptiveCommercePlanSchema = z.object({
  kind: z.literal("adaptive-commerce-plan"),
  schemaVersion: z.literal(1),
  storeKit: versionedPackageRefSchema,
  presetId: packageIdSchema.nullable(),
  variantSelections: z.array(z.object({
    path: semanticPathSchema,
    componentId: packageIdSchema,
    variantId: packageIdSchema,
  }).strict()),
  contentMappings: z.array(z.object({
    target: semanticPathSchema,
    source: z.enum(ADAPTIVE_PLAN_CONTENT_SOURCES),
  }).strict()),
}).strict().superRefine((plan, context) => {
  const variantPaths = new Set<string>();
  plan.variantSelections.forEach((selection, index) => {
    if (variantPaths.has(selection.path)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["variantSelections", index, "path"],
        message: `Duplicate variant target ${selection.path}.`,
      });
    }
    variantPaths.add(selection.path);
  });
  const mappingTargets = new Set<string>();
  plan.contentMappings.forEach((mapping, index) => {
    if (mappingTargets.has(mapping.target)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["contentMappings", index, "target"],
        message: `Duplicate content target ${mapping.target}.`,
      });
    }
    mappingTargets.add(mapping.target);
  });
});

export type AdaptiveCommercePlan = Readonly<{
  kind: "adaptive-commerce-plan";
  schemaVersion: 1;
  storeKit: Required<VersionedPackageRef>;
  presetId: string | null;
  variantSelections: readonly Readonly<{
    path: SemanticPath;
    componentId: string;
    variantId: string;
  }>[];
  contentMappings: readonly Readonly<{
    target: SemanticPath;
    source: (typeof ADAPTIVE_PLAN_CONTENT_SOURCES)[number];
  }>[];
}>;
