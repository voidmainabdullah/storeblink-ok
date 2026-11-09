import { Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { SeoDashboardResource } from "./seo-dashboard.types";

const exclusionLabels: Record<string, string> = {
  store_draft: "Store is not published",
  resource_draft: "Draft",
  resource_archived: "Archived",
  noindex: "Noindex",
  private: "Private",
  redirect: "Redirected",
  wrong_domain: "Canonical uses another domain",
  canonical_mismatch: "Canonical points to another page",
};

type SeoResourceListProps = {
  resources: readonly SeoDashboardResource[];
  onEdit(resource: SeoDashboardResource): void;
};

export const SeoResourceList = ({ resources, onEdit }: SeoResourceListProps) => {
  if (!resources.length) {
    return <div className="border bg-background p-8 text-center text-sm text-muted-foreground">No resources in this category.</div>;
  }
  return (
    <div className="divide-y border bg-background">
      {resources.map((resource) => (
        <article
          key={`${resource.resourceType}:${resource.resourceId}`}
          className="grid gap-3 p-4 sm:grid-cols-[minmax(0,1fr)_170px_44px] sm:items-center"
        >
          <div className="min-w-0">
            <h3 className="truncate text-sm font-semibold">{resource.title}</h3>
            <p className="mt-1 truncate text-xs text-muted-foreground">{resource.route}</p>
          </div>
          <div>
            <p className={resource.excludedReason ? "text-xs font-medium text-amber-700" : "text-xs font-medium text-emerald-700"}>
              {resource.excludedReason
                ? exclusionLabels[resource.excludedReason] ?? resource.excludedReason
                : "Included in sitemap"}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              {resource.seoTitle?.trim() ? "Custom search title" : "Uses page title"}
            </p>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label={`Edit SEO for ${resource.title}`}
            onClick={() => onEdit(resource)}
          >
            <Pencil size={16} />
          </Button>
        </article>
      ))}
    </div>
  );
};
