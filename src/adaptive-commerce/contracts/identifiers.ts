import { z } from "zod";

const PACKAGE_ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const SEMVER_PATTERN = /^(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)(?:-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/;
const SEMANTIC_SEGMENT = "[a-z][a-z0-9]*(?:-[a-z0-9]+)*";
const SEMANTIC_PATH_PATTERN = new RegExp(`^${SEMANTIC_SEGMENT}(?:\\.${SEMANTIC_SEGMENT})+$`);
const TOKEN_PATH_PATTERN = new RegExp(`^${SEMANTIC_SEGMENT}(?:\\.${SEMANTIC_SEGMENT})+$`);
const SHA256_PATTERN = /^sha256:[a-f0-9]{64}$/;

export const packageIdSchema = z.string().regex(PACKAGE_ID_PATTERN);
export const exactVersionSchema = z.string().regex(SEMVER_PATTERN);
export const integrityHashSchema = z.string().regex(SHA256_PATTERN);
export const semanticPathSchema = z.string().regex(SEMANTIC_PATH_PATTERN).brand<"SemanticPath">();
export const tokenPathSchema = z.string().regex(TOKEN_PATH_PATTERN).brand<"DesignTokenPath">();

export type SemanticPath = z.infer<typeof semanticPathSchema>;
export type DesignTokenPath = z.infer<typeof tokenPathSchema>;

export const semanticPath = (value: string): SemanticPath =>
  semanticPathSchema.parse(value);

export const STOREFRONT_RESOURCE_TYPES = [
  "home",
  "product",
  "collection",
  "page",
  "blog",
  "cart",
  "search",
  "404",
] as const;

export const storefrontResourceTypeSchema = z.enum(STOREFRONT_RESOURCE_TYPES);
export type StorefrontResourceType = z.infer<typeof storefrontResourceTypeSchema>;

export const STOREFRONT_RESOURCE_SEMANTIC_PREFIXES = {
  home: "home",
  product: "product",
  collection: "collection",
  page: "page",
  blog: "blog",
  cart: "cart",
  search: "search",
  "404": "not-found",
} as const satisfies Record<StorefrontResourceType, string>;

export const versionedPackageRefSchema = z.object({
  id: packageIdSchema,
  version: exactVersionSchema,
  integrity: integrityHashSchema,
}).strict();

export type VersionedPackageRef = z.infer<typeof versionedPackageRefSchema>;

export const semanticPathStartsWith = (
  path: SemanticPath | string,
  ancestor: SemanticPath | string,
): boolean => path === ancestor || path.startsWith(`${ancestor}.`);

export const semanticPathsOverlap = (
  left: SemanticPath | string,
  right: SemanticPath | string,
): boolean => semanticPathStartsWith(left, right) || semanticPathStartsWith(right, left);
