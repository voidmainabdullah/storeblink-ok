import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertCircle,
  CheckCircle2,
  CircleDashed,
  Clock3,
  RefreshCw,
  ShieldAlert,
} from "lucide-react";
import type {
  AdaptiveReleaseReviewController,
  AdaptiveReleaseReviewIdentity,
  AdaptiveReleaseReviewSnapshot,
} from "@/adaptive-commerce/release-review";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";

type BusyAction = "load" | "refresh" | "validate" | "accept" | "reject" | "publish" | null;

type ReleaseState = Readonly<{
  key: "unsaved" | "needs-validation" | "compiling" | "failed" | "pending" |
    "uncomparable" | "accepted" | "rejected" | "not-current" | "current";
  title: string;
  description: string;
  tone: "neutral" | "progress" | "warning" | "danger" | "success";
}>;

const runningStates = new Set([
  "claimed", "loading-source", "compiling", "quality-gate", "shadowing", "publishing",
]);

const sourceIsCurrent = (snapshot: AdaptiveReleaseReviewSnapshot): boolean =>
  snapshot.latestJob?.isCurrent === true || (
    snapshot.currentPublication?.installationId === snapshot.installationId &&
    snapshot.currentPublication.sourceRevision === snapshot.sourceRevision
  );

const releaseState = (
  snapshot: AdaptiveReleaseReviewSnapshot,
  hasUnsavedChanges: boolean,
): ReleaseState => {
  if (hasUnsavedChanges) return {
    key: "unsaved",
    title: "Save this draft before validation",
    description: "Validation always uses the saved canonical source. Your local changes are not included yet.",
    tone: "warning",
  };
  if (sourceIsCurrent(snapshot)) return {
    key: "current",
    title: "Published and current",
    description: `Source revision ${snapshot.sourceRevision} is the storefront customers receive.`,
    tone: "success",
  };
  const job = snapshot.latestJob;
  if (!job) return {
    key: "needs-validation",
    title: "Draft needs validation",
    description: "Run the certified compiler and release checks. Nothing will be published.",
    tone: "neutral",
  };
  if (runningStates.has(job.state)) return {
    key: "compiling",
    title: "Validation in progress",
    description: "The server is compiling the saved source and checking all eight storefront routes.",
    tone: "progress",
  };
  if (job.state === "failed") return {
    key: "failed",
    title: "Validation did not pass",
    description: job.error?.message ?? "The release checks did not produce a reviewable candidate.",
    tone: "danger",
  };
  if (job.published) return {
    key: "not-current",
    title: "Published previously, but not current",
    description: "The live pointer moved after this publication. Validate the saved source again before requesting a new activation.",
    tone: "warning",
  };
  if (!job.shadow) return {
    key: "compiling",
    title: "Validation is finishing",
    description: "The persisted candidate is waiting for its comparison result.",
    tone: "progress",
  };
  if (job.shadow.status === "uncomparable") return {
    key: "uncomparable",
    title: "Trusted visual evidence required",
    description: "The current legacy storefront is opaque, so this candidate stays blocked until a trusted visual comparison is attached.",
    tone: "warning",
  };
  if (job.shadow.status === "pending") return {
    key: "pending",
    title: "Candidate ready for review",
    description: "Review the intentional structural differences, then accept or reject this exact persisted candidate.",
    tone: "warning",
  };
  if (job.shadow.status === "rejected") return {
    key: "rejected",
    title: "Candidate rejected",
    description: "This candidate is terminal. Make a draft change and validate the new source revision when ready.",
    tone: "danger",
  };
  return {
    key: "accepted",
    title: "Accepted and ready to publish",
    description: "Publishing will activate the exact candidate that passed validation and review; it will not recompile.",
    tone: "success",
  };
};

const toneClass: Record<ReleaseState["tone"], string> = {
  neutral: "border-border bg-muted/20 text-foreground",
  progress: "border-blue-300 bg-blue-50 text-blue-950",
  warning: "border-amber-300 bg-amber-50 text-amber-950",
  danger: "border-red-300 bg-red-50 text-red-950",
  success: "border-emerald-300 bg-emerald-50 text-emerald-950",
};

const StateIcon = ({ tone }: Readonly<{ tone: ReleaseState["tone"] }>) => {
  if (tone === "success") return <CheckCircle2 size={18} aria-hidden="true" />;
  if (tone === "danger") return <AlertCircle size={18} aria-hidden="true" />;
  if (tone === "warning") return <ShieldAlert size={18} aria-hidden="true" />;
  if (tone === "progress") return <CircleDashed className="animate-spin" size={18} aria-hidden="true" />;
  return <Clock3 size={18} aria-hidden="true" />;
};

const DialogAction = ({
  trigger,
  title,
  description,
  action,
  destructive = false,
  disabled,
  onConfirm,
}: Readonly<{
  trigger: string;
  title: string;
  description: string;
  action: string;
  destructive?: boolean;
  disabled: boolean;
  onConfirm(): void;
}>) => (
  <AlertDialog>
    <AlertDialogTrigger asChild>
      <Button variant={destructive ? "outline" : "default"} disabled={disabled}>{trigger}</Button>
    </AlertDialogTrigger>
    <AlertDialogContent>
      <AlertDialogHeader>
        <AlertDialogTitle>{title}</AlertDialogTitle>
        <AlertDialogDescription>{description}</AlertDialogDescription>
      </AlertDialogHeader>
      <AlertDialogFooter>
        <AlertDialogCancel>Cancel</AlertDialogCancel>
        <AlertDialogAction
          className={destructive ? "bg-destructive text-destructive-foreground hover:bg-destructive/90" : undefined}
          onClick={onConfirm}
        >
          {action}
        </AlertDialogAction>
      </AlertDialogFooter>
    </AlertDialogContent>
  </AlertDialog>
);

export const AdaptiveStoreReleaseReviewPanel = ({
  identity,
  canPublish,
  hasUnsavedChanges,
  service,
}: Readonly<{
  identity: AdaptiveReleaseReviewIdentity;
  canPublish: boolean;
  hasUnsavedChanges: boolean;
  service: AdaptiveReleaseReviewController;
}>) => {
  const [snapshot, setSnapshot] = useState<AdaptiveReleaseReviewSnapshot | null>(null);
  const [busy, setBusy] = useState<BusyAction>("load");
  const [error, setError] = useState<string | null>(null);
  const { storeId, installationId, sourceRevision } = identity;

  const load = useCallback(async (kind: "load" | "refresh" = "refresh") => {
    setBusy(kind);
    setError(null);
    try {
      setSnapshot(await service.load({ storeId, installationId, sourceRevision }));
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Release status could not be loaded.");
    } finally {
      setBusy(null);
    }
  }, [installationId, service, sourceRevision, storeId]);

  useEffect(() => {
    setSnapshot(null);
    void load("load");
  }, [load]);

  useEffect(() => {
    if (!snapshot?.latestJob || !runningStates.has(snapshot.latestJob.state)) return;
    const timer = window.setTimeout(() => void load("refresh"), 2_500);
    return () => window.clearTimeout(timer);
  }, [load, snapshot?.latestJob]);

  const state = useMemo(
    () => snapshot ? releaseState(snapshot, hasUnsavedChanges) : null,
    [hasUnsavedChanges, snapshot],
  );
  const changeCount = useMemo(() => {
    const changes = snapshot?.latestJob?.shadow?.structuralDiff.changes;
    return Array.isArray(changes) ? changes.length : null;
  }, [snapshot]);
  const blockedRoutes = useMemo(() => {
    const routes = snapshot?.latestJob?.shadow?.structuralDiff.uncomparableRoutes;
    return Array.isArray(routes) ? routes.filter((route): route is string => typeof route === "string") : [];
  }, [snapshot]);
  const changePaths = useMemo(() => {
    const changes = snapshot?.latestJob?.shadow?.structuralDiff.changes;
    if (!Array.isArray(changes)) return [];
    return changes.flatMap((change) => {
      if (!change || typeof change !== "object" || Array.isArray(change)) return [];
      const path = (change as Record<string, unknown>).path;
      return typeof path === "string" && path ? [path] : [];
    });
  }, [snapshot]);

  const perform = async (
    kind: Exclude<BusyAction, "load" | "refresh" | null>,
    operation: (current: AdaptiveReleaseReviewSnapshot) => Promise<AdaptiveReleaseReviewSnapshot>,
  ) => {
    if (!snapshot || busy) return;
    setBusy(kind);
    setError(null);
    try {
      setSnapshot(await operation(snapshot));
    } catch (nextError) {
      const message = nextError instanceof Error ? nextError.message : "The release action could not be completed.";
      try {
        setSnapshot(await service.load({ storeId, installationId, sourceRevision }));
      } catch {
        // Keep the last known snapshot alongside the original action failure.
      }
      setError(message);
    } finally {
      setBusy(null);
    }
  };

  return (
    <section className="mt-3 border-t border-border pt-3" aria-labelledby="adaptive-release-status-title">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 id="adaptive-release-status-title" className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
            Release review
          </h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Validation, review, and publication are separate steps.
          </p>
        </div>
        <Button variant="ghost" size="sm" onClick={() => void load("refresh")} disabled={Boolean(busy)}>
          <RefreshCw className={busy === "refresh" ? "animate-spin" : undefined} aria-hidden="true" /> Refresh
        </Button>
      </div>

      {busy === "load" && !snapshot ? (
        <div className="mt-3 flex items-center gap-2 border border-border bg-muted/20 p-3 text-sm text-muted-foreground" role="status">
          <CircleDashed className="animate-spin" size={17} aria-hidden="true" /> Loading the saved release state…
        </div>
      ) : null}
      {error ? (
        <p className="mt-3 border border-red-300 bg-red-50 p-3 text-sm text-red-950" role="alert">{error}</p>
      ) : null}
      {snapshot && state ? (
        <div className={`mt-3 border p-3 ${toneClass[state.tone]}`} aria-live="polite" data-release-state={state.key}>
          <div className="flex gap-3">
            <span className="mt-0.5"><StateIcon tone={state.tone} /></span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold">{state.title}</p>
              <p className="mt-1 text-xs leading-5 opacity-80">{state.description}</p>
              {state.key === "pending" && changeCount !== null ? (
                <div className="mt-2 text-xs">
                  <p className="font-medium">
                    {changeCount === 0 ? "No structural differences reported." : `${changeCount} structural change${changeCount === 1 ? "" : "s"} reported.`}
                  </p>
                  {changePaths.length ? (
                    <ul className="mt-2 list-disc space-y-1 pl-4" aria-label="Changed storefront paths">
                      {changePaths.slice(0, 6).map((path) => <li key={path} className="break-all">{path}</li>)}
                    </ul>
                  ) : null}
                  {changePaths.length > 6 ? <p className="mt-1 opacity-75">And {changePaths.length - 6} more.</p> : null}
                </div>
              ) : null}
              {state.key === "uncomparable" && blockedRoutes.length ? (
                <p className="mt-2 text-xs font-medium">Blocked routes: {blockedRoutes.join(", ")}</p>
              ) : null}
              <div className="mt-3 flex flex-wrap gap-2">
                {(state.key === "needs-validation" || state.key === "failed" || state.key === "not-current") ? (
                  <Button
                    onClick={() => void perform("validate", (current) => service.requestValidation(current))}
                    disabled={!canPublish || Boolean(busy) || hasUnsavedChanges}
                  >
                    {busy === "validate" ? "Validating…" : state.key === "failed" || state.key === "not-current" ? "Run validation again" : "Validate saved draft"}
                  </Button>
                ) : null}
                {state.key === "pending" ? (
                  <>
                    <DialogAction
                      trigger="Accept candidate"
                      title="Accept this validated candidate?"
                      description="This accepts the exact persisted candidate for this source revision. It does not publish or change the live storefront."
                      action="Accept candidate"
                      disabled={!canPublish || Boolean(busy)}
                      onConfirm={() => void perform("accept", (current) => service.review(current, "accept"))}
                    />
                    <DialogAction
                      trigger="Reject candidate"
                      title="Reject this candidate?"
                      description="Rejection is terminal for this exact candidate. The live storefront remains unchanged."
                      action="Reject candidate"
                      destructive
                      disabled={!canPublish || Boolean(busy)}
                      onConfirm={() => void perform("reject", (current) => service.review(current, "reject"))}
                    />
                  </>
                ) : null}
                {state.key === "accepted" ? (
                  <DialogAction
                    trigger={busy === "publish" ? "Publishing…" : "Publish reviewed candidate"}
                    title="Publish the reviewed storefront?"
                    description="This atomically activates the exact persisted candidate that passed validation and review. The server will reject a stale live revision."
                    action="Publish reviewed candidate"
                    disabled={!canPublish || Boolean(busy)}
                    onConfirm={() => void perform("publish", (current) => service.publish(current))}
                  />
                ) : null}
              </div>
            </div>
          </div>
        </div>
      ) : null}
      {!canPublish ? (
        <p className="mt-2 text-xs text-muted-foreground">
          Theme publish permission is required to validate, accept, reject, or publish. Theme edit permission remains separate.
        </p>
      ) : null}
    </section>
  );
};
