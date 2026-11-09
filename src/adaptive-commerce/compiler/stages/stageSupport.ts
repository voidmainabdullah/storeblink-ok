import type { VersionedPackageRef } from "@/adaptive-commerce";
import {
  compilerError,
  StorefrontCompilationError,
  type CompilerDiagnostic,
  type StorefrontCompilerStage,
} from "../diagnostics";
import type { StorefrontCompilerContext } from "../types";

export const sameReference = (
  left: VersionedPackageRef,
  right: VersionedPackageRef,
): boolean => left.id === right.id &&
  left.version === right.version &&
  left.integrity === right.integrity;

export const fail = (
  stage: StorefrontCompilerStage,
  code: string,
  message: string,
): never => {
  throw new StorefrontCompilationError([compilerError(stage, code, message)]);
};

export const requireContext = <T>(
  value: T | undefined,
  stage: StorefrontCompilerStage,
  label: string,
): T => value ?? fail(stage, "compiler-context-missing", `${label} is unavailable.`);

export const withDiagnostics = (
  context: StorefrontCompilerContext,
  diagnostics: readonly CompilerDiagnostic[],
): StorefrontCompilerContext => ({
  ...context,
  diagnostics: [...context.diagnostics, ...diagnostics],
});
