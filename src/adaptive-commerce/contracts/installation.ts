import { z } from "zod";
import { commerceBindingSchema } from "./commerceBinding";
import { merchantPatchSchema } from "./merchantPatch";
import { semanticStorefrontDocumentSchema } from "./storeDefinition";
import { storeKitLockfileSchema, storeKitSchema } from "./storeKit";
import { exactVersionSchema, packageIdSchema } from "./identifiers";

export const storeKitInstallationSchema = z.object({
  kind: z.literal("store-kit-installation"),
  id: z.string().min(1),
  storeId: z.string().min(1),
  storeKitId: packageIdSchema,
  storeKitVersion: exactVersionSchema,
  resolvedLockfile: storeKitLockfileSchema,
  presetId: packageIdSchema.nullable(),
  baseRevisionId: packageIdSchema,
  runtimeArtifactId: z.string().min(1),
  runtimeArtifactHash: z.string().regex(/^sha256:[a-f0-9]{64}$/),
  status: z.enum(["staged", "active", "archived"]),
  revision: z.number().int().nonnegative(),
  installedAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
}).strict();

export const storeKitInstallationRequestSchema = z.object({
  storeId: z.string().min(1),
  storeKitId: packageIdSchema,
  storeKitVersion: exactVersionSchema,
  presetId: packageIdSchema.nullable(),
  expectedInstallationRevision: z.number().int().nonnegative(),
  idempotencyKey: z.string().min(8).max(200),
  baseDocument: semanticStorefrontDocumentSchema,
  merchantPatches: z.array(merchantPatchSchema),
  commerceBindings: z.array(commerceBindingSchema),
  runtimeArtifactId: z.string().min(1),
  runtimeArtifactHash: z.string().regex(/^sha256:[a-f0-9]{64}$/),
  requestedAt: z.string().datetime(),
}).strict();

export const storeKitInstallationCommitSchema = z.object({
  kind: z.literal("store-kit-installation-commit"),
  storeId: z.string().min(1),
  storeKit: storeKitSchema,
  effectivePresetId: packageIdSchema.nullable(),
  expectedInstallationRevision: z.number().int().nonnegative(),
  idempotencyKey: z.string().min(8).max(200),
  baseDocument: semanticStorefrontDocumentSchema,
  effectiveDocument: semanticStorefrontDocumentSchema,
  merchantPatches: z.array(merchantPatchSchema),
  appliedPatchIds: z.array(z.string().min(1)),
  commerceBindings: z.array(commerceBindingSchema),
  runtimeArtifact: z.object({
    id: z.string().min(1),
    hash: z.string().regex(/^sha256:[a-f0-9]{64}$/),
  }).strict(),
  requestedAt: z.string().datetime(),
}).strict();

export const storeKitInstallationCommitResultSchema = z.object({
  kind: z.literal("store-kit-installation-commit-result"),
  outcome: z.enum(["committed", "replayed"]),
  idempotencyKey: z.string().min(8).max(200),
  installation: storeKitInstallationSchema,
}).strict();

export type StoreKitInstallation = z.infer<typeof storeKitInstallationSchema>;
export type StoreKitInstallationRequest = z.infer<typeof storeKitInstallationRequestSchema>;
export type StoreKitInstallationCommit = z.infer<typeof storeKitInstallationCommitSchema>;
export type StoreKitInstallationCommitResult = z.infer<typeof storeKitInstallationCommitResultSchema>;
