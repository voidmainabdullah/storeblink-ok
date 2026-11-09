import {
  routeSectionOrderSemanticPath,
  sectionControlSemanticPath,
  STOREFRONT_RESOURCE_TYPES,
  type StorefrontResourceType,
  type TemplateBlueprint,
} from "@/adaptive-commerce/contracts";
import { seedStorefrontSectionControls } from "@/adaptive-commerce/compiler";
import type { AdaptiveAuthoringSource } from "./types";

const blueprintRecord = (
  source: AdaptiveAuthoringSource,
): Readonly<Record<StorefrontResourceType, Pick<TemplateBlueprint, "sections">>> =>
  Object.fromEntries(source.catalog.blueprints.map((blueprint) => [
    blueprint.resourceType,
    { sections: blueprint.sections },
  ])) as Readonly<Record<StorefrontResourceType, Pick<TemplateBlueprint, "sections">>>;

export type AdaptiveSectionControlReadiness = Readonly<{
  ready: boolean;
  missingPaths: readonly string[];
  invalidPaths: readonly string[];
}>;

export const adaptiveSectionControlReadiness = (
  source: AdaptiveAuthoringSource,
): AdaptiveSectionControlReadiness => {
  const invalidPaths: string[] = [];
  const missingPaths = STOREFRONT_RESOURCE_TYPES.flatMap((resourceType) => {
    const blueprint = source.catalog.blueprints.find((entry) => entry.resourceType === resourceType);
    if (!blueprint) return [`catalog.${resourceType}`];
    const orderPath = routeSectionOrderSemanticPath(resourceType);
    const orderCollection = source.storeDefinition.base.collections[orderPath];
    const paths = orderCollection ? [] : [orderPath as string];
    const expectedOrder = new Set<string>(blueprint.sections.map((section) => section.path));
    if (orderCollection && (
      orderCollection.order.length !== expectedOrder.size ||
      orderCollection.order.some((path) => !expectedOrder.has(path))
    )) invalidPaths.push(orderPath);
    blueprint.sections.forEach((section) => {
      const variantPath = sectionControlSemanticPath(section.path, "variant");
      const visibilityPath = sectionControlSemanticPath(section.path, "visible");
      if (!(variantPath in source.storeDefinition.base.values)) paths.push(variantPath);
      else {
        const component = source.catalog.componentLibrary.components[section.componentId];
        const value = source.storeDefinition.base.values[variantPath];
        if (typeof value !== "string" || !component?.variants.some((variant) => variant.id === value)) {
          invalidPaths.push(variantPath);
        }
      }
      if (!(visibilityPath in source.storeDefinition.base.values)) paths.push(visibilityPath);
      else if (typeof source.storeDefinition.base.values[visibilityPath] !== "boolean") {
        invalidPaths.push(visibilityPath);
      }
    });
    return paths;
  });
  return {
    ready: missingPaths.length === 0 && invalidPaths.length === 0,
    missingPaths,
    invalidPaths,
  };
};

/** Runs the canonical compiler seeder only when the persisted base already
 * owns the complete control contract. Older installations remain read-only
 * until a server migration seeds their base revision; the browser never
 * invents writable paths the save RPC cannot validate. */
export const prepareAdaptiveAuthoringSource = (
  source: AdaptiveAuthoringSource,
): AdaptiveAuthoringSource => {
  if (!adaptiveSectionControlReadiness(source).ready) return source;
  const base = seedStorefrontSectionControls(source.storeDefinition.base, blueprintRecord(source));
  return {
    ...source,
    storeDefinition: { ...source.storeDefinition, base },
  };
};
