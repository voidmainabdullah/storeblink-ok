import type {
  CommerceBinding,
  JsonValue,
  StorefrontResourceType,
} from "@/adaptive-commerce";
import { STOREFRONT_RESOURCE_TYPES } from "../../contracts/identifiers";
import {
  parseSectionControlPath,
  routeSectionOrderSemanticPath,
  SECTION_CONTROL_KEYS,
  sectionControlSemanticPath,
} from "../../contracts/sectionControls";
import { CommerceBindingEngine } from "../../commerce";
import { canonicalJson } from "../canonicalJson";
import { resolveComponentReference } from "../componentResolution";
import {
  compilerError,
  throwForCompilerErrors,
  type CompilerDiagnostic,
} from "../diagnostics";
import type {
  ResolvedComponentReference,
  ResolvedRouteReferences,
  StorefrontCompilerContext,
} from "../types";
import { requireContext, withDiagnostics } from "./stageSupport";

export const slotResolutionStage = (
  context: StorefrontCompilerContext,
): StorefrontCompilerContext => {
  const resolved = requireContext(context.resolvedStoreKit, "slot-resolution", "Resolved StoreKit");
  const effectiveDocument = requireContext(
    context.effectiveDocument,
    "slot-resolution",
    "Effective storefront document",
  );
  const diagnostics: CompilerDiagnostic[] = [];
  const componentVersions: Record<string, string> = {};
  const globalSignatures = new Map<string, string>();
  const routeEntries = STOREFRONT_RESOURCE_TYPES.map((resourceType) => {
    const blueprint = resolved.blueprints[resourceType];
    if (!blueprint.sections.length) {
      diagnostics.push(compilerError(
        "slot-resolution",
        "route-sections-missing",
        `Blueprint ${blueprint.id} has no renderable sections.`,
        { resourceType },
      ));
    }
    const allPaths = new Set([
      ...blueprint.sections.map((section) => section.path),
      ...blueprint.globalRegions.map((region) => region.path),
    ]);
    blueprint.compositionPatches.forEach((patch) => {
      if (!allPaths.has(patch.target)) {
        diagnostics.push(compilerError(
          "slot-resolution",
          "composition-target-missing",
          `Composition patch target ${patch.target} is not declared by ${blueprint.id}.`,
          { resourceType, semanticPath: patch.target },
        ));
      }
    });
    const sectionByPath = new Map<string, typeof blueprint.sections[number]>(
      blueprint.sections.map((section) => [section.path, section]),
    );
    Object.entries(effectiveDocument.values).forEach(([path, value]) => {
      const control = parseSectionControlPath(path);
      if (!control || !control.sectionPath.startsWith(
        `${resourceType === "404" ? "not-found" : resourceType}.`,
      )) return;
      if (!sectionByPath.has(control.sectionPath)) {
        diagnostics.push(compilerError(
          "slot-resolution",
          "section-control-reference-missing",
          `Section control ${path} targets an unknown ${resourceType} section.`,
          { resourceType, semanticPath: path },
        ));
        return;
      }
      if (!SECTION_CONTROL_KEYS.includes(control.control as typeof SECTION_CONTROL_KEYS[number])) {
        diagnostics.push(compilerError(
          "slot-resolution",
          "section-control-unsupported",
          `Section control ${control.control} is not supported.`,
          { resourceType, semanticPath: path },
        ));
      } else if (control.control === "visible" && typeof value !== "boolean") {
        diagnostics.push(compilerError(
          "slot-resolution",
          "section-control-visible-invalid",
          `Section visibility ${path} must be boolean.`,
          { resourceType, semanticPath: path },
        ));
      } else if (control.control === "variant" && (typeof value !== "string" || !value)) {
        diagnostics.push(compilerError(
          "slot-resolution",
          "section-control-variant-invalid",
          `Section variant ${path} must be a non-empty certified variant id.`,
          { resourceType, semanticPath: path },
        ));
      }
    });
    let orderedSections = [...blueprint.sections];
    const sectionOrderPath = routeSectionOrderSemanticPath(resourceType);
    const sectionOrder = effectiveDocument.collections[sectionOrderPath];
    if (sectionOrder) {
      const expectedPaths = new Set<string>(blueprint.sections.map((section) => section.path));
      const actualPaths = new Set<string>(sectionOrder.order);
      const unknown = sectionOrder.order.filter((path) => !expectedPaths.has(path));
      const missing = [...expectedPaths].filter((path) => !actualPaths.has(path));
      if (
        actualPaths.size !== sectionOrder.order.length ||
        unknown.length > 0 ||
        missing.length > 0
      ) {
        diagnostics.push(compilerError(
          "slot-resolution",
          "section-order-invalid",
          `Section order ${sectionOrderPath} must contain every ${resourceType} section exactly once.`,
          { resourceType, semanticPath: sectionOrderPath },
        ));
      } else {
        orderedSections = sectionOrder.order.map((path) => sectionByPath.get(path) as typeof blueprint.sections[number]);
      }
    }
    const resolveReferences = (
      references: readonly (
        typeof blueprint.sections[number] | typeof blueprint.globalRegions[number]
      )[],
      applySectionControls = false,
    ): ResolvedComponentReference[] => references.flatMap((reference) => {
      const visibleValue = applySectionControls
        ? effectiveDocument.values[sectionControlSemanticPath(reference.path, "visible")]
        : undefined;
      if (visibleValue === false) return [];
      const variantValue = applySectionControls
        ? effectiveDocument.values[sectionControlSemanticPath(reference.path, "variant")]
        : undefined;
      const controlledReference = typeof variantValue === "string"
        ? { ...reference, variantId: variantValue }
        : reference;
      const component = resolved.componentLibrary.components[reference.componentId];
      const declaredProperties = new Set(
        component?.properties.map((property) => property.id) ?? [],
      );
      const semanticProperties = Object.fromEntries(
        Object.entries(effectiveDocument.values).flatMap(([path, value]) => {
          const prefix = `${reference.path}.`;
          if (!path.startsWith(prefix)) return [];
          const property = path.slice(prefix.length);
          // Nested semantic descendants remain source data for child slots;
          // only an exact declared component property can override a property.
          return property && !property.includes(".") && declaredProperties.has(property)
            ? [[property, structuredClone(value)] as const]
            : [];
        }),
      ) as Record<string, JsonValue>;
      const compositionProperties = Object.assign(
        {},
        ...blueprint.compositionPatches
          .filter((patch) => patch.target === reference.path)
          .map((patch) => patch.set),
        semanticProperties,
      ) as Record<string, JsonValue>;
      const result = resolveComponentReference(
        resourceType,
        controlledReference,
        resolved.componentLibrary,
        compositionProperties,
      );
      diagnostics.push(...result.diagnostics);
      if (!result.reference) return [];
      const priorVersion = componentVersions[result.reference.componentId];
      if (priorVersion && priorVersion !== result.reference.componentVersion) {
        diagnostics.push(compilerError(
          "slot-resolution",
          "component-version-conflict",
          `Component ${result.reference.componentId} resolves multiple versions.`,
          { resourceType, semanticPath: result.reference.path },
        ));
      }
      componentVersions[result.reference.componentId] = result.reference.componentVersion;
      return [result.reference];
    });
    const sections = resolveReferences(orderedSections, true);
    const globalRegions = resolveReferences(blueprint.globalRegions);
    if (!sections.length) {
      diagnostics.push(compilerError(
        "slot-resolution",
        "route-visible-sections-missing",
        `Section controls hide every renderable section in ${resourceType}.`,
        { resourceType, semanticPath: sectionOrderPath },
      ));
    }
    if (!sections.some((section) =>
      resolved.componentLibrary.components[section.componentId]?.a11y?.requiresHeading === true
    )) {
      diagnostics.push(compilerError(
        "slot-resolution",
        "route-heading-section-missing",
        `Section controls remove every certified heading section in ${resourceType}.`,
        { resourceType, semanticPath: sectionOrderPath },
      ));
    }
    globalRegions.forEach((region) => {
      const signature = canonicalJson(region);
      const prior = globalSignatures.get(region.path);
      if (prior && prior !== signature) {
        diagnostics.push(compilerError(
          "slot-resolution",
          "global-region-conflict",
          `Global region ${region.path} resolves differently across routes.`,
          { resourceType, semanticPath: region.path, componentType: region.componentId },
        ));
      }
      globalSignatures.set(region.path, signature);
    });
    return [resourceType, { sections, globalRegions }] as const;
  });
  const next = withDiagnostics(context, diagnostics);
  throwForCompilerErrors(next.diagnostics);
  return {
    ...next,
    resolvedReferences: Object.fromEntries(routeEntries) as unknown as Record<
      StorefrontResourceType,
      ResolvedRouteReferences
    >,
    componentVersions: Object.fromEntries(
      Object.entries(componentVersions).sort(([left], [right]) =>
        left < right ? -1 : left > right ? 1 : 0),
    ),
  };
};

export const commerceBindingStage = (
  context: StorefrontCompilerContext,
): StorefrontCompilerContext => {
  const resolved = requireContext(context.resolvedStoreKit, "commerce-binding", "Resolved StoreKit");
  const references = requireContext(context.resolvedReferences, "commerce-binding", "Resolved component references");
  const engine = new CommerceBindingEngine();
  const diagnostics: CompilerDiagnostic[] = [];
  const plans: CommerceBinding[] = [];
  const signatures = new Set<string>();
  const bindingSignatures = new Map<string, string>();
  const assignments = new Map<string, string>();
  const addBindings = (
    resourceType: StorefrontResourceType | "store",
    bindings: readonly CommerceBinding[],
    targets: readonly ResolvedComponentReference[],
  ): void => {
    const availableTargets = new Set(targets.map((target) => target.path));
    let compiled: CommerceBinding[];
    try {
      compiled = engine.compileAll(bindings, availableTargets);
    } catch (cause) {
      diagnostics.push(compilerError(
        "commerce-binding",
        "commerce-binding-invalid",
        cause instanceof Error ? cause.message : "Commerce binding compilation failed.",
        resourceType === "store" ? {} : { resourceType },
      ));
      return;
    }
    compiled.forEach((binding) => {
      const target = targets.find((reference) => reference.path === binding.target.path);
      if (!target?.bindingIds.includes(binding.id)) {
        diagnostics.push(compilerError(
          "commerce-binding",
          "commerce-binding-unassigned",
          `Binding ${binding.id} is not assigned to its target component ${binding.target.path}.`,
          resourceType === "store"
            ? { semanticPath: binding.target.path }
            : { resourceType, semanticPath: binding.target.path },
        ));
        return;
      }
      const signature = canonicalJson(binding);
      const priorBinding = bindingSignatures.get(binding.id);
      if (priorBinding && priorBinding !== signature) {
        diagnostics.push(compilerError(
          "commerce-binding",
          "commerce-binding-id-conflict",
          `Commerce binding id ${binding.id} resolves to multiple plans across the artifact.`,
          resourceType === "store"
            ? { semanticPath: binding.target.path }
            : { resourceType, semanticPath: binding.target.path },
        ));
        return;
      }
      bindingSignatures.set(binding.id, signature);
      const assignmentKey = `${binding.target.path}:${binding.target.property}`;
      const prior = assignments.get(assignmentKey);
      if (prior && prior !== signature) {
        diagnostics.push(compilerError(
          "commerce-binding",
          "commerce-binding-conflict",
          `Multiple bindings write ${binding.target.path}.${binding.target.property}.`,
          resourceType === "store"
            ? { semanticPath: binding.target.path }
            : { resourceType, semanticPath: binding.target.path },
        ));
        return;
      }
      assignments.set(assignmentKey, signature);
      if (!signatures.has(signature)) {
        signatures.add(signature);
        plans.push(binding);
      }
    });
  };
  STOREFRONT_RESOURCE_TYPES.forEach((resourceType) => {
    const routeReferences = references[resourceType];
    const availablePaths = new Set([
      ...routeReferences.sections,
      ...routeReferences.globalRegions,
    ].map((reference) => reference.path));
    const knownPaths = new Set([
      ...resolved.blueprints[resourceType].sections,
      ...resolved.blueprints[resourceType].globalRegions,
    ].map((reference) => reference.path));
    addBindings(
      resourceType,
      resolved.blueprints[resourceType].bindings.filter((binding) =>
        availablePaths.has(binding.target.path) || !knownPaths.has(binding.target.path)),
      [...routeReferences.sections, ...routeReferences.globalRegions],
    );
  });
  const allTargets = STOREFRONT_RESOURCE_TYPES.flatMap((resourceType) => [
    ...references[resourceType].sections,
    ...references[resourceType].globalRegions,
  ]);
  const allTargetPaths = new Set(allTargets.map((target) => target.path));
  const allKnownPaths = new Set(STOREFRONT_RESOURCE_TYPES.flatMap((resourceType) => [
    ...resolved.blueprints[resourceType].sections,
    ...resolved.blueprints[resourceType].globalRegions,
  ].map((reference) => reference.path)));
  addBindings(
    "store",
    (context.storeDefinition?.commerceBindings ?? []).filter((binding) =>
      allTargetPaths.has(binding.target.path) || !allKnownPaths.has(binding.target.path)),
    allTargets,
  );
  const next = withDiagnostics(context, diagnostics);
  throwForCompilerErrors(next.diagnostics);
  return { ...next, bindingPlans: plans };
};
