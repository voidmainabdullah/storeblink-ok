import { useMemo, useState } from "react";
import { AlertCircle, CheckCircle2, FileSearch, Loader2, RefreshCw, SearchX } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { SeoMetadataEditor } from "@/seo/dashboard/SeoMetadataEditor";
import { SeoRedirectsPanel } from "@/seo/dashboard/SeoRedirectsPanel";
import { SeoResourceList } from "@/seo/dashboard/SeoResourceList";
import { SeoSitemapPanel } from "@/seo/dashboard/SeoSitemapPanel";
import { seoDashboardService } from "@/seo/dashboard/SeoDashboardService";
import type { SeoDashboardResource, SeoMetadataInput } from "@/seo/dashboard/seo-dashboard.types";
import { useSeoDashboard, useSeoMutation } from "@/seo/dashboard/useSeoDashboard";

const SeoDashboardPage = () => {
  const dashboard = useSeoDashboard();
  const [editing, setEditing] = useState<SeoDashboardResource | null>(null);
  const metadata = useSeoMutation<{
    resource: SeoDashboardResource;
    input: SeoMetadataInput;
  }>(
    (storeId, variables) => seoDashboardService.updateMetadata(
      storeId,
      variables.resource.resourceType,
      variables.resource.resourceId,
      variables.input,
    ),
    "SEO metadata saved",
  );
  const regenerate = useSeoMutation<void>(
    (storeId) => seoDashboardService.regenerate(storeId),
    "Sitemap regeneration scheduled",
  );
  const rollback = useSeoMutation<string>(
    (storeId, generationId) => seoDashboardService.rollback(storeId, generationId),
    "Sitemap generation restored",
  );
  const saveRedirect = useSeoMutation<{
    sourcePath: string;
    destinationPath: string;
    statusCode: 301 | 302 | 307 | 308;
  }>(
    (storeId, input) => seoDashboardService.saveRedirect(
      storeId,
      input.sourcePath,
      input.destinationPath,
      input.statusCode,
    ),
    "Redirect saved",
  );
  const deleteRedirect = useSeoMutation<string>(
    (storeId, redirectId) => seoDashboardService.deleteRedirect(storeId, redirectId),
    "Redirect deleted",
  );
  const groups = useMemo(() => ({
    pages: dashboard.data?.resources.filter((resource) => (
      ["system_page", "custom_page", "blog"].includes(resource.resourceType)
    )) ?? [],
    products: dashboard.data?.resources.filter((resource) => resource.resourceType === "product") ?? [],
    collections: dashboard.data?.resources.filter((resource) => resource.resourceType === "collection") ?? [],
  }), [dashboard.data?.resources]);

  if (dashboard.isLoading) {
    return <div className="grid min-h-[320px] place-items-center"><Loader2 className="animate-spin" /></div>;
  }
  if (dashboard.error || !dashboard.data) {
    return (
      <div role="alert" className="border border-destructive/30 bg-destructive/5 p-6">
        <h1 className="font-semibold">SEO dashboard could not be loaded</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {dashboard.error instanceof Error ? dashboard.error.message : "Try the request again."}
        </p>
        <Button className="mt-4" variant="outline" onClick={() => void dashboard.refetch()}>Try again</Button>
      </div>
    );
  }

  const data = dashboard.data;
  const included = data.resources.filter((resource) => !resource.excludedReason).length;
  const active = data.generations.find((generation) => generation.id === data.state.activeGenerationId);

  return (
    <div className="mx-auto max-w-5xl space-y-7">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="mb-3 grid h-10 w-10 place-items-center bg-foreground text-background"><FileSearch size={19} /></div>
          <h1 className="text-2xl font-semibold">Search appearance</h1>
          <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
            Manage page metadata and inspect the automatically compiled sitemap.
          </p>
        </div>
        <Button variant="outline" onClick={() => void dashboard.refetch()} disabled={dashboard.isFetching}>
          <RefreshCw className={dashboard.isFetching ? "mr-2 animate-spin" : "mr-2"} size={15} /> Refresh
        </Button>
      </div>

      <dl className="grid border bg-background sm:grid-cols-3">
        <div className="border-b p-4 sm:border-b-0 sm:border-r"><dt className="text-xs text-muted-foreground">Included URLs</dt><dd className="mt-1 text-2xl font-semibold">{included}</dd></div>
        <div className="border-b p-4 sm:border-b-0 sm:border-r"><dt className="text-xs text-muted-foreground">Excluded URLs</dt><dd className="mt-1 text-2xl font-semibold">{data.resources.length - included}</dd></div>
        <div className="p-4"><dt className="text-xs text-muted-foreground">Active generation</dt><dd className="mt-1 text-2xl font-semibold">{active ? `v${active.generation}` : "Pending"}</dd></div>
      </dl>

      {data.healthIssues.length ? (
        <section aria-labelledby="seo-health-heading">
          <div className="mb-3 flex items-center justify-between gap-4">
            <h2 id="seo-health-heading" className="text-sm font-semibold">SEO health</h2>
            <Badge variant="outline">{data.healthIssues.length} issues</Badge>
          </div>
          <div className="divide-y border bg-background">
            {data.healthIssues.map((issue) => (
              <div key={`${issue.code}:${issue.resourceId}`} className="flex gap-3 p-4">
                {issue.severity === "error"
                  ? <AlertCircle className="mt-0.5 shrink-0 text-destructive" size={17} />
                  : <SearchX className="mt-0.5 shrink-0 text-amber-600" size={17} />}
                <div className="min-w-0"><p className="text-sm font-medium">{issue.message}</p><p className="mt-1 truncate text-xs text-muted-foreground">{issue.route}</p></div>
              </div>
            ))}
          </div>
        </section>
      ) : (
        <div className="flex items-center gap-3 border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-950"><CheckCircle2 size={18} /> No SEO health issues detected.</div>
      )}

      <Tabs defaultValue="pages">
        <TabsList className="h-auto w-full justify-start overflow-x-auto rounded-none border bg-background p-1">
          <TabsTrigger value="pages">Pages</TabsTrigger>
          <TabsTrigger value="products">Products</TabsTrigger>
          <TabsTrigger value="collections">Collections</TabsTrigger>
          <TabsTrigger value="sitemap">Sitemap</TabsTrigger>
          <TabsTrigger value="redirects">Redirects</TabsTrigger>
        </TabsList>
        <TabsContent value="pages"><SeoResourceList resources={groups.pages} onEdit={setEditing} /></TabsContent>
        <TabsContent value="products"><SeoResourceList resources={groups.products} onEdit={setEditing} /></TabsContent>
        <TabsContent value="collections"><SeoResourceList resources={groups.collections} onEdit={setEditing} /></TabsContent>
        <TabsContent value="sitemap">
          <SeoSitemapPanel
            dashboard={data}
            regenerating={regenerate.isPending}
            rollingBack={rollback.isPending}
            onRegenerate={() => regenerate.mutate(undefined)}
            onRollback={(generationId) => rollback.mutate(generationId)}
          />
        </TabsContent>
        <TabsContent value="redirects">
          <SeoRedirectsPanel
            redirects={data.redirects}
            saving={saveRedirect.isPending}
            deleting={deleteRedirect.isPending}
            onSave={async (input) => { await saveRedirect.mutateAsync(input); }}
            onDelete={(redirectId) => deleteRedirect.mutate(redirectId)}
          />
        </TabsContent>
      </Tabs>

      <SeoMetadataEditor
        resource={editing}
        open={Boolean(editing)}
        saving={metadata.isPending}
        onOpenChange={(open) => { if (!open) setEditing(null); }}
        onSave={(input) => {
          if (!editing) return;
          metadata.mutate({ resource: editing, input }, { onSuccess: () => setEditing(null) });
        }}
      />
    </div>
  );
};

export default SeoDashboardPage;
