import { useState } from "react";
import { CheckCircle2, CircleAlert, History, Loader2, RefreshCw, RotateCcw } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import type { SeoDashboard } from "./seo-dashboard.types";

type SeoSitemapPanelProps = {
  dashboard: SeoDashboard;
  regenerating: boolean;
  rollingBack: boolean;
  onRegenerate(): void;
  onRollback(generationId: string): void;
};

const formatDate = (value: string | null | undefined) => value
  ? new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(new Date(value))
  : "Not yet";

export const SeoSitemapPanel = ({
  dashboard,
  regenerating,
  rollingBack,
  onRegenerate,
  onRollback,
}: SeoSitemapPanelProps) => {
  const [pendingRestore, setPendingRestore] = useState<string | null>(null);
  const active = dashboard.generations.find((generation) => (
    generation.id === dashboard.state.activeGenerationId
  ));
  const dirtySinceTimestamp = dashboard.state.dirtySince
    ? Date.parse(dashboard.state.dirtySince)
    : Number.NaN;
  const regenerationOverdue = dashboard.state.dirty &&
    Number.isFinite(dirtySinceTimestamp) &&
    Date.now() - dirtySinceTimestamp > 24 * 60 * 60 * 1000;
  return (
    <div className="space-y-6">
      <section className="border bg-background" aria-labelledby="sitemap-status-heading">
        <div className="flex flex-wrap items-center justify-between gap-4 border-b p-5">
          <div>
            <h2 id="sitemap-status-heading" className="text-sm font-semibold">Active sitemap</h2>
            <p className="mt-1 text-xs text-muted-foreground">
              {active ? `Generation ${active.generation} - ${active.urlCount.toLocaleString()} URLs` : "Initial generation pending"}
            </p>
          </div>
          <span className="flex items-center gap-2 text-sm font-medium">
            {dashboard.state.dirty
              ? <CircleAlert className="text-amber-600" size={16} />
              : <CheckCircle2 className="text-emerald-600" size={16} />}
            {dashboard.state.dirty ? "Changes queued" : "Up to date"}
          </span>
        </div>
        <dl className="grid sm:grid-cols-3">
          <div className="border-b p-4 sm:border-b-0 sm:border-r">
            <dt className="text-xs text-muted-foreground">Last compiled</dt>
            <dd className="mt-1 text-sm font-medium">{formatDate(dashboard.state.lastCompiledAt)}</dd>
          </div>
          <div className="border-b p-4 sm:border-b-0 sm:border-r">
            <dt className="text-xs text-muted-foreground">Segments</dt>
            <dd className="mt-1 text-sm font-medium">{dashboard.segments.length}</dd>
          </div>
          <div className="p-4">
            <dt className="text-xs text-muted-foreground">IndexNow</dt>
            <dd className="mt-1 text-sm font-medium">{dashboard.indexNow.enabled ? "Enabled" : "Disabled"}</dd>
          </div>
        </dl>
        {dashboard.state.lastFailureMessage ? (
          <div role="alert" className="border-t bg-red-50 p-4 text-sm text-red-900">
            <p className="font-semibold">Last generation failed</p>
            <p className="mt-1">{dashboard.state.lastFailureMessage}</p>
          </div>
        ) : null}
        {regenerationOverdue ? (
          <div role="alert" className="border-t bg-amber-50 p-4 text-sm text-amber-950">
            <p className="font-semibold">Sitemap regeneration is overdue</p>
            <p className="mt-1">
              Changes have been queued since {formatDate(dashboard.state.dirtySince)}. Queue a regeneration or contact support if the next sweep does not complete.
            </p>
          </div>
        ) : null}
        <div className="border-t p-4">
          <Button variant="outline" onClick={onRegenerate} disabled={regenerating}>
            {regenerating ? <Loader2 className="mr-2 animate-spin" size={15} /> : <RefreshCw className="mr-2" size={15} />}
            Queue regeneration
          </Button>
        </div>
      </section>

      <section aria-labelledby="generation-history-heading">
        <div className="mb-3 flex items-center gap-2">
          <History size={16} />
          <h2 id="generation-history-heading" className="text-sm font-semibold">Generation history</h2>
        </div>
        <div className="divide-y border bg-background">
          {dashboard.generations.map((generation) => {
            const isActive = generation.id === dashboard.state.activeGenerationId;
            const canRestore = !isActive && ["rolled_back", "ready"].includes(generation.status);
            return (
              <article key={generation.id} className="grid gap-3 p-4 sm:grid-cols-[1fr_180px_130px] sm:items-center">
                <div>
                  <p className="text-sm font-semibold">Generation {generation.generation}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {generation.urlCount.toLocaleString()} URLs - {generation.segmentCount} segments
                  </p>
                </div>
                <div>
                  <p className="text-xs font-medium capitalize">{isActive ? "Active" : generation.status.replace("_", " ")}</p>
                  <p className="mt-1 text-xs text-muted-foreground">{formatDate(generation.completedAt)}</p>
                </div>
                {canRestore ? (
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={rollingBack}
                    onClick={() => setPendingRestore(generation.id)}
                  >
                    {rollingBack ? <Loader2 className="mr-2 animate-spin" size={14} /> : <RotateCcw className="mr-2" size={14} />}
                    Restore
                  </Button>
                ) : <span className="text-xs text-muted-foreground">{isActive ? "Currently served" : "Not restorable"}</span>}
              </article>
            );
          })}
          {!dashboard.generations.length ? (
            <p className="p-6 text-sm text-muted-foreground">No sitemap generation has completed yet.</p>
          ) : null}
        </div>
      </section>
      <AlertDialog open={Boolean(pendingRestore)} onOpenChange={(open) => { if (!open) setPendingRestore(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Restore this sitemap generation?</AlertDialogTitle>
            <AlertDialogDescription>
              The selected immutable generation will become public immediately. Current content changes remain in the registry and can be regenerated afterward.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => {
              if (pendingRestore) onRollback(pendingRestore);
              setPendingRestore(null);
            }}>Restore generation</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};
