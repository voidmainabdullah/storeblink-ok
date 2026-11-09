import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CheckCircle2, Redo2, Save, Undo2 } from "lucide-react";
import {
  adaptiveSectionControlReadiness,
  AdaptiveAuthoringPolicyViolationError,
  createAdaptiveAuthoringSession,
  executeAdaptiveAuthoringCommand,
  projectAdaptiveAuthoringSession,
  redoAdaptiveAuthoringCommand,
  routesWithoutVisibleSections,
  undoAdaptiveAuthoringCommand,
  type AdaptiveAuthoringCommand,
  type AdaptiveAuthoringGateway,
  type AdaptiveAuthoringSaveRequest,
  type AdaptiveAuthoringSession,
  type AdaptiveAuthoringSource,
} from "@/adaptive-commerce/authoring";
import {
  STOREFRONT_RESOURCE_TYPES,
  type StorefrontResourceType,
} from "@/adaptive-commerce/contracts";
import { Button } from "@/components/ui/button";
import { AdaptiveStoreEditorDesignMode } from "./AdaptiveStoreEditorDesignMode";
import { AdaptiveStoreEditorPreview } from "./AdaptiveStoreEditorPreview";
import { AdaptiveStoreEditorStoreMode } from "./AdaptiveStoreEditorStoreMode";
import {
  getAdaptiveReleaseReviewService,
  type AdaptiveReleaseReviewController,
} from "@/adaptive-commerce/release-review";
import { AdaptiveStoreReleaseReviewPanel } from "./AdaptiveStoreReleaseReviewPanel";

type EditorMode = "store" | "design";

const routeLabel = (route: StorefrontResourceType): string => route === "404"
  ? "404"
  : `${route[0].toUpperCase()}${route.slice(1)}`;

const saveKey = (): string =>
  `authoring-${globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`}`;

type PendingSave = Readonly<{
  fingerprint: string;
  request: AdaptiveAuthoringSaveRequest;
}>;

export const AdaptiveStoreEditor = ({
  source,
  storeName,
  canEdit,
  canPublish,
  gateway,
  releaseReviewService,
}: Readonly<{
  source: AdaptiveAuthoringSource;
  storeName: string;
  canEdit: boolean;
  canPublish: boolean;
  gateway: AdaptiveAuthoringGateway;
  releaseReviewService?: AdaptiveReleaseReviewController;
}>) => {
  const [session, setSession] = useState<AdaptiveAuthoringSession>(() =>
    createAdaptiveAuthoringSession(source));
  const [mode, setMode] = useState<EditorMode>("store");
  const [route, setRoute] = useState<StorefrontResourceType>("home");
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const pendingSave = useRef<PendingSave | null>(null);
  const projection = useMemo(() => projectAdaptiveAuthoringSession(session), [session]);
  const readiness = useMemo(() => adaptiveSectionControlReadiness(session.source), [session.source]);
  const emptyRoutes = useMemo(
    () => routesWithoutVisibleSections(session.source.catalog, projection.effectiveDocument),
    [projection.effectiveDocument, session.source.catalog],
  );
  const reviewService = useMemo(
    () => releaseReviewService ?? getAdaptiveReleaseReviewService(),
    [releaseReviewService],
  );

  const dispatch = useCallback((command: AdaptiveAuthoringCommand) => {
    if (!canEdit || saving) return;
    setStatus(null);
    setError(null);
    pendingSave.current = null;
    try {
      setSession(executeAdaptiveAuthoringCommand(session, command));
    } catch (nextError) {
      setError(nextError instanceof AdaptiveAuthoringPolicyViolationError
        ? nextError.message
        : "This adaptive storefront change could not be applied.");
    }
  }, [canEdit, saving, session]);

  const undo = useCallback(() => {
    if (!canEdit || saving) return;
    setStatus(null);
    setError(null);
    pendingSave.current = null;
    setSession(undoAdaptiveAuthoringCommand);
  }, [canEdit, saving]);
  const redo = useCallback(() => {
    if (!canEdit || saving) return;
    setStatus(null);
    setError(null);
    pendingSave.current = null;
    setSession(redoAdaptiveAuthoringCommand);
  }, [canEdit, saving]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey) || event.altKey) return;
      if (event.key.toLowerCase() === "z") {
        event.preventDefault();
        if (event.shiftKey) redo(); else undo();
      } else if (event.key.toLowerCase() === "y") {
        event.preventDefault();
        redo();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [redo, undo]);

  const save = async () => {
    if (!canEdit || saving || !projection.changed || emptyRoutes.length) return;
    setSaving(true);
    setStatus(null);
    setError(null);
    const fingerprint = JSON.stringify({
      revision: session.source.sourceRevision,
      commandIds: session.executed.map((command) => command.id),
      operations: projection.operations,
      designTokens: projection.storeDefinition.designTokens,
      commerceBindings: projection.storeDefinition.commerceBindings,
    });
    if (pendingSave.current?.fingerprint !== fingerprint) {
      pendingSave.current = {
        fingerprint,
        request: {
          storeId: session.source.storeId,
          installationId: session.source.installationId,
          expectedSourceRevision: session.source.sourceRevision,
          idempotencyKey: saveKey(),
          operations: [...projection.operations],
          designTokens: projection.storeDefinition.designTokens,
          commerceBindings: projection.storeDefinition.commerceBindings,
        },
      };
    }
    try {
      const result = await gateway.save(pendingSave.current.request);
      const refreshed = await gateway.load(session.source.storeId);
      if (
        !refreshed ||
        refreshed.storeId !== session.source.storeId ||
        refreshed.installationId !== session.source.installationId ||
        refreshed.sourceRevision !== result.sourceRevision ||
        refreshed.sourceHash !== result.sourceHash
      ) {
        throw new Error("The save completed, but the authoritative adaptive source could not be reloaded.");
      }
      setSession(createAdaptiveAuthoringSession(refreshed));
      pendingSave.current = null;
      setStatus("Changes saved for review. Nothing was published.");
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Adaptive changes could not be saved.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex min-h-[calc(100vh-4rem)] flex-col bg-background" data-adaptive-editor="v3">
      <header className="border-b border-border bg-card px-4 py-3 lg:px-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-lg font-semibold">{storeName}</h1>
              <span className="border border-border px-2 py-0.5 text-[11px] font-semibold text-muted-foreground">Adaptive</span>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              Certified StoreKit {source.storeDefinition.storeKit.id} · draft source {source.sourceRevision}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="icon" onClick={undo} disabled={!canEdit || saving || !session.executed.length} aria-label="Undo last change"><Undo2 /></Button>
            <Button variant="outline" size="icon" onClick={redo} disabled={!canEdit || saving || !session.undone.length} aria-label="Redo last change"><Redo2 /></Button>
            <Button onClick={() => void save()} disabled={!canEdit || saving || !projection.changed || Boolean(emptyRoutes.length)}>
              <Save aria-hidden="true" /> {saving ? "Saving…" : "Save draft"}
            </Button>
          </div>
        </div>
        {!canEdit ? (
          <p className="mt-3 border border-border bg-muted/30 p-3 text-sm text-muted-foreground">
            Read-only access. A merchant with Theme edit permission can change this adaptive source.
          </p>
        ) : null}
        {status ? <p className="mt-3 flex items-center gap-2 text-sm text-emerald-700" role="status"><CheckCircle2 size={16} aria-hidden="true" />{status}</p> : null}
        {error ? <p className="mt-3 border border-red-300 bg-red-50 p-3 text-sm text-red-950" role="alert">{error}</p> : null}
        {emptyRoutes.length ? (
          <p className="mt-3 border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950" role="alert">
            Save blocked: {emptyRoutes.map(routeLabel).join(", ")} must keep at least one visible certified section.
          </p>
        ) : null}
        <AdaptiveStoreReleaseReviewPanel
          key={`${session.source.installationId}:${session.source.sourceRevision}`}
          identity={{
            storeId: session.source.storeId,
            installationId: session.source.installationId,
            sourceRevision: session.source.sourceRevision,
          }}
          canPublish={canPublish}
          hasUnsavedChanges={projection.changed}
          service={reviewService}
        />
      </header>

      <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
        <aside className="w-full border-b border-border bg-card lg:w-[360px] lg:border-b-0 lg:border-r">
          <div className="border-b border-border p-4">
            <div className="grid grid-cols-2 border border-border p-1" aria-label="Editor mode">
              {(["store", "design"] as const).map((entry) => (
                <button key={entry} type="button" onClick={() => setMode(entry)} aria-pressed={mode === entry} className={`min-h-10 px-3 text-sm font-semibold ${mode === entry ? "bg-foreground text-background" : "text-muted-foreground"}`}>
                  {entry === "store" ? "Store" : "Design"}
                </button>
              ))}
            </div>
            <label htmlFor="adaptive-route" className="mt-4 block text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">Preview route</label>
            <select id="adaptive-route" value={route} onChange={(event) => setRoute(event.target.value as StorefrontResourceType)} className="mt-2 w-full border border-border bg-background px-3 py-2 text-sm">
              {STOREFRONT_RESOURCE_TYPES.map((entry) => <option key={entry} value={entry}>{routeLabel(entry)}</option>)}
            </select>
          </div>
          <div className="max-h-[calc(100vh-15rem)] overflow-auto p-4 lg:p-5">
            {mode === "store" ? (
              <AdaptiveStoreEditorStoreMode source={session.source} projection={projection} route={route} structuralControlsReady={readiness.ready} editable={canEdit && !saving} dispatch={dispatch} />
            ) : (
              <AdaptiveStoreEditorDesignMode source={session.source} projection={projection} route={route} structuralControlsReady={readiness.ready} editable={canEdit && !saving} dispatch={dispatch} />
            )}
          </div>
        </aside>
        <AdaptiveStoreEditorPreview source={session.source} projection={projection} route={route} storeName={storeName} />
      </div>
    </div>
  );
};
