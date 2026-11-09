import type { SeoResource, SeoResourceStatus, SeoResourceType } from "../types";

type SourceBase = Readonly<{
  id: string;
  title: string;
  updatedAt: string;
  status: SeoResourceStatus;
}>;

const resource = (
  source: SourceBase,
  resourceType: SeoResourceType,
  route: string,
): SeoResource => ({
  resourceType,
  resourceId: source.id,
  route,
  title: source.title,
  status: source.status,
  private: false,
  redirecting: false,
  publicContentUpdatedAt: source.updatedAt,
});

export class SeoResourceRegistry {
  systemPages(storeUpdatedAt: string, published: boolean): SeoResource[] {
    const status = published ? "published" : "draft";
    return [
      resource({ id: "home", title: "Home", updatedAt: storeUpdatedAt, status }, "system_page", "/"),
      resource({ id: "catalog", title: "Products", updatedAt: storeUpdatedAt, status }, "system_page", "/products"),
    ];
  }

  page(source: SourceBase & Readonly<{ handle: string; kind?: string; system?: boolean }>): SeoResource {
    const route = source.kind === "about"
      ? "/about"
      : source.kind === "contact"
        ? "/contact"
        : `/pages/${encodeURIComponent(source.handle)}`;
    return resource(source, source.system ? "system_page" : "custom_page", route);
  }

  product(source: SourceBase & Readonly<{ handle: string }>): SeoResource {
    return resource(source, "product", `/products/${encodeURIComponent(source.handle)}`);
  }

  collection(source: SourceBase & Readonly<{ handle: string }>): SeoResource {
    return resource(source, "collection", `/collections/${encodeURIComponent(source.handle)}`);
  }
}

export const seoResourceRegistry = new SeoResourceRegistry();
