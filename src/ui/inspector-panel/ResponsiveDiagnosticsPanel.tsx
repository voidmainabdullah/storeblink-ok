import { useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EDITOR_SYSTEM_KEYS } from "@/engine/kernel/systemKeys";
import { useEngineContext } from "@/engine/kernel/useEngine";
import type {
  ResponsiveDiagnostic,
  ResponsiveDiagnosticsSystem,
} from "@/layout/diagnostics";
import type { ResponsiveBreakpoint } from "@/stores/responsive.store";
import type { SceneTree } from "@/types";
import { InspectorSection } from "./InspectorControls";

export const ResponsiveDiagnosticsPanel = ({
  scene,
  breakpoint,
  selectedNodeId,
  onApplyFix,
  onEditBreakpoint,
}: {
  scene: SceneTree;
  breakpoint: ResponsiveBreakpoint;
  selectedNodeId?: string;
  onApplyFix: (diagnostic: ResponsiveDiagnostic) => void;
  onEditBreakpoint: (breakpoint: ResponsiveBreakpoint) => void;
}) => {
  const engine = useEngineContext();
  const diagnostics = engine.resolveSystem<ResponsiveDiagnosticsSystem>(
    EDITOR_SYSTEM_KEYS.responsiveDiagnostics,
  );
  const [ignored, setIgnored] = useState<ReadonlySet<string>>(() => new Set());
  const [reviewingId, setReviewingId] = useState<string | null>(null);
  const report = useMemo(
    () => diagnostics.analyze(scene, { breakpoint }),
    [breakpoint, diagnostics, scene],
  );
  const visibleIssues = report.issues.filter((candidate) =>
    !ignored.has(candidate.id) && (!selectedNodeId || candidate.nodeId === selectedNodeId),
  );

  return (
    <InspectorSection
      title="Responsive diagnostics"
      defaultOpen={!selectedNodeId}
      actions={
        <span className="text-[9px] tabular-nums text-[#a6a6a6]">
          {visibleIssues.length}
        </span>
      }
    >
      {!visibleIssues.length ? (
        <div className="flex items-center gap-2 rounded bg-[#383838] px-2 py-2 text-[10px] text-[#cfcfcf]">
          <CheckCircle2 size={13} className="text-[#68d391]" />
          No advisory for this view
        </div>
      ) : visibleIssues.slice(0, 12).map((diagnostic) => (
        <div key={diagnostic.id} className="rounded border border-[#4a4a4a] bg-[#343434] p-2">
          <div className="flex items-start gap-2">
            <AlertTriangle size={13} className="mt-0.5 shrink-0 text-[#f6c453]" />
            <div className="min-w-0 text-[10px] leading-4 text-[#e5e5e5]">{diagnostic.message}</div>
          </div>
          <div className="mt-2 grid grid-cols-2 gap-1">
            {diagnostic.fix ? (
              <Button
                variant="outline"
                className="h-7 border-[#0178ff] bg-[#0178ff] px-2 text-[9px] text-white hover:bg-[#0b86ff]"
                onClick={() => onApplyFix(diagnostic)}
              >
                Fix automatically
              </Button>
            ) : null}
            <Button
              variant="outline"
              className="h-7 border-[#4a4a4a] bg-transparent px-2 text-[9px] text-white hover:bg-white/10"
              onClick={() => setReviewingId((current) => current === diagnostic.id ? null : diagnostic.id)}
            >
              Review suggested fix
            </Button>
            <Button
              variant="outline"
              className={`${diagnostic.fix ? "" : "col-span-2 "}h-7 border-[#4a4a4a] bg-transparent px-2 text-[9px] text-white hover:bg-white/10`}
              onClick={() => onEditBreakpoint(diagnostic.breakpoint)}
            >
              Edit breakpoint
            </Button>
            <Button
              variant="ghost"
              className="col-span-2 h-6 px-2 text-[9px] text-[#aaa] hover:bg-white/5 hover:text-white"
              onClick={() => setIgnored((current) => new Set([...current, diagnostic.id]))}
            >
              Ignore advisory
            </Button>
          </div>
          {reviewingId === diagnostic.id ? (
            <div className="mt-2 rounded bg-[#292929] px-2 py-1.5 text-[9px] leading-4 text-[#aaa]">
              {diagnostic.code} / {diagnostic.breakpoint} / {diagnostic.nodeId}
            </div>
          ) : null}
        </div>
      ))}
    </InspectorSection>
  );
};
