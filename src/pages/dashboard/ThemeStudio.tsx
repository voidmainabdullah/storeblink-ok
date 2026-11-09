import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, RefreshCw, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  loadThemeStudioDiagnostics,
  type ThemeStudioDiagnosticsReport,
} from "@/adaptive-commerce/studio";
import { useAuth } from "@/hooks/useAuth";
import { ThemeStudioReportView } from "./ThemeStudioReportView";
import { ThemeStudioPlannerPanel } from "./ThemeStudioPlannerPanel";

export type ThemeStudioProps = Readonly<{
  diagnosticsLoader?: typeof loadThemeStudioDiagnostics;
}>;

const ThemeStudio = ({ diagnosticsLoader = loadThemeStudioDiagnostics }: ThemeStudioProps) => {
  const { currentStore } = useAuth();
  const [report, setReport] = useState<ThemeStudioDiagnosticsReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const requestId = useRef(0);

  const refresh = useCallback(async () => {
    const currentRequest = ++requestId.current;
    setLoading(true);
    setLoadError(null);
    try {
      const next = await diagnosticsLoader({ storeHandle: currentStore?.handle ?? null });
      if (currentRequest !== requestId.current) return;
      setReport(next);
    } catch (error) {
      if (currentRequest !== requestId.current) return;
      setReport(null);
      setLoadError(error instanceof Error ? error.message : "Theme Studio diagnostics could not be loaded.");
    } finally {
      if (currentRequest === requestId.current) setLoading(false);
    }
  }, [currentStore?.handle, diagnosticsLoader]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return (
    <div className="mx-auto max-w-7xl pb-10">
      <header className="mb-8 flex flex-col gap-5 border-b border-border pb-7 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <Link to="/dashboard/store" className="mb-5 inline-flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground">
            <ArrowLeft size={15} aria-hidden="true" /> Store editor
          </Link>
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-3xl font-semibold tracking-tight">Theme Studio</h1>
            <span className="inline-flex items-center gap-1.5 border border-border bg-muted/40 px-2.5 py-1 text-xs font-semibold text-muted-foreground">
              <ShieldCheck size={13} aria-hidden="true" /> Diagnostics + review proposals
            </span>
          </div>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">
            Developer-level visibility into the Adaptive Commerce registry and compiler. Checks and planning proposals never edit, install, or publish your storefront.
          </p>
        </div>
        <Button variant="outline" onClick={() => void refresh()} disabled={loading}>
          <RefreshCw size={15} className={`mr-2 ${loading ? "animate-spin" : ""}`} aria-hidden="true" />
          {loading ? "Checking…" : "Run checks again"}
        </Button>
      </header>

      {currentStore?.id ? (
        <div className="mb-8"><ThemeStudioPlannerPanel storeId={currentStore.id} /></div>
      ) : null}

      {loading && !report ? (
        <div className="border border-border bg-card p-8 text-sm text-muted-foreground" role="status">
          Running registry and compiler checks…
        </div>
      ) : loadError ? (
        <section className="border border-red-300 bg-red-50 p-6 text-red-950" role="alert">
          <h2 className="font-semibold">Diagnostics unavailable</h2>
          <p className="mt-2 text-sm leading-6">{loadError}</p>
          <p className="mt-2 text-sm leading-6 opacity-80">No readiness claim has been made. Retry after the underlying registry or compiler issue is resolved.</p>
        </section>
      ) : report ? (
        <ThemeStudioReportView report={report} storeName={currentStore?.name ?? "this store"} />
      ) : null}
    </div>
  );
};

export default ThemeStudio;
