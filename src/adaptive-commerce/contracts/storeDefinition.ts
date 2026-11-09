import { z } from "zod";
import { commerceBindingSchema } from "./commerceBinding";
import { merchantDesignTokenOverridesSchema } from "./designPack";
import {
  integrityHashSchema,
  packageIdSchema,
  semanticPathSchema,
  versionedPackageRefSchema,
} from "./identifiers";
import { jsonValueSchema } from "./json";

export const semanticCollectionSchema = z.object({
  order: z.array(z.string().min(1)),
  items: z.record(z.string().min(1), jsonValueSchema),
}).strict().superRefine((value, context) => {
  const unique = new Set(value.order);
  if (unique.size !== value.order.length) context.addIssue({ code: z.ZodIssueCode.custom, path: ["order"], message: "Semantic collection order contains duplicate keys." });
  value.order.forEach((key, index) => {
    if (!Object.prototype.hasOwnProperty.call(value.items, key)) context.addIssue({ code: z.ZodIssueCode.custom, path: ["order", index], message: `Collection item ${key} is missing.` });
  });
  Object.keys(value.items).forEach((key) => {
    if (!unique.has(key)) context.addIssue({ code: z.ZodIssueCode.custom, path: ["items", key], message: `Collection item ${key} is not present in order.` });
  });
});

export const semanticStorefrontDocumentSchema = z.object({
  schemaVersion: z.number().int().positive(),
  revisionId: packageIdSchema,
  baseHash: integrityHashSchema,
  values: z.record(semanticPathSchema, jsonValueSchema),
  collections: z.record(semanticPathSchema, semanticCollectionSchema),
}).strict().superRefine((value, context) => {
  const valuePaths = new Set(Object.keys(value.values));
  Object.keys(value.collections).forEach((path) => {
    if (valuePaths.has(path)) context.addIssue({ code: z.ZodIssueCode.custom, path: ["collections", path], message: `${path} cannot be both a scalar value and a collection.` });
  });
});

export const storeDefinitionSchema = z.object({
  kind: z.literal("store-definition"),
  schemaVersion: z.number().int().positive(),
  storeId: z.string().min(1),
  installationId: z.string().min(1),
  storeKit: versionedPackageRefSchema,
  locale: z.string().min(2),
  currency: z.string().regex(/^[A-Z]{3}$/),
  base: semanticStorefrontDocumentSchema,
  merchantPatchIds: z.array(z.string().min(1)),
  designTokens: merchantDesignTokenOverridesSchema,
  commerceBindings: z.array(commerceBindingSchema),
}).strict().superRefine((value, context) => {
  const ids = new Set<string>();
  value.commerceBindings.forEach((binding, index) => {
    if (ids.has(binding.id)) context.addIssue({ code: z.ZodIssueCode.custom, path: ["commerceBindings", index, "id"], message: `Duplicate commerce binding ${binding.id}.` });
    ids.add(binding.id);
  });
});

export type SemanticCollection = z.infer<typeof semanticCollectionSchema>;
export type SemanticStorefrontDocument = z.infer<typeof semanticStorefrontDocumentSchema>;
export type StoreDefinition = z.infer<typeof storeDefinitionSchema>;
