import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import type {
  RevisionConflictRecord,
  StartupRecoveryCandidate,
} from "@/persistence/recovery";

export type EditorRecoveryDialogsProps = Readonly<{
  startupRecovery: StartupRecoveryCandidate | null;
  revisionConflict: RevisionConflictRecord | null;
  showDifferences: boolean;
  onToggleDifferences(): void;
  onRestore(): void;
  onDiscard(): void;
  onResolveConflict(resolution: "keep-local" | "use-server"): void;
}>;

const DialogFrame = ({
  labelledBy,
  children,
}: Readonly<{
  labelledBy: string;
  children: React.ReactNode;
}>) => (
  <div
    className="fixed inset-0 z-[100] grid place-items-center bg-black/70 p-4"
    role="dialog"
    aria-modal="true"
    aria-labelledby={labelledBy}
  >
    <section className="w-full max-w-md rounded-md border border-[#4a4a4a] bg-[#2c2c2c] p-5 shadow-2xl">
      {children}
    </section>
  </div>
);

export const EditorRecoveryDialogs = ({
  startupRecovery,
  revisionConflict,
  showDifferences,
  onToggleDifferences,
  onRestore,
  onDiscard,
  onResolveConflict,
}: EditorRecoveryDialogsProps) => {
  if (startupRecovery) {
    return (
      <DialogFrame labelledBy="startup-recovery-title">
        <div className="flex items-start gap-3">
          <AlertTriangle className="mt-0.5 shrink-0 text-amber-300" size={19} />
          <div>
            <h2 id="startup-recovery-title" className="text-sm font-semibold text-white">
              Unsaved work found
            </h2>
            <p className="mt-1 text-xs leading-5 text-[#bdbdbd]">
              A validated local draft from {new Date(startupRecovery.draft.savedAt).toLocaleString()} contains {startupRecovery.commandCount} unsaved {startupRecovery.commandCount === 1 ? "change" : "changes"}.
            </p>
            {startupRecovery.hasServerConflict ? (
              <p className="mt-2 rounded border border-amber-400/30 bg-amber-400/10 px-2 py-1.5 text-[11px] leading-4 text-amber-100">
                The server advanced from revision {startupRecovery.draft.baseServerRevision} to {startupRecovery.serverRevision}. Both copies are preserved.
              </p>
            ) : null}
          </div>
        </div>
        {showDifferences ? (
          <div className="mt-4 grid grid-cols-2 gap-2 rounded border border-[#454545] bg-[#232323] p-3 text-[11px] text-[#d0d0d0]">
            <span>Local nodes</span><strong className="text-right text-white">{startupRecovery.summary.localNodeCount}</strong>
            <span>Server nodes</span><strong className="text-right text-white">{startupRecovery.summary.serverNodeCount}</strong>
            <span>Node difference</span><strong className="text-right text-white">{startupRecovery.summary.nodeDelta}</strong>
            <span>Page difference</span><strong className="text-right text-white">{startupRecovery.summary.pageDelta}</strong>
          </div>
        ) : null}
        <div className="mt-5 flex flex-wrap justify-end gap-2">
          <Button
            type="button"
            variant="ghost"
            className="h-8 text-xs text-[#d4d4d4] hover:bg-white/10 hover:text-white"
            onClick={onToggleDifferences}
          >
            {showDifferences ? "Hide differences" : "Preview differences"}
          </Button>
          <Button
            type="button"
            variant="outline"
            className="h-8 border-[#555] bg-transparent text-xs text-white hover:bg-white/10"
            onClick={onDiscard}
          >
            Discard
          </Button>
          <Button
            type="button"
            className="h-8 bg-[#0178ff] text-xs text-white hover:bg-[#0b86df]"
            onClick={onRestore}
          >
            Restore
          </Button>
        </div>
      </DialogFrame>
    );
  }

  if (!revisionConflict) return null;
  return (
    <DialogFrame labelledBy="revision-conflict-title">
      <div className="flex items-start gap-3">
        <AlertTriangle className="mt-0.5 shrink-0 text-amber-300" size={19} />
        <div>
          <h2 id="revision-conflict-title" className="text-sm font-semibold text-white">
            Store changed in another session
          </h2>
          <p className="mt-1 text-xs leading-5 text-[#bdbdbd]">
            Your draft is based on revision {revisionConflict.localBaseRevision}, while the server is revision {revisionConflict.serverRevision}. Neither copy has been overwritten.
          </p>
        </div>
      </div>
      <div className="mt-4 rounded border border-[#454545] bg-[#232323] p-3 text-[11px] leading-5 text-[#cfcfcf]">
        Keep local opens your work as a separate unsaved draft. Load server discards the working copy only after the preserved conflict snapshot is recorded.
      </div>
      <div className="mt-5 flex justify-end gap-2">
        <Button
          type="button"
          variant="outline"
          className="h-8 border-[#555] bg-transparent text-xs text-white hover:bg-white/10"
          onClick={() => onResolveConflict("use-server")}
        >
          Load server
        </Button>
        <Button
          type="button"
          className="h-8 bg-[#0178ff] text-xs text-white hover:bg-[#0b86df]"
          onClick={() => onResolveConflict("keep-local")}
        >
          Keep local
        </Button>
      </div>
    </DialogFrame>
  );
};

