import { z } from "zod";
import { packageIdSchema, semanticPathSchema } from "./identifiers";
import { jsonValueSchema } from "./json";

export const semanticPathRenameSchema = z.object({
  from: semanticPathSchema,
  to: semanticPathSchema,
}).strict().refine((value) => value.from !== value.to, "A semantic path rename must change the path.");

export const merchantPatchOperationSchema = z.discriminatedUnion("op", [
  z.object({ op: z.literal("set"), target: semanticPathSchema, value: jsonValueSchema }).strict(),
  z.object({ op: z.literal("unset"), target: semanticPathSchema }).strict(),
  z.object({ op: z.literal("insert"), target: semanticPathSchema, key: z.string().min(1), value: jsonValueSchema, beforeKey: z.string().min(1).nullable() }).strict(),
  z.object({ op: z.literal("remove"), target: semanticPathSchema, key: z.string().min(1) }).strict(),
  z.object({ op: z.literal("reorder"), target: semanticPathSchema, key: z.string().min(1), beforeKey: z.string().min(1).nullable() }).strict(),
]);

export const merchantPatchSchema = z.object({
  id: z.string().min(1),
  storeId: z.string().min(1),
  baseRevisionId: packageIdSchema,
  sequence: z.number().int().nonnegative(),
  status: z.enum(["active", "conflicted", "superseded"]),
  operations: z.array(merchantPatchOperationSchema).min(1),
  createdAt: z.string().datetime(),
  createdBy: z.string().min(1),
}).strict();

export const patchConflictSchema = z.object({
  id: z.string().min(1),
  patchId: z.string().min(1),
  operationIndex: z.number().int().nonnegative(),
  target: semanticPathSchema,
  key: z.string().min(1).nullable(),
  reason: z.enum([
    "path-changed",
    "path-removed",
    "path-renamed-ambiguously",
    "collection-item-changed",
    "collection-order-changed",
    "operation-invalid-on-new-base",
  ]),
  baseBefore: jsonValueSchema.optional(),
  baseAfter: jsonValueSchema.optional(),
  status: z.enum(["unresolved", "keep-merchant", "accept-base", "remapped"]),
}).strict();

export type SemanticPathRename = z.infer<typeof semanticPathRenameSchema>;
export type MerchantPatchOperation = z.infer<typeof merchantPatchOperationSchema>;
export type MerchantPatch = z.infer<typeof merchantPatchSchema>;
export type PatchConflict = z.infer<typeof patchConflictSchema>;

