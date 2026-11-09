import type { StorefrontCompilerStage } from "@/adaptive-commerce/compiler/diagnostics";
import type { StorefrontResourceType } from "@/adaptive-commerce/contracts";
import type { ResponsivePrimitiveKind } from "@/adaptive-commerce/responsive";

export type ThemeStudioReportStatus = "ready" | "attention" | "blocked";
export type ThemeStudioDiagnosticSeverity = "info" | "warning" | "error";

export type ThemeStudioDiagnostic = Readonly<{
  code: string;
  severity: ThemeStudioDiagnosticSeverity;
  message: string;
  path: string | null;
  source: "registry" | "compiler";
}>;

export type ThemeStudioPackageSummary = Readonly<{
  kind: "store-kit" | "design-pack" | "component-library";
  name: string;
  id: string;
  version: string;
  integrity: string;
}>;

export type ThemeStudioRouteCoverage = Readonly<{
  resourceType: StorefrontResourceType;
  blueprintId: string;
  blueprintVersion: string;
  sectionCount: number;
  globalRegionCount: number;
  compiled: boolean;
}>;

export type ThemeStudioTokenSummary = Readonly<{
  total: number;
  primitive: number;
  semantic: number;
  component: number;
  literalCount: number;
  referenceCount: number;
  presetCount: number;
  schemaVersion: string;
}>;

export type ThemeStudioComponentSummary = Readonly<{
  componentCount: number;
  variantCount: number;
}>;

export type ThemeStudioCompilerSummary = Readonly<{
  status: "compiled" | "failed" | "not-run";
  version: string | null;
  completedStages: readonly StorefrontCompilerStage[];
  artifactHash: string | null;
  sourceHash: string | null;
}>;

export type ThemeStudioRuntimeSummary = Readonly<{
  status: "adaptive" | "legacy" | "missing" | "invalid" | "unavailable" | "not-checked";
  publicationId: string | null;
  publicationRevision: number | null;
  artifactHash: string | null;
  cohortBucket: number | null;
}>;

export type ThemeStudioDiagnosticsReport = Readonly<{
  scope: "built-in-certification-catalog";
  status: ThemeStudioReportStatus;
  installable: boolean;
  packages: readonly ThemeStudioPackageSummary[];
  routeCoverage: readonly ThemeStudioRouteCoverage[];
  tokens: ThemeStudioTokenSummary;
  components: ThemeStudioComponentSummary;
  primitiveKinds: readonly ResponsivePrimitiveKind[];
  compiler: ThemeStudioCompilerSummary;
  currentRuntime: ThemeStudioRuntimeSummary;
  diagnostics: readonly ThemeStudioDiagnostic[];
}>;
