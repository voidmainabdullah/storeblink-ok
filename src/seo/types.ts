export type SeoResourceType =
  | "system_page"
  | "custom_page"
  | "product"
  | "collection"
  | "blog";

export type SeoResourceStatus = "draft" | "published" | "archived";
export type SeoIndexing = "index_follow" | "noindex_follow" | "noindex_nofollow";
export type SeoCanonicalMode = "automatic" | "custom";
export type SitemapSegmentType = "pages" | "products" | "collections" | "blogs";

export type SeoAlternate = Readonly<{ locale: string; url: string }>;
export type SafeMetaTag = Readonly<{
  attribute: "name" | "property";
  key: string;
  content: string;
}>;

export type SeoResource = Readonly<{
  resourceType: SeoResourceType;
  resourceId: string;
  route: string;
  title: string;
  status: SeoResourceStatus;
  private: boolean;
  redirecting: boolean;
  publicContentUpdatedAt: string;
}>;

export type SeoMetadata = Readonly<{
  seoTitle?: string | null;
  metaDescription?: string | null;
  indexing: SeoIndexing;
  canonicalMode: SeoCanonicalMode;
  customCanonicalUrl?: string | null;
  socialTitle?: string | null;
  socialDescription?: string | null;
  socialImageId?: string | null;
  customMetaTags: readonly SafeMetaTag[];
  alternates: readonly SeoAlternate[];
}>;

export type SeoCompileResource = SeoResource & SeoMetadata;

export type SeoCompileSnapshot = Readonly<{
  store: Readonly<{
    id: string;
    name: string;
    handle: string;
    status: "draft" | "published" | "suspended" | "archived";
    primaryHostname: string;
    canonicalOrigin: string;
  }>;
  resources: readonly SeoCompileResource[];
  activeGenerationId?: string | null;
  dirtyVersion: number;
  indexNow?: Readonly<{
    key: string;
    keyLocationPath: string;
    enabled: boolean;
    fullRefresh: boolean;
    resourceKeys: readonly string[];
  }> | null;
}>;

export type SitemapExclusionReason =
  | "store_draft"
  | "resource_draft"
  | "resource_archived"
  | "noindex"
  | "redirect"
  | "private"
  | "canonical_mismatch"
  | "wrong_domain"
  | "invalid_route"
  | "invalid_lastmod";

export type SitemapEntry = Readonly<{
  resourceType: SeoResourceType;
  resourceId: string;
  location: string;
  lastModified: string;
  alternates: readonly SeoAlternate[];
}>;

export type SitemapExclusion = Readonly<{
  resourceType: SeoResourceType;
  resourceId: string;
  route: string;
  reason: SitemapExclusionReason;
}>;

export type CompiledSitemapSegment = Readonly<{
  type: SitemapSegmentType;
  number: number;
  fileName: string;
  objectKey: string;
  publicUrl: string;
  xml: string;
  urlCount: number;
  uncompressedBytes: number;
  contentHash: string;
  lastModified: string;
  entries: readonly SitemapEntry[];
}>;

export type CompiledSitemapGeneration = Readonly<{
  storeId: string;
  hostname: string;
  canonicalOrigin: string;
  storagePrefix: string;
  sitemapObjectKey: string;
  sitemapXml: string;
  contentHash: string;
  urlCount: number;
  segments: readonly CompiledSitemapSegment[];
  eligibleUrls: readonly string[];
  exclusions: readonly SitemapExclusion[];
}>;

export type SitemapValidationIssue = Readonly<{
  code: string;
  message: string;
  fileName?: string;
}>;

export type SitemapValidationResult = Readonly<{
  valid: boolean;
  issues: readonly SitemapValidationIssue[];
}>;
