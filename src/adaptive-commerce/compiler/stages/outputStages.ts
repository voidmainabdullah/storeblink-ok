import type { JsonValue, RuntimeArtifact, StorefrontResourceType } from "@/adaptive-commerce";
import {
  STOREFRONT_RESOURCE_SEMANTIC_PREFIXES,
  STOREFRONT_RESOURCE_TYPES,
} from "../../contracts/identifiers";
import { runtimeRoutesSchema } from "../../contracts/runtimeArtifact";
import { compileAssetManifest } from "../assetManifest";
import { canonicalJson } from "../canonicalJson";
import { validateReferenceAccessibility } from "../componentResolution";
import {
  compilerError,
  compilerWarning,
  throwForCompilerErrors,
  type CompilerDiagnostic,
} from "../diagnostics";
import type { ResolvedComponentReference, StorefrontCompilerContext } from "../types";
import { fail, requireContext, withDiagnostics } from "./stageSupport";

const isJsonRecord = (value: JsonValue): value is Record<string, JsonValue> =>
  Boolean(value && typeof value === "object" && !Array.isArray(value));

const contentForRoute = (
  resourceType: StorefrontResourceType,
  context: StorefrontCompilerContext,
): JsonValue => {
  const document = requireContext(context.effectiveDocument, "layout-resolution", "Effective storefront document");
  const prefix = STOREFRONT_RESOURCE_SEMANTIC_PREFIXES[resourceType];
  const belongs = (path: string): boolean =>
    path.startsWith(`${prefix}.`) || path.startsWith("global.");
  return {
    revisionId: document.revisionId,
    values: Object.fromEntries(Object.entries(document.values).filter(([path]) => belongs(path))),
    collections: Object.fromEntries(Object.entries(document.collections).filter(([path]) => belongs(path))),
  };
};

const layoutReference = (reference: ResolvedComponentReference): JsonValue => ({
  path: reference.path,
  ...(reference.regionSlot ? { regionSlot: reference.regionSlot } : {}),
  component: {
    id: reference.componentId,
    version: reference.componentVersion,
    variantId: reference.variantId,
  },
  properties: Object.fromEntries(
    Object.entries(reference.properties).map(([key, value]) => [key, structuredClone(value)]),
  ),
  slots: reference.slots.map((slot) => ({
    slotId: slot.slotId,
    value: structuredClone(slot.value),
  })),
  bindingIds: [...reference.bindingIds],
  accessibility: structuredClone(reference.accessibility),
  layout: {
    mode: "certified-flow",
    responsivePolicy: reference.responsivePolicy,
    freeform: false,
  },
});

export const layoutResolutionStage = (
  context: StorefrontCompilerContext,
): StorefrontCompilerContext => {
  const store = requireContext(context.storeDefinition, "layout-resolution", "StoreDefinition");
  const resolved = requireContext(context.resolvedStoreKit, "layout-resolution", "Resolved StoreKit");
  const references = requireContext(context.resolvedReferences, "layout-resolution", "Resolved component references");
  const globals: RuntimeArtifact["globals"] = {};
  const routeEntries = STOREFRONT_RESOURCE_TYPES.map((resourceType) => {
    const routeReferences = references[resourceType];
    routeReferences.globalRegions.forEach((region) => {
      globals[region.path] ??= layoutReference(region);
    });
    const document: JsonValue = {
      schemaVersion: 1,
      resourceType,
      locale: store.locale,
      currency: store.currency,
      sections: routeReferences.sections.map(layoutReference),
      globalRegionPaths: routeReferences.globalRegions.map((region) => region.path),
      content: contentForRoute(resourceType, context),
      layout: {
        model: "intrinsic-certified-flow",
        logicalProperties: true,
        freeformCompatibilityIslands: false,
      },
    };
    return [resourceType, {
      resourceType,
      blueprint: {
        id: resolved.blueprints[resourceType].id,
        version: resolved.blueprints[resourceType].version,
        integrity: resolved.blueprints[resourceType].integrity,
      },
      document,
    }] as const;
  });
  return {
    ...context,
    routes: runtimeRoutesSchema.parse(Object.fromEntries(routeEntries)),
    globals,
  };
};

export const responsiveCompilationStage = (
  context: StorefrontCompilerContext,
): StorefrontCompilerContext => {
  const routes = requireContext(context.routes, "responsive-compilation", "Resolved routes");
  const routeEntries = STOREFRONT_RESOURCE_TYPES.map((resourceType) => {
    const route = routes[resourceType];
    const document = route.document;
    if (!isJsonRecord(document)) {
      fail("responsive-compilation", "route-document-invalid", `Route ${resourceType} document must be an object.`);
    }
    return [resourceType, {
      ...route,
      document: Object.fromEntries([
        ...Object.entries(document).map(([key, value]) => [
          key,
          structuredClone(value),
        ] as const),
        ["responsive", {
          strategy: "container-aware-intrinsic",
          directionModel: "logical",
          narrowBehavior: "stack-or-wrap",
          runtimeLayoutCompiler: false,
        }],
      ]),
    }] as const;
  });
  return {
    ...context,
    routes: runtimeRoutesSchema.parse(Object.fromEntries(routeEntries)),
  };
};

export const accessibilityValidationStage = (
  context: StorefrontCompilerContext,
): StorefrontCompilerContext => {
  const resolved = requireContext(context.resolvedStoreKit, "accessibility-validation", "Resolved StoreKit");
  const references = requireContext(context.resolvedReferences, "accessibility-validation", "Resolved component references");
  const diagnostics = STOREFRONT_RESOURCE_TYPES.flatMap((resourceType) => [
    ...references[resourceType].sections,
    ...references[resourceType].globalRegions,
  ].flatMap((reference) => validateReferenceAccessibility(
    resourceType,
    reference,
    resolved.componentLibrary.components[reference.componentId],
  )));
  const next = withDiagnostics(context, diagnostics);
  throwForCompilerErrors(next.diagnostics);
  return next;
};

export const assetOptimizationStage = (
  context: StorefrontCompilerContext,
): StorefrontCompilerContext => {
  const routes = requireContext(context.routes, "asset-optimization", "Resolved routes");
  const globals = requireContext(context.globals, "asset-optimization", "Resolved globals");
  try {
    const assets = compileAssetManifest(
      context.input.assets,
      [
        ...STOREFRONT_RESOURCE_TYPES.map((resourceType) => routes[resourceType].document),
        ...Object.values(globals),
      ],
    );
    return { ...context, assets };
  } catch (cause) {
    fail(
      "asset-optimization",
      "asset-manifest-invalid",
      cause instanceof Error ? cause.message : "The asset manifest is invalid.",
    );
  }
};

export const performanceValidationStage = (
  context: StorefrontCompilerContext,
): StorefrontCompilerContext => {
  const routes = requireContext(context.routes, "performance-validation", "Resolved routes");
  const diagnostics: CompilerDiagnostic[] = [];
  STOREFRONT_RESOURCE_TYPES.forEach((resourceType) => {
    const route = routes[resourceType];
    if (!route) {
      diagnostics.push(compilerError(
        "performance-validation",
        "runtime-route-missing",
        `Compiled artifact is missing route ${resourceType}.`,
        { resourceType },
      ));
      return;
    }
    if (!isJsonRecord(route.document)) {
      diagnostics.push(compilerError(
        "performance-validation",
        "runtime-route-document-invalid",
        `Compiled route ${resourceType} is not an object document.`,
        { resourceType },
      ));
      return;
    }
    const sectionCount = Array.isArray(route.document.sections)
      ? route.document.sections.length
      : 0;
    if (sectionCount > 64) {
      diagnostics.push(compilerError(
        "performance-validation",
        "route-section-budget-exceeded",
        `Route ${resourceType} contains ${sectionCount} sections; maximum is 64.`,
        { resourceType },
      ));
    }
    if (canonicalJson(route.document).length > 250_000) {
      diagnostics.push(compilerError(
        "performance-validation",
        "route-payload-budget-exceeded",
        `Route ${resourceType} exceeds the 250 KB uncompressed IR budget.`,
        { resourceType },
      ));
    }
  });
  if ((context.bindingPlans?.length ?? 0) > 256) {
    diagnostics.push(compilerError(
      "performance-validation",
      "binding-plan-budget-exceeded",
      "The compiled artifact exceeds the 256 binding-plan budget.",
    ));
  }
  if ((context.assets?.length ?? 0) > 256) {
    diagnostics.push(compilerWarning(
      "performance-validation",
      "asset-count-high",
      "The compiled artifact contains more than 256 assets.",
    ));
  }
  const next = withDiagnostics(context, diagnostics);
  throwForCompilerErrors(next.diagnostics);
  return next;
};
