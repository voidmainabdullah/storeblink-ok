import { z } from "zod";
import {
  exactVersionSchema,
  integrityHashSchema,
  packageIdSchema,
  STOREFRONT_RESOURCE_TYPES,
  versionedPackageRefSchema,
} from "./identifiers";

export const storeKitBlueprintAssignmentsSchema = z.object({
  home: versionedPackageRefSchema,
  product: versionedPackageRefSchema,
  collection: versionedPackageRefSchema,
  page: versionedPackageRefSchema,
  blog: versionedPackageRefSchema,
  cart: versionedPackageRefSchema,
  search: versionedPackageRefSchema,
  "404": versionedPackageRefSchema,
}).strict();

export const storeKitLockfileSchema = z.object({
  designPack: versionedPackageRefSchema,
  componentLibrary: versionedPackageRefSchema,
  blueprints: storeKitBlueprintAssignmentsSchema,
  engineSchemaVersion: z.number().int().positive(),
  tokenSchemaVersion: z.literal("2025.10"),
  migrationIds: z.array(packageIdSchema),
  capabilityPolicyVersion: exactVersionSchema,
}).strict();

export const storeKitSchema = z.object({
  kind: z.literal("store-kit"),
  id: packageIdSchema,
  version: exactVersionSchema,
  integrity: integrityHashSchema,
  schemaVersion: z.number().int().positive(),
  name: z.string().min(1),
  description: z.string().min(1),
  releaseState: z.enum(["draft", "released", "retired"]),
  defaultPresetId: packageIdSchema.nullable(),
  requiredCapabilities: z.array(packageIdSchema),
  optionalCapabilities: z.array(packageIdSchema),
  lockfile: storeKitLockfileSchema,
}).strict().superRefine((value, context) => {
  const assertUnique = (items: readonly string[], path: string) => {
    const seen = new Set<string>();
    items.forEach((item, index) => {
      if (seen.has(item)) context.addIssue({
        code: z.ZodIssueCode.custom,
        path: [path, index],
        message: `Duplicate ${path} entry ${item}.`,
      });
      seen.add(item);
    });
  };
  assertUnique(value.requiredCapabilities, "requiredCapabilities");
  assertUnique(value.optionalCapabilities, "optionalCapabilities");
  assertUnique(value.lockfile.migrationIds, "lockfile.migrationIds");
  const overlap = value.requiredCapabilities.filter((capability) =>
    value.optionalCapabilities.includes(capability));
  if (overlap.length) context.addIssue({ code: z.ZodIssueCode.custom, message: `Capabilities cannot be both required and optional: ${overlap.join(", ")}.` });
  const keys = Object.keys(value.lockfile.blueprints).sort();
  const expected = [...STOREFRONT_RESOURCE_TYPES].sort();
  if (JSON.stringify(keys) !== JSON.stringify(expected)) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["lockfile", "blueprints"], message: "StoreKit must pin every required storefront resource." });
  }
});

export type StoreKitBlueprintAssignments = z.infer<typeof storeKitBlueprintAssignmentsSchema>;
export type StoreKitLockfile = z.infer<typeof storeKitLockfileSchema>;
export type StoreKit = z.infer<typeof storeKitSchema>;
