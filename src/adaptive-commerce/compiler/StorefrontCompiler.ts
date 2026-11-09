import type { RuntimeArtifactDiagnostic } from "@/adaptive-commerce";
import { STOREFRONT_RESOURCE_TYPES } from "../contracts/identifiers";
import { runtimeArtifactSchema } from "../contracts/runtimeArtifact";
import { cloneAndFreeze } from "./immutable";
import { runStorefrontCompilerPipeline, type StorefrontCompilerStageRunner } from "./pipeline";
import { artifactHashFor } from "./sha256";
import {
  migrationStage,
  schemaValidationStage,
  templateResolutionStage,
  tokenResolutionStage,
} from "./stages/inputStages";
import {
  accessibilityValidationStage,
  assetOptimizationStage,
  layoutResolutionStage,
  performanceValidationStage,
  responsiveCompilationStage,
} from "./stages/outputStages";
import {
  commerceBindingStage,
  slotResolutionStage,
} from "./stages/resolutionStages";
import { requireContext } from "./stages/stageSupport";
import {
  STOREFRONT_COMPILER_VERSION,
  type StorefrontCompilerContext,
  type StorefrontCompilerInput,
  type StorefrontCompilerResult,
} from "./types";
import type { CompilerDiagnostic } from "./diagnostics";

const stageRunners: readonly StorefrontCompilerStageRunner<StorefrontCompilerContext>[] = [
  { id: "schema-validation", run: schemaValidationStage },
  { id: "migration", run: migrationStage },
  { id: "token-resolution", run: tokenResolutionStage },
  { id: "template-resolution", run: templateResolutionStage },
  { id: "slot-resolution", run: slotResolutionStage },
  { id: "commerce-binding", run: commerceBindingStage },
  { id: "layout-resolution", run: layoutResolutionStage },
  { id: "responsive-compilation", run: responsiveCompilationStage },
  { id: "accessibility-validation", run: accessibilityValidationStage },
  { id: "asset-optimization", run: assetOptimizationStage },
  { id: "performance-validation", run: performanceValidationStage },
];

const artifactDiagnostic = (diagnostic: CompilerDiagnostic): RuntimeArtifactDiagnostic => ({
  code: diagnostic.code
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "compiler-diagnostic",
  severity: diagnostic.severity,
  message: diagnostic.message,
  path: diagnostic.semanticPath ?? null,
});

export class StorefrontCompiler {
  compile(input: StorefrontCompilerInput): StorefrontCompilerResult {
    const inputSnapshot = {
      registry: input.registry,
      storeDefinition: structuredClone(input.storeDefinition),
      merchantPatches: structuredClone(input.merchantPatches ?? []),
      assets: structuredClone(input.assets ?? []),
      ...(input.artifactId === undefined ? {} : { artifactId: input.artifactId }),
      createdAt: input.createdAt,
    };
    const pipeline = runStorefrontCompilerPipeline<StorefrontCompilerContext>({
      input: inputSnapshot,
      diagnostics: [],
      appliedPatchIds: [],
    }, stageRunners);
    const context = pipeline.context;
    const store = requireContext(context.storeDefinition, "performance-validation", "StoreDefinition");
    const resolved = requireContext(context.resolvedStoreKit, "performance-validation", "Resolved StoreKit");
    const routes = requireContext(context.routes, "performance-validation", "Resolved routes");
    const globals = requireContext(context.globals, "performance-validation", "Resolved globals");
    const resolvedTokens = requireContext(context.resolvedTokens, "performance-validation", "Resolved tokens");
    const componentVersions = requireContext(context.componentVersions, "performance-validation", "Component versions");
    const bindingPlans = requireContext(context.bindingPlans, "performance-validation", "Binding plans");
    const assets = requireContext(context.assets, "performance-validation", "Asset manifest");
    const sourceHash = artifactHashFor({
      storeDefinition: store,
      merchantPatches: context.input.merchantPatches,
      storeKit: resolved.storeKit,
      designPack: resolved.designPack,
      componentLibrary: resolved.componentLibrary,
      blueprints: STOREFRONT_RESOURCE_TYPES.map((resourceType) => resolved.blueprints[resourceType]),
      assets: context.input.assets,
    });
    const artifactContent = {
      kind: "runtime-artifact" as const,
      artifactVersion: 1 as const,
      id: context.input.artifactId ?? `artifact-${sourceHash.slice("sha256:".length, 31)}`,
      storeId: store.storeId,
      installationId: store.installationId,
      storeKit: structuredClone(store.storeKit),
      schemaVersion: store.schemaVersion,
      compilerVersion: STOREFRONT_COMPILER_VERSION,
      sourceHash,
      createdAt: context.input.createdAt,
      routes: structuredClone(routes),
      globals: structuredClone(globals),
      resolvedTokens: structuredClone(resolvedTokens),
      componentVersions: structuredClone(componentVersions),
      bindingPlans: structuredClone(bindingPlans),
      assets: structuredClone(assets),
      diagnostics: context.diagnostics.map(artifactDiagnostic),
      extensions: {
        executionModel: "publish-time-batch",
        compilerStages: [...pipeline.completedStages],
        appliedPatchIds: [...context.appliedPatchIds],
        effectiveBaseRevisionId: context.effectiveDocument?.revisionId ?? store.base.revisionId,
        commerceBindingChannel: "props-only",
      },
    };
    const artifact = runtimeArtifactSchema.parse({
      ...artifactContent,
      artifactHash: artifactHashFor(artifactContent),
    });
    return cloneAndFreeze({
      artifact,
      completedStages: [...pipeline.completedStages],
    }) as StorefrontCompilerResult;
  }
}

export const storefrontCompiler = new StorefrontCompiler();
