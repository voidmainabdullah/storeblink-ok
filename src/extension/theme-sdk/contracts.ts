import { z } from "zod";
import {
  adaptiveComponentLibrarySchema,
  designPackSchema,
  merchantPatchSchema,
  semanticPathRenameSchema,
  semanticStorefrontDocumentSchema,
  storeKitSchema,
  templateBlueprintSchema,
} from "@/adaptive-commerce/contracts";
import { thirdPartyExtensionManifestSchema } from "@/extension/app-block";

export const THEME_SDK_PACKAGE_FORMAT_VERSION = 1 as const;

export const themeSdkBlueprintsSchema = z.object({
  home: templateBlueprintSchema,
  product: templateBlueprintSchema,
  collection: templateBlueprintSchema,
  page: templateBlueprintSchema,
  blog: templateBlueprintSchema,
  cart: templateBlueprintSchema,
  search: templateBlueprintSchema,
  "404": templateBlueprintSchema,
}).strict();

export const themeMigrationFixtureSchema = z.object({
  id: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  oldBase: semanticStorefrontDocumentSchema,
  newBase: semanticStorefrontDocumentSchema,
  merchantPatches: z.array(merchantPatchSchema),
  renames: z.array(semanticPathRenameSchema),
  expected: z.object({
    status: z.enum(["merged", "conflicted"]),
    publishable: z.boolean(),
    candidate: semanticStorefrontDocumentSchema,
    conflictCount: z.number().int().nonnegative(),
  }).strict(),
}).strict();

export const themeSdkPackageSchema = z.object({
  kind: z.literal("storeblink-theme-sdk-package"),
  formatVersion: z.literal(THEME_SDK_PACKAGE_FORMAT_VERSION),
  manifest: thirdPartyExtensionManifestSchema,
  designPack: designPackSchema,
  componentLibrary: adaptiveComponentLibrarySchema,
  blueprints: themeSdkBlueprintsSchema,
  storeKit: storeKitSchema,
  migrationFixtures: z.array(themeMigrationFixtureSchema).min(1),
}).strict();

export type ThemeMigrationFixture = z.infer<typeof themeMigrationFixtureSchema>;
export type ThemeSdkPackage = z.infer<typeof themeSdkPackageSchema>;
