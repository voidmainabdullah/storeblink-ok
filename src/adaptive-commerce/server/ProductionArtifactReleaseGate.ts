import {
  componentAccessibilitySchema,
  runtimeArtifactSchema,
  STOREFRONT_RESOURCE_TYPES,
  type JsonValue,
  type RuntimeArtifact,
} from "../contracts";
import {
  artifactHashFor,
  STOREFRONT_COMPILER_STAGES,
  STOREFRONT_COMPILER_VERSION,
} from "../compiler";
import type { AdaptiveQaIssue } from "../qa";
import type {
  ArtifactReleaseGate,
  ArtifactReleaseGateResult,
  CanonicalCompileSource,
} from "./types";

const FORBIDDEN_CSS_PRIORITY = `${String.fromCharCode(33)}important`;

const record = (value: JsonValue): Record<string, JsonValue> | null =>
  value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, JsonValue>
    : null;

const blocker = (code: string, message: string): AdaptiveQaIssue => Object.freeze({
  code,
  severity: "blocker" as const,
  message,
});

const sameArray = (left: readonly unknown[], right: readonly unknown[]): boolean =>
  left.length === right.length && left.every((value, index) => value === right[index]);

const validateCompiledEntry = (
  artifact: RuntimeArtifact,
  value: JsonValue,
  location: string,
): AdaptiveQaIssue[] => {
  const issues: AdaptiveQaIssue[] = [];
  const entry = record(value);
  const layout = entry ? record(entry.layout ?? null) : null;
  if (
    !entry ||
    layout?.mode !== "certified-flow" ||
    layout.freeform !== false ||
    typeof layout.responsivePolicy !== "string" ||
    !layout.responsivePolicy
  ) {
    issues.push(blocker(
      "release.section.layout-uncertified",
      `${location} is not certified intrinsic flow.`,
    ));
  }

  if (!entry || !componentAccessibilitySchema.safeParse(entry.accessibility).success) {
    issues.push(blocker(
      "release.section.a11y-invalid",
      `${location} has no valid certified accessibility contract.`,
    ));
  }

  const component = entry ? record(entry.component ?? null) : null;
  const componentId = component?.id;
  const componentVersion = component?.version;
  if (
    typeof componentId !== "string" ||
    typeof componentVersion !== "string" ||
    typeof component?.variantId !== "string" ||
    artifact.componentVersions[componentId] !== componentVersion
  ) {
    issues.push(blocker(
      "release.section.component-pin-invalid",
      `${location} does not resolve to the artifact's certified component pin.`,
    ));
  }
  if (typeof entry?.path !== "string" || !entry.path) {
    issues.push(blocker(
      "release.section.path-invalid",
      `${location} has no semantic path.`,
    ));
  }
  return issues;
};

const validateRoute = (
  artifact: RuntimeArtifact,
  source: CanonicalCompileSource,
  resourceType: (typeof STOREFRONT_RESOURCE_TYPES)[number],
): AdaptiveQaIssue[] => {
  const issues: AdaptiveQaIssue[] = [];
  const document = record(artifact.routes[resourceType].document);
  if (!document) {
    return [blocker("release.route.document-invalid", `${resourceType} has no object document.`)];
  }
  const sections = document.sections;
  if (!Array.isArray(sections) || sections.length === 0) {
    issues.push(blocker(
      "release.route.sections-missing",
      `${resourceType} has no visible certified sections.`,
    ));
    return issues;
  }
  const layout = record(document.layout ?? null);
  if (
    layout?.model !== "intrinsic-certified-flow" ||
    layout.logicalProperties !== true ||
    layout.freeformCompatibilityIslands !== false
  ) {
    issues.push(blocker(
      "release.route.layout-uncertified",
      `${resourceType} is not compiled to logical intrinsic flow.`,
    ));
  }
  const responsive = record(document.responsive ?? null);
  if (
    responsive?.strategy !== "container-aware-intrinsic" ||
    responsive.directionModel !== "logical" ||
    responsive.narrowBehavior !== "stack-or-wrap" ||
    responsive.runtimeLayoutCompiler !== false
  ) {
    issues.push(blocker(
      "release.route.responsive-uncertified",
      `${resourceType} is missing the certified responsive contract.`,
    ));
  }
  if (
    document.resourceType !== resourceType ||
    document.locale !== source.storeDefinition.locale ||
    document.currency !== source.storeDefinition.currency
  ) {
    issues.push(blocker(
      "release.route.identity-mismatch",
      `${resourceType} does not match the canonical route locale and currency.`,
    ));
  }
  sections.forEach((section, index) => {
    issues.push(...validateCompiledEntry(
      artifact,
      section,
      `${resourceType} section ${index + 1}`,
    ));
  });

  const globalRegionPaths = document.globalRegionPaths;
  if (
    !Array.isArray(globalRegionPaths) ||
    globalRegionPaths.some((path) => typeof path !== "string") ||
    new Set(globalRegionPaths).size !== globalRegionPaths.length
  ) {
    issues.push(blocker(
      "release.route.global-paths-invalid",
      `${resourceType} has an invalid global-region path contract.`,
    ));
  } else {
    globalRegionPaths.forEach((path) => {
      if (!Object.prototype.hasOwnProperty.call(artifact.globals, path)) {
        issues.push(blocker(
          "release.route.global-missing",
          `${resourceType} references missing global region ${path}.`,
        ));
      }
    });
  }
  return issues;
};

/**
 * Final, pure policy check immediately before candidate persistence. Compiler
 * validation remains authoritative; this gate independently re-checks the
 * immutable release invariants most likely to be weakened by integration code.
 */
export class ProductionArtifactReleaseGate implements ArtifactReleaseGate {
  evaluate(input: Readonly<{
    artifact: RuntimeArtifact;
    source: CanonicalCompileSource;
  }>): ArtifactReleaseGateResult {
    const parsed = runtimeArtifactSchema.safeParse(input.artifact);
    if (!parsed.success) {
      return Object.freeze({
        passed: false,
        issues: Object.freeze([
          blocker("release.artifact.schema-invalid", "Runtime artifact schema validation failed."),
        ]),
      });
    }

    const artifact = parsed.data;
    const issues: AdaptiveQaIssue[] = [];
    const { artifactHash, ...artifactContent } = artifact;
    if (artifactHashFor(artifactContent) !== artifactHash) {
      issues.push(blocker("release.artifact.hash-invalid", "Runtime artifact integrity check failed."));
    }
    if (
      artifact.storeId !== input.source.storeDefinition.storeId ||
      artifact.installationId !== input.source.storeDefinition.installationId
    ) {
      issues.push(blocker(
        "release.artifact.identity-mismatch",
        "Runtime artifact does not belong to the canonical store installation.",
      ));
    }
    if (
      artifact.storeKit.id !== input.source.storeDefinition.storeKit.id ||
      artifact.storeKit.version !== input.source.storeDefinition.storeKit.version ||
      artifact.storeKit.integrity !== input.source.storeDefinition.storeKit.integrity
    ) {
      issues.push(blocker(
        "release.artifact.store-kit-mismatch",
        "Runtime artifact StoreKit pin differs from the canonical source.",
      ));
    }
    if (artifact.schemaVersion !== input.source.storeDefinition.schemaVersion) {
      issues.push(blocker(
        "release.artifact.schema-version-mismatch",
        "Runtime artifact schema version differs from the canonical source.",
      ));
    }
    if (artifact.compilerVersion !== STOREFRONT_COMPILER_VERSION) {
      issues.push(blocker(
        "release.artifact.compiler-version-mismatch",
        "Runtime artifact was not produced by the active trusted compiler version.",
      ));
    }
    if (artifact.diagnostics.some((diagnostic) => diagnostic.severity === "error")) {
      issues.push(blocker(
        "release.artifact.compiler-errors",
        "Runtime artifact contains compiler error diagnostics.",
      ));
    }
    if (
      artifact.extensions.executionModel !== "publish-time-batch" ||
      artifact.extensions.commerceBindingChannel !== "props-only"
    ) {
      issues.push(blocker(
        "release.artifact.execution-contract-invalid",
        "Runtime artifact execution or commerce-binding contract is invalid.",
      ));
    }
    const completedStages = artifact.extensions.compilerStages;
    if (
      !Array.isArray(completedStages) ||
      !sameArray(completedStages, STOREFRONT_COMPILER_STAGES)
    ) {
      issues.push(blocker(
        "release.artifact.compiler-stages-incomplete",
        "Runtime artifact did not complete the exact trusted compiler pipeline.",
      ));
    }
    const expectedPatchIds = [...input.source.merchantPatches]
      .sort((left, right) => left.sequence - right.sequence || left.id.localeCompare(right.id))
      .map((patch) => patch.id);
    const appliedPatchIds = artifact.extensions.appliedPatchIds;
    if (!Array.isArray(appliedPatchIds) || !sameArray(appliedPatchIds, expectedPatchIds)) {
      issues.push(blocker(
        "release.artifact.patch-set-mismatch",
        "Runtime artifact does not contain the canonical merchant patch set.",
      ));
    }
    if (artifact.extensions.effectiveBaseRevisionId !== input.source.storeDefinition.base.revisionId) {
      issues.push(blocker(
        "release.artifact.base-revision-mismatch",
        "Runtime artifact does not target the canonical base revision.",
      ));
    }

    const serialized = JSON.stringify(artifact);
    if (serialized.includes(FORBIDDEN_CSS_PRIORITY)) {
      issues.push(blocker(
        "release.artifact.forbidden-important",
        "Compiled output contains forbidden CSS priority styling.",
      ));
    }
    if (/(?:legacy|generic|route)[-_ ]?fallback/i.test(serialized)) {
      issues.push(blocker(
        "release.artifact.route-fallback",
        "Compiled output contains a legacy or generic route fallback marker.",
      ));
    }
    Object.entries(artifact.globals).forEach(([path, value]) => {
      const global = record(value);
      if (global?.path !== path) {
        issues.push(blocker(
          "release.global.path-mismatch",
          `Global region ${path} does not own its declared semantic path.`,
        ));
      }
      issues.push(...validateCompiledEntry(artifact, value, `global region ${path}`));
    });
    STOREFRONT_RESOURCE_TYPES.forEach((resourceType) => {
      issues.push(...validateRoute(artifact, input.source, resourceType));
    });

    const frozenIssues = Object.freeze(issues);
    return Object.freeze({
      passed: !frozenIssues.some((issue) => issue.severity === "blocker"),
      issues: frozenIssues,
    });
  }
}

export const productionArtifactReleaseGate = new ProductionArtifactReleaseGate();
