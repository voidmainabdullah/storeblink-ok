import type { ResponsiveBreakpoint } from "@/stores/responsive.store";
import type { LayoutData, NodeId, SceneTree, TransformData } from "@/types";

export type ResponsiveDiagnosticCode =
  | "horizontal-overflow"
  | "clipped-content"
  | "oversized-typography"
  | "unreadable-typography"
  | "fixed-height-content-loss"
  | "header-collision"
  | "grid-card-under-minimum"
  | "invalid-touch-target"
  | "invisible-critical-control";

export type ResponsiveDiagnosticActionKind =
  | "auto-fix"
  | "review"
  | "edit-breakpoint"
  | "ignore";

export type ResponsiveDiagnosticAction = {
  kind: ResponsiveDiagnosticActionKind;
  label: string;
};

export type ResponsiveDiagnosticFix = {
  targetNodeId: NodeId;
  transform?: Partial<TransformData>;
  props?: Record<string, unknown>;
  meta?: { hidden?: boolean };
  layout?: Partial<LayoutData>;
};

export type ResponsiveDiagnostic = {
  id: string;
  code: ResponsiveDiagnosticCode;
  severity: "advisory";
  breakpoint: ResponsiveBreakpoint;
  nodeId: NodeId;
  parentId: NodeId | null;
  message: string;
  actions: readonly ResponsiveDiagnosticAction[];
  fix?: ResponsiveDiagnosticFix;
};

export type ResponsiveDiagnosticReport = {
  breakpoint: ResponsiveBreakpoint;
  viewportWidth: number;
  resolvedScene: SceneTree;
  issues: readonly ResponsiveDiagnostic[];
};

export interface ResponsiveDiagnosticsSystemAPI {
  analyze(
    scene: SceneTree,
    options: { breakpoint: ResponsiveBreakpoint; viewportWidth?: number },
  ): ResponsiveDiagnosticReport;
  applyFix(scene: SceneTree, issue: ResponsiveDiagnostic): SceneTree;
}
