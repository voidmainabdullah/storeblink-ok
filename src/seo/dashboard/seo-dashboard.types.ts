import { z } from "zod";

export const seoResourceTypeSchema = z.enum([
  "system_page",
  "custom_page",
  "product",
  "collection",
  "blog",
]);

export const safeMetaTagSchema = z.object({
  attribute: z.enum(["name", "property"]),
  key: z.string(),
  content: z.string(),
});

export const seoAlternateSchema = z.object({
  locale: z.string(),
  url: z.string().url().refine((value) => {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password && !url.hash;
  }, "Alternate URL must use HTTPS and cannot contain credentials or a fragment."),
});

export const seoResourceDashboardSchema = z.object({
  resourceType: seoResourceTypeSchema,
  resourceId: z.string(),
  route: z.string(),
  title: z.string(),
  status: z.enum(["draft", "published", "archived"]),
  publicContentUpdatedAt: z.string(),
  seoTitle: z.string().nullable(),
  metaDescription: z.string().nullable(),
  indexing: z.enum(["index_follow", "noindex_follow", "noindex_nofollow"]),
  canonicalMode: z.enum(["automatic", "custom"]),
  customCanonicalUrl: z.string().nullable(),
  socialTitle: z.string().nullable(),
  socialDescription: z.string().nullable(),
  socialImageId: z.string().nullable(),
  customMetaTags: z.array(safeMetaTagSchema).default([]),
  alternates: z.array(seoAlternateSchema).default([]),
  excludedReason: z.string().nullable(),
});

const sitemapStateSchema = z.object({
  activeGenerationId: z.string().uuid().nullable().optional(),
  dirty: z.boolean().default(true),
  dirtyVersion: z.number().int().nonnegative().optional(),
  dirtySegments: z.array(z.string()).default([]),
  dirtySince: z.string().nullable().optional(),
  lastEventAt: z.string().nullable().optional(),
  lastCompiledAt: z.string().nullable().optional(),
  lastFailureAt: z.string().nullable().optional(),
  lastFailureCode: z.string().nullable().optional(),
  lastFailureMessage: z.string().nullable().optional(),
  compileLockedAt: z.string().nullable().optional(),
});

export const sitemapGenerationSchema = z.object({
  id: z.string().uuid(),
  generation: z.number().int().positive(),
  status: z.enum(["building", "validating", "ready", "active", "failed", "rolled_back"]),
  hostname: z.string(),
  urlCount: z.number().int().nonnegative(),
  segmentCount: z.number().int().nonnegative(),
  startedAt: z.string(),
  completedAt: z.string().nullable(),
  validationErrors: z.array(z.unknown()).default([]),
});

const sitemapSegmentSchema = z.object({
  generationId: z.string().uuid(),
  type: z.enum(["pages", "products", "collections", "blogs"]),
  number: z.number().int().positive(),
  urlCount: z.number().int().nonnegative(),
  lastModified: z.string(),
});

export const seoRedirectSchema = z.object({
  id: z.string().uuid(),
  sourcePath: z.string(),
  destinationPath: z.string(),
  statusCode: z.union([z.literal(301), z.literal(302), z.literal(307), z.literal(308)]),
});

const seoHealthIssueSchema = z.object({
  code: z.string(),
  severity: z.enum(["warning", "error"]),
  resourceType: z.string(),
  resourceId: z.string(),
  route: z.string(),
  message: z.string(),
});

const indexNowDashboardSchema = z.object({
  enabled: z.boolean().optional(),
  keyLocationPath: z.string().optional(),
  lastSubmittedAt: z.string().nullable().optional(),
  lastFailureCode: z.string().nullable().optional(),
  lastFailureMessage: z.string().nullable().optional(),
});

export const seoDashboardSchema = z.object({
  resources: z.array(seoResourceDashboardSchema),
  state: sitemapStateSchema,
  generations: z.array(sitemapGenerationSchema),
  segments: z.array(sitemapSegmentSchema),
  redirects: z.array(seoRedirectSchema),
  indexNow: indexNowDashboardSchema,
  healthIssues: z.array(seoHealthIssueSchema),
});

export const seoMetadataInputSchema = z.object({
  seoTitle: z.string().max(120),
  metaDescription: z.string().max(320),
  indexing: z.enum(["index_follow", "noindex_follow", "noindex_nofollow"]),
  canonicalMode: z.enum(["automatic", "custom"]),
  customCanonicalUrl: z.string().max(2048),
  socialTitle: z.string().max(120),
  socialDescription: z.string().max(320),
  socialImageId: z.string().max(300),
  customMetaTags: z.array(safeMetaTagSchema).max(20),
  alternates: z.array(seoAlternateSchema).max(50),
}).superRefine((input, context) => {
  if (input.canonicalMode === "custom") {
    try {
      const url = new URL(input.customCanonicalUrl);
      if (url.protocol !== "https:" || url.hash || url.username || url.password) throw new Error();
    } catch {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["customCanonicalUrl"],
        message: "Custom canonical URL must use HTTPS and cannot contain credentials or a fragment.",
      });
    }
  }
  if (input.socialImageId) {
    try {
      const url = new URL(input.socialImageId);
      if (url.protocol !== "https:" || url.hash || url.username || url.password) throw new Error();
    } catch {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["socialImageId"],
        message: "Social image URL must use HTTPS and cannot contain credentials or a fragment.",
      });
    }
  }
});

export type SeoDashboard = z.infer<typeof seoDashboardSchema>;
export type SeoDashboardResource = z.infer<typeof seoResourceDashboardSchema>;
export type SeoMetadataInput = z.infer<typeof seoMetadataInputSchema>;
export type SeoRedirect = z.infer<typeof seoRedirectSchema>;
export type SitemapGeneration = z.infer<typeof sitemapGenerationSchema>;
