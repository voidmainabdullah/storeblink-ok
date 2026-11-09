import { z } from "zod";
import { commerceBindingSchema } from "./commerceBinding";
import {
  exactVersionSchema,
  integrityHashSchema,
  packageIdSchema,
  storefrontResourceTypeSchema,
  versionedPackageRefSchema,
} from "./identifiers";
import { jsonValueSchema } from "./json";

export const runtimeRouteArtifactSchema = z.object({
  resourceType: storefrontResourceTypeSchema,
  blueprint: versionedPackageRefSchema,
  document: jsonValueSchema,
}).strict();

export const runtimeRoutesSchema = z.object({
  home: runtimeRouteArtifactSchema,
  product: runtimeRouteArtifactSchema,
  collection: runtimeRouteArtifactSchema,
  page: runtimeRouteArtifactSchema,
  blog: runtimeRouteArtifactSchema,
  cart: runtimeRouteArtifactSchema,
  search: runtimeRouteArtifactSchema,
  "404": runtimeRouteArtifactSchema,
}).strict().superRefine((value, context) => {
  Object.entries(value).forEach(([key, route]) => {
    if (route.resourceType !== key) context.addIssue({ code: z.ZodIssueCode.custom, path: [key, "resourceType"], message: `Route ${key} contains ${route.resourceType}.` });
  });
});

export const runtimeArtifactDiagnosticSchema = z.object({
  code: packageIdSchema,
  severity: z.enum(["info", "warning", "error"]),
  message: z.string().min(1),
  path: z.string().min(1).nullable(),
}).strict();

export const runtimeArtifactSchema = z.object({
  kind: z.literal("runtime-artifact"),
  artifactVersion: z.literal(1),
  id: z.string().min(1),
  storeId: z.string().min(1),
  installationId: z.string().min(1),
  storeKit: versionedPackageRefSchema,
  schemaVersion: z.number().int().positive(),
  compilerVersion: exactVersionSchema,
  sourceHash: integrityHashSchema,
  artifactHash: integrityHashSchema,
  createdAt: z.string().datetime(),
  routes: runtimeRoutesSchema,
  globals: z.record(jsonValueSchema),
  resolvedTokens: z.record(jsonValueSchema),
  componentVersions: z.record(packageIdSchema, exactVersionSchema),
  bindingPlans: z.array(commerceBindingSchema),
  assets: z.array(z.object({
    id: z.string().min(1),
    type: z.enum(["image", "svg", "video", "font", "other"]),
    url: z.string().min(1),
    integrity: integrityHashSchema.nullable(),
  }).strict()),
  diagnostics: z.array(runtimeArtifactDiagnosticSchema),
  extensions: z.record(jsonValueSchema),
}).strict();

export type RuntimeRouteArtifact = z.infer<typeof runtimeRouteArtifactSchema>;
export type RuntimeArtifactDiagnostic = z.infer<typeof runtimeArtifactDiagnosticSchema>;
export type RuntimeArtifact = z.infer<typeof runtimeArtifactSchema>;

