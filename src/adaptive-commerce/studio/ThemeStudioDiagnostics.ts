import {
  StorefrontCompilationError,
  cloneAndFreeze,
  storefrontCompiler,
  type StorefrontCompilerInput,
  type StorefrontCompilerResult,
} from "@/adaptive-commerce/compiler";
import { STOREFRONT_RESOURCE_TYPES, type StorefrontResourceType } from "@/adaptive-commerce/contracts";
import {
  createBuiltInAdaptiveCommerceCatalog,
  type BuiltInAdaptiveCommerceCatalog,
} from "@/adaptive-commerce/fixtures";
import { RESPONSIVE_PRIMITIVE_KINDS } from "@/adaptive-commerce/responsive";
import { runtimeArtifactResolver } from "@/adaptive-commerce/runtime";
import type { StorefrontRuntimeAssignment } from "@/adaptive-commerce/runtime/types";
import type {
  ThemeStudioDiagnostic,
  ThemeStudioDiagnosticsReport,
  ThemeStudioRuntimeSummary,
} from "./types";

const DIAGNOSTIC_CREATED_AT = "2026-01-01T00:00:00.000Z";

export type ThemeStudioRuntimeResolver = Readonly<{
  resolve(handle: string): Promise<StorefrontRuntimeAssignment>;
}>;

export type ThemeStudioDiagnosticsDependencies = Readonly<{
  createCatalog?: () => BuiltInAdaptiveCommerceCatalog;
  compile?: (input: StorefrontCompilerInput) => StorefrontCompilerResult;
  runtimeResolver?: ThemeStudioRuntimeResolver;
}>;

export type LoadThemeStudioDiagnosticsInput = Readonly<{
  storeHandle?: string | null;
  dependencies?: ThemeStudioDiagnosticsDependencies;
}>;

const runtimeSummary = (
  assignment: StorefrontRuntimeAssignment | null,
): ThemeStudioRuntimeSummary => {
  if (!assignment) {
    return {
      status: "not-checked",
      publicationId: null,
      publicationRevision: null,
      artifactHash: null,
      cohortBucket: null,
    };
  }
  if (assignment.runtime === "adaptive") {
    return {
      status: "adaptive",
      publicationId: assignment.publicationId,
      publicationRevision: assignment.publicationRevision,
      artifactHash: assignment.artifactHash,
      cohortBucket: assignment.cohortBucket,
    };
  }
  return {
    status: assignment.reason === "assigned" ? "legacy" : assignment.reason,
    publicationId: assignment.publicationId ?? null,
    publicationRevision: null,
    artifactHash: null,
    cohortBucket: assignment.cohortBucket ?? null,
  };
};

const compilerDiagnostics = (error: unknown): ThemeStudioDiagnostic[] => {
  if (error instanceof StorefrontCompilationError) {
    return error.diagnostics.map((diagnostic) => ({
      code: diagnostic.code,
      severity: diagnostic.severity,
      message: diagnostic.message,
      path: diagnostic.semanticPath ?? diagnostic.resourceType ?? null,
      source: "compiler",
    }));
  }
  return [{
    code: "compiler.unavailable",
    severity: "error",
    message: error instanceof Error ? error.message : "The certification compile could not run.",
    path: null,
    source: "compiler",
  }];
};

const safeRuntime = async (
  handle: string | null | undefined,
  resolver: ThemeStudioRuntimeResolver,
): Promise<ThemeStudioRuntimeSummary> => {
  if (!handle?.trim()) return runtimeSummary(null);
  try {
    return runtimeSummary(await resolver.resolve(handle));
  } catch {
    return runtimeSummary({ runtime: "legacy", reason: "unavailable" });
  }
};

export const loadThemeStudioDiagnostics = async ({
  storeHandle,
  dependencies = {},
}: LoadThemeStudioDiagnosticsInput = {}): Promise<ThemeStudioDiagnosticsReport> => {
  const catalog = (dependencies.createCatalog ?? createBuiltInAdaptiveCommerceCatalog)();
  const compile = dependencies.compile ?? ((input) => storefrontCompiler.compile(input));
  const installability = catalog.registry.validateInstallable(
    catalog.storeKit.id,
    catalog.storeKit.version,
  );
  const diagnostics: ThemeStudioDiagnostic[] = installability.issues.map((issue) => ({
    code: issue.code,
    severity: "error",
    message: issue.message,
    path: issue.path ?? null,
    source: "registry",
  }));
  let result: StorefrontCompilerResult | null = null;
  if (installability.valid) {
    try {
      result = compile({
        registry: catalog.registry,
        storeDefinition: catalog.storeDefinition,
        createdAt: DIAGNOSTIC_CREATED_AT,
        artifactId: "theme-studio-diagnostic",
      });
      diagnostics.push(...result.artifact.diagnostics.map((diagnostic) => ({
        code: diagnostic.code,
        severity: diagnostic.severity,
        message: diagnostic.message,
        path: diagnostic.path,
        source: "compiler" as const,
      })));
    } catch (error) {
      diagnostics.push(...compilerDiagnostics(error));
    }
  }

  const tokenTiers = catalog.designPack.tokens;
  const tokenEntries = Object.values(tokenTiers).flatMap((tier) => Object.values(tier));
  const components = Object.values(catalog.componentLibrary.components);
  const blueprintByRoute = new Map<StorefrontResourceType, typeof catalog.blueprints[number]>(
    catalog.blueprints.map((blueprint) => [blueprint.resourceType, blueprint]),
  );
  const hasErrors = diagnostics.some((diagnostic) => diagnostic.severity === "error");
  const hasWarnings = diagnostics.some((diagnostic) => diagnostic.severity === "warning");
  const currentRuntime = await safeRuntime(
    storeHandle,
    dependencies.runtimeResolver ?? runtimeArtifactResolver,
  );

  return cloneAndFreeze({
    scope: "built-in-certification-catalog",
    status: hasErrors || !result ? "blocked" : hasWarnings ? "attention" : "ready",
    installable: installability.valid,
    packages: [
      catalog.storeKit,
      catalog.designPack,
      catalog.componentLibrary,
    ].map((entry) => ({
      kind: entry.kind,
      name: entry.name,
      id: entry.id,
      version: entry.version,
      integrity: entry.integrity,
    })),
    routeCoverage: STOREFRONT_RESOURCE_TYPES.map((resourceType) => {
      const blueprint = blueprintByRoute.get(resourceType);
      return {
        resourceType,
        blueprintId: blueprint?.id ?? "unregistered",
        blueprintVersion: blueprint?.version ?? "unregistered",
        sectionCount: blueprint?.sections.length ?? 0,
        globalRegionCount: blueprint?.globalRegions.length ?? 0,
        compiled: result?.artifact.routes[resourceType]?.resourceType === resourceType,
      };
    }),
    tokens: {
      total: tokenEntries.length,
      primitive: Object.keys(tokenTiers.primitive).length,
      semantic: Object.keys(tokenTiers.semantic).length,
      component: Object.keys(tokenTiers.component).length,
      literalCount: tokenEntries.filter((entry) => "$type" in entry).length,
      referenceCount: tokenEntries.filter((entry) => "$ref" in entry).length,
      presetCount: catalog.designPack.presets.length,
      schemaVersion: catalog.designPack.tokenSchemaVersion,
    },
    components: {
      componentCount: components.length,
      variantCount: components.reduce((total, component) => total + component.variants.length, 0),
    },
    primitiveKinds: [...RESPONSIVE_PRIMITIVE_KINDS],
    compiler: {
      status: result ? "compiled" : installability.valid ? "failed" : "not-run",
      version: result?.artifact.compilerVersion ?? null,
      completedStages: result?.completedStages ?? [],
      artifactHash: result?.artifact.artifactHash ?? null,
      sourceHash: result?.artifact.sourceHash ?? null,
    },
    currentRuntime,
    diagnostics,
  }) as ThemeStudioDiagnosticsReport;
};
