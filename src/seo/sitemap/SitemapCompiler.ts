import { canonicalUrlForRoute, normalizeCanonicalOrigin } from "../canonical/CanonicalUrlService";
import { sitemapEligibilityService } from "./SitemapEligibility";
import { renderSitemapIndex, renderUrlSet } from "./SitemapXmlRenderer";
import type {
  CompiledSitemapGeneration,
  CompiledSitemapSegment,
  SeoCompileSnapshot,
  SitemapEntry,
  SitemapExclusion,
  SitemapSegmentType,
} from "../types";

export const INTERNAL_SITEMAP_URL_LIMIT = 25_000;
export const HARD_SITEMAP_URL_LIMIT = 50_000;
export const HARD_SITEMAP_BYTE_LIMIT = 50 * 1024 * 1024;

const encoder = new TextEncoder();

export const sha256 = async (value: string): Promise<string> => {
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
};

const segmentTypeForResource = (resourceType: string): SitemapSegmentType => {
  if (resourceType === "product") return "products";
  if (resourceType === "collection") return "collections";
  if (resourceType === "blog") return "blogs";
  return "pages";
};

const publicFileUrl = (canonicalOrigin: string, fileName: string): string =>
  canonicalUrlForRoute(canonicalOrigin, `/${fileName}`);

export type SitemapCompileOptions = Readonly<{
  storagePrefix: string;
  segmentLimit?: number;
}>;

export class SitemapCompiler {
  async compile(
    snapshot: SeoCompileSnapshot,
    options: SitemapCompileOptions,
  ): Promise<CompiledSitemapGeneration> {
    const canonicalOrigin = normalizeCanonicalOrigin(snapshot.store.canonicalOrigin);
    const segmentLimit = options.segmentLimit ?? INTERNAL_SITEMAP_URL_LIMIT;
    if (segmentLimit < 1 || segmentLimit > INTERNAL_SITEMAP_URL_LIMIT) {
      throw new Error(`Segment limit must be between 1 and ${INTERNAL_SITEMAP_URL_LIMIT}.`);
    }
    const entries = new Map<SitemapSegmentType, SitemapEntry[]>([
      ["pages", []],
      ["products", []],
      ["collections", []],
      ["blogs", []],
    ]);
    const exclusions: SitemapExclusion[] = [];
    const seenLocations = new Set<string>();

    for (const resource of snapshot.resources) {
      const eligibility = sitemapEligibilityService.evaluate(resource, {
        storeStatus: snapshot.store.status,
        canonicalOrigin,
      });
      if (eligibility.included === false) {
        exclusions.push({
          resourceType: resource.resourceType,
          resourceId: resource.resourceId,
          route: resource.route,
          reason: eligibility.reason,
        });
        continue;
      }
      if (seenLocations.has(eligibility.entry.location)) {
        throw new Error(`Duplicate eligible URL: ${eligibility.entry.location}`);
      }
      seenLocations.add(eligibility.entry.location);
      entries.get(segmentTypeForResource(resource.resourceType))!.push(eligibility.entry);
    }

    const segments: CompiledSitemapSegment[] = [];
    for (const [type, typeEntries] of entries) {
      typeEntries.sort((left, right) => left.location.localeCompare(right.location));
      for (let offset = 0; offset < typeEntries.length; offset += segmentLimit) {
        const chunk = typeEntries.slice(offset, offset + segmentLimit);
        const number = Math.floor(offset / segmentLimit) + 1;
        const fileName = `sitemap_${type}_${number}.xml`;
        const xml = renderUrlSet(chunk);
        const lastModified = chunk.reduce(
          (latest, entry) => entry.lastModified > latest ? entry.lastModified : latest,
          chunk[0]!.lastModified,
        );
        segments.push({
          type,
          number,
          fileName,
          objectKey: `${options.storagePrefix}/${fileName}`,
          publicUrl: publicFileUrl(canonicalOrigin, fileName),
          xml,
          urlCount: chunk.length,
          uncompressedBytes: encoder.encode(xml).byteLength,
          contentHash: await sha256(xml),
          lastModified,
          entries: chunk,
        });
      }
    }
    segments.sort((left, right) => left.fileName.localeCompare(right.fileName));
    if (segments.length === 0) throw new Error("A published store must have at least one eligible URL.");
    const sitemapXml = renderSitemapIndex(segments);
    const contentHash = await sha256([
      sitemapXml,
      ...segments.map((segment) => segment.contentHash),
    ].join("\n"));
    return {
      storeId: snapshot.store.id,
      hostname: snapshot.store.primaryHostname,
      canonicalOrigin,
      storagePrefix: options.storagePrefix,
      sitemapObjectKey: `${options.storagePrefix}/sitemap.xml`,
      sitemapXml,
      contentHash,
      urlCount: seenLocations.size,
      segments,
      eligibleUrls: [...seenLocations].sort(),
      exclusions,
    };
  }
}

export const sitemapCompiler = new SitemapCompiler();
