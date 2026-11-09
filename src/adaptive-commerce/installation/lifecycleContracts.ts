import { z } from "zod";
import {
  commerceBindingSchema,
  designTokenOverrideSchema,
  exactVersionSchema,
  integrityHashSchema,
  merchantDesignTokenOverridesSchema,
  merchantPatchSchema,
  packageIdSchema,
  runtimeArtifactSchema,
  semanticStorefrontDocumentSchema,
  storeKitLockfileSchema,
  storeKitSchema,
} from "@/adaptive-commerce/contracts";

/**
 * Browser-authorized input for staging a StoreKit. Compiled artifact identity is
 * deliberately absent: only the trusted compiler may introduce an artifact.
 */
export const storeKitInstallationStageRequestSchema = z.object({
  storeId: z.string().min(1),
  storeKitId: packageIdSchema,
  storeKitVersion: exactVersionSchema,
  presetId: packageIdSchema.nullable(),
  tokenOverrides: z.array(designTokenOverrideSchema),
  expectedInstallationRevision: z.number().int().nonnegative(),
  idempotencyKey: z.string().min(8).max(200),
  baseDocument: semanticStorefrontDocumentSchema,
  merchantPatches: z.array(merchantPatchSchema),
  commerceBindings: z.array(commerceBindingSchema),
  requestedAt: z.string().datetime(),
}).strict();

export const storeKitInstallationStageCommitSchema = z.object({
  kind: z.literal("store-kit-installation-stage"),
  storeId: z.string().min(1),
  storeKit: storeKitSchema,
  designTokens: merchantDesignTokenOverridesSchema,
  expectedInstallationRevision: z.number().int().nonnegative(),
  idempotencyKey: z.string().min(8).max(200),
  baseDocument: semanticStorefrontDocumentSchema,
  merchantPatches: z.array(merchantPatchSchema),
  commerceBindings: z.array(commerceBindingSchema),
  requestedAt: z.string().datetime(),
}).strict();

export const stagedStoreKitInstallationSchema = z.object({
  kind: z.literal("staged-store-kit-installation"),
  id: z.string().min(1),
  storeId: z.string().min(1),
  storeKitId: packageIdSchema,
  storeKitVersion: exactVersionSchema,
  resolvedLockfile: storeKitLockfileSchema,
  presetId: packageIdSchema.nullable(),
  baseRevisionId: z.string().min(1),
  baseDocumentRevisionId: packageIdSchema,
  sourceRevision: z.number().int().positive(),
  sourceHash: integrityHashSchema,
  status: z.literal("staged"),
  revision: z.number().int().positive(),
  installedAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
}).strict();

export const storeKitInstallationStageResultSchema = z.object({
  kind: z.literal("store-kit-installation-stage-result"),
  outcome: z.enum(["staged", "replayed"]),
  idempotencyKey: z.string().min(8).max(200),
  installation: stagedStoreKitInstallationSchema,
}).strict();

/** Trusted-server input. The stage source hash and the compiler source hash are
 * intentionally distinct and both are bound by the accepted shadow record. */
export const storeKitInstallationActivationSchema = z.object({
  storeId: z.string().min(1),
  installationId: z.string().min(1),
  acceptedShadowId: z.string().min(1),
  expectedInstallationRevision: z.number().int().positive(),
  expectedSourceRevision: z.number().int().positive(),
  expectedStageSourceHash: integrityHashSchema,
  expectedPointerRevision: z.number().int().nonnegative(),
  artifact: runtimeArtifactSchema,
}).strict();

export const storeKitInstallationActivationResultSchema = z.object({
  kind: z.literal("store-kit-installation-activation-result"),
  installationId: z.string().min(1),
  previousInstallationId: z.string().min(1).nullable(),
  installationRevision: z.number().int().positive(),
  sourceRevision: z.number().int().positive(),
  sourceHash: integrityHashSchema,
  artifactId: z.string().min(1),
  artifactHash: integrityHashSchema,
  publicationId: z.string().min(1),
  publicationRevision: z.number().int().positive(),
  pointerRevision: z.number().int().positive(),
  status: z.literal("active"),
}).strict();

export type StoreKitInstallationStageRequest = z.infer<
  typeof storeKitInstallationStageRequestSchema
>;
export type StoreKitInstallationStageCommit = z.infer<
  typeof storeKitInstallationStageCommitSchema
>;
export type StagedStoreKitInstallation = z.infer<
  typeof stagedStoreKitInstallationSchema
>;
export type StoreKitInstallationStageResult = z.infer<
  typeof storeKitInstallationStageResultSchema
>;
export type StoreKitInstallationActivation = z.infer<
  typeof storeKitInstallationActivationSchema
>;
export type StoreKitInstallationActivationResult = z.infer<
  typeof storeKitInstallationActivationResultSchema
>;
