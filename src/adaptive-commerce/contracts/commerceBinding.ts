import { z } from "zod";
import { packageIdSchema, semanticPathSchema } from "./identifiers";
import { jsonValueSchema } from "./json";

export const COMMERCE_BINDING_SOURCES = [
  "store",
  "product",
  "collection",
  "page",
  "cart",
  "search",
] as const;

export const commerceBindingSourceSchema = z.enum(COMMERCE_BINDING_SOURCES);

export const COMMERCE_BINDING_TARGET_PROPERTIES = [
  "text",
  "label",
  "src",
  "alt",
  "href",
  "items",
  "price",
  "compareAtPrice",
  "inventory",
  "variant",
  "media",
  "visibility",
] as const;

export const commerceBindingTargetPropertySchema = z.enum(
  COMMERCE_BINDING_TARGET_PROPERTIES,
);

export const commerceBindingSchema = z.object({
  id: packageIdSchema,
  source: z.object({
    kind: commerceBindingSourceSchema,
    selector: z.string().min(1).optional(),
  }).strict(),
  field: z.string().regex(/^[A-Za-z][A-Za-z0-9_]*(?:\.[A-Za-z][A-Za-z0-9_]*)*$/),
  target: z.object({
    path: semanticPathSchema,
    property: commerceBindingTargetPropertySchema,
  }).strict(),
  fallback: jsonValueSchema.optional(),
  required: z.boolean().default(false),
}).strict();

export type CommerceBinding = z.infer<typeof commerceBindingSchema>;
export type CommerceBindingSource = z.infer<typeof commerceBindingSourceSchema>;
export type CommerceBindingTargetProperty = z.infer<typeof commerceBindingTargetPropertySchema>;

