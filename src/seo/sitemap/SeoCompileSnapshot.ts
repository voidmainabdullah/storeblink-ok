import type {
  SeoCanonicalMode,
  SeoCompileResource,
  SeoCompileSnapshot,
  SeoIndexing,
  SeoResourceStatus,
  SeoResourceType,
} from "../types";
import { metaTagValidator } from "../metadata/MetaTagValidator";

const record = (value: unknown, label: string): Record<string, unknown> => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`Invalid sitemap snapshot ${label}.`);
  }
  return value as Record<string, unknown>;
};

const text = (value: unknown, label: string): string => {
  if (typeof value !== "string" || !value.trim()) throw new Error(`Invalid sitemap snapshot ${label}.`);
  return value.trim();
};

const oneOf = <T extends string>(value: unknown, values: readonly T[], label: string): T => {
  if (typeof value !== "string" || !values.includes(value as T)) {
    throw new Error(`Invalid sitemap snapshot ${label}.`);
  }
  return value as T;
};

const resourceTypes: readonly SeoResourceType[] = [
  "system_page", "custom_page", "product", "collection", "blog",
];
const resourceStatuses: readonly SeoResourceStatus[] = ["draft", "published", "archived"];
const indexingValues: readonly SeoIndexing[] = ["index_follow", "noindex_follow", "noindex_nofollow"];
const canonicalModes: readonly SeoCanonicalMode[] = ["automatic", "custom"];

const parseResource = (value: unknown): SeoCompileResource => {
  const source = record(value, "resource");
  const alternates = Array.isArray(source.alternates)
    ? source.alternates.map((alternate) => {
        const candidate = record(alternate, "alternate");
        return { locale: text(candidate.locale, "alternate locale"), url: text(candidate.url, "alternate URL") };
      })
    : [];
  return {
    resourceType: oneOf(source.resourceType, resourceTypes, "resource type"),
    resourceId: text(source.resourceId, "resource ID"),
    route: text(source.route, "route"),
    title: text(source.title, "title"),
    status: oneOf(source.status, resourceStatuses, "resource status"),
    private: source.private === true,
    redirecting: source.redirecting === true,
    publicContentUpdatedAt: text(source.publicContentUpdatedAt, "last modified"),
    indexing: oneOf(source.indexing, indexingValues, "indexing policy"),
    canonicalMode: oneOf(source.canonicalMode, canonicalModes, "canonical mode"),
    customCanonicalUrl: typeof source.customCanonicalUrl === "string" ? source.customCanonicalUrl : null,
    alternates: metaTagValidator.sanitizeAlternates(alternates),
    customMetaTags: [],
  };
};

export const parseSeoCompileSnapshot = (value: unknown): SeoCompileSnapshot => {
  const source = record(value, "root");
  const store = record(source.store, "store");
  const indexNow = source.indexNow == null
    ? null
    : record(source.indexNow, "IndexNow configuration");
  if (!Array.isArray(source.resources)) throw new Error("Invalid sitemap snapshot resources.");
  if (!Number.isSafeInteger(source.dirtyVersion) || Number(source.dirtyVersion) < 0) {
    throw new Error("Invalid sitemap snapshot dirty version.");
  }
  return {
    store: {
      id: text(store.id, "store ID"),
      name: text(store.name, "store name"),
      handle: text(store.handle, "store handle"),
      status: oneOf(store.status, ["draft", "published", "suspended", "archived"], "store status"),
      primaryHostname: text(store.primaryHostname, "primary hostname"),
      canonicalOrigin: text(store.canonicalOrigin, "canonical origin"),
    },
    resources: source.resources.map(parseResource),
    activeGenerationId: typeof source.activeGenerationId === "string"
      ? source.activeGenerationId
      : null,
    dirtyVersion: Number(source.dirtyVersion),
    indexNow: indexNow ? {
      key: text(indexNow.key, "IndexNow key"),
      keyLocationPath: text(indexNow.keyLocationPath, "IndexNow key path"),
      enabled: indexNow.enabled === true,
      fullRefresh: indexNow.fullRefresh !== false,
      resourceKeys: Array.isArray(indexNow.resourceKeys)
        ? indexNow.resourceKeys.map((key) => text(key, "IndexNow resource key"))
        : [],
    } : null,
  };
};
