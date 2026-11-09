export const STOREFRONT_COMPILER_STAGES = [
  "schema-validation",
  "migration",
  "token-resolution",
  "template-resolution",
  "slot-resolution",
  "commerce-binding",
  "layout-resolution",
  "responsive-compilation",
  "accessibility-validation",
  "asset-optimization",
  "performance-validation",
] as const;

export type StorefrontCompilerStage =
  (typeof STOREFRONT_COMPILER_STAGES)[number];

export type CompilerDiagnosticSeverity = "warning" | "error";

export type CompilerDiagnostic = Readonly<{
  code: string;
  severity: CompilerDiagnosticSeverity;
  stage: StorefrontCompilerStage;
  message: string;
  resourceType?: string;
  semanticPath?: string;
  componentType?: string;
}>;

export class StorefrontCompilationError extends Error {
  readonly code = "STOREFRONT_COMPILATION_FAILED";
  readonly diagnostics: readonly CompilerDiagnostic[];

  constructor(diagnostics: readonly CompilerDiagnostic[]) {
    const first = diagnostics.find((diagnostic) => diagnostic.severity === "error");
    super(first?.message ?? "Storefront compilation failed.");
    this.name = "StorefrontCompilationError";
    this.diagnostics = structuredClone(diagnostics);
  }
}

export const compilerError = (
  stage: StorefrontCompilerStage,
  code: string,
  message: string,
  context: Partial<
    Pick<CompilerDiagnostic, "resourceType" | "semanticPath" | "componentType">
  > = {},
): CompilerDiagnostic => ({
  stage,
  code,
  message,
  severity: "error",
  ...context,
});

export const compilerWarning = (
  stage: StorefrontCompilerStage,
  code: string,
  message: string,
  context: Partial<
    Pick<CompilerDiagnostic, "resourceType" | "semanticPath" | "componentType">
  > = {},
): CompilerDiagnostic => ({
  stage,
  code,
  message,
  severity: "warning",
  ...context,
});

export const throwForCompilerErrors = (
  diagnostics: readonly CompilerDiagnostic[],
): void => {
  if (diagnostics.some((diagnostic) => diagnostic.severity === "error")) {
    throw new StorefrontCompilationError(diagnostics);
  }
};

