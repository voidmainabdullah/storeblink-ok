import { canonicalUrlForRoute, canonicalUrlService } from "../canonical/CanonicalUrlService";
import type {
  SeoCompileResource,
  SitemapEntry,
  SitemapExclusionReason,
} from "../types";

export type SitemapEligibilityResult =
  | Readonly<{ included: true; entry: SitemapEntry }>
  | Readonly<{ included: false; reason: SitemapExclusionReason }>;

const validLastModified = (value: string): string | null => {
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : null;
};

export class SitemapEligibilityService {
  evaluate(
    resource: SeoCompileResource,
    context: Readonly<{ storeStatus: string; canonicalOrigin: string }>,
  ): SitemapEligibilityResult {
    if (context.storeStatus !== "published") return { included: false, reason: "store_draft" };
    if (resource.status === "draft") return { included: false, reason: "resource_draft" };
    if (resource.status === "archived") return { included: false, reason: "resource_archived" };
    if (resource.indexing !== "index_follow") return { included: false, reason: "noindex" };
    if (resource.redirecting) return { included: false, reason: "redirect" };
    if (resource.private) return { included: false, reason: "private" };

    let automatic: string;
    let canonical: string;
    try {
      automatic = canonicalUrlForRoute(context.canonicalOrigin, resource.route);
      canonical = resource.canonicalMode === "automatic"
        ? automatic
        : canonicalUrlService.resolve({
            canonicalOrigin: context.canonicalOrigin,
            route: resource.route,
            canonicalMode: resource.canonicalMode,
            customCanonicalUrl: resource.customCanonicalUrl,
          });
    } catch {
      return { included: false, reason: "invalid_route" };
    }
    if (resource.canonicalMode === "custom" && !canonicalUrlService.isOwnedByPrimaryOrigin(canonical, context.canonicalOrigin)) {
      return { included: false, reason: "wrong_domain" };
    }
    if (canonical !== automatic) return { included: false, reason: "canonical_mismatch" };
    const lastModified = validLastModified(resource.publicContentUpdatedAt);
    if (!lastModified) return { included: false, reason: "invalid_lastmod" };
    return {
      included: true,
      entry: {
        resourceType: resource.resourceType,
        resourceId: resource.resourceId,
        location: automatic,
        lastModified,
        alternates: resource.alternates,
      },
    };
  }
}

export const sitemapEligibilityService = new SitemapEligibilityService();
