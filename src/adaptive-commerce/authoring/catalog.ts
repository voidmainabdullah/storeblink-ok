import type {
  BlueprintSectionReference,
  ComponentVariantDefinition,
  DesignPack,
  DesignTokenLiteral,
  StorefrontResourceType,
  SemanticStorefrontDocument,
} from "@/adaptive-commerce/contracts";
import {
  routeSectionOrderSemanticPath,
  sectionControlSemanticPath,
  STOREFRONT_RESOURCE_TYPES,
} from "@/adaptive-commerce/contracts";
import type { AdaptiveAuthoringCatalog } from "./types";

export type CertifiedSectionPolicy = Readonly<{
  reference: BlueprintSectionReference;
  componentName: string;
  variants: readonly ComponentVariantDefinition[];
  slotLabels: readonly string[];
  responsivePolicy: string;
  allowVariantChange: boolean;
  allowSlotReorder: boolean;
}>;

export type CertifiedPropertyControl = Readonly<{
  path: string;
  label: string;
  valueType: "string" | "number" | "boolean" | "rich-text" | "color";
}>;

export const certifiedSectionsForRoute = (
  catalog: AdaptiveAuthoringCatalog,
  route: StorefrontResourceType,
): readonly CertifiedSectionPolicy[] => {
  const blueprint = catalog.blueprints.find((candidate) => candidate.resourceType === route);
  if (!blueprint) return [];
  return blueprint.sections.flatMap((reference) => {
    const component = catalog.componentLibrary.components[reference.componentId];
    if (!component) return [];
    return [{
      reference,
      componentName: component.name,
      variants: component.variants,
      slotLabels: component.slots.map((slot) => slot.id),
      responsivePolicy: component.responsivePolicy,
      allowVariantChange: component.customization.allowVariantChange,
      allowSlotReorder: component.customization.allowSlotReorder,
    }];
  });
};

export const certifiedPropertyControlsForRoute = (
  catalog: AdaptiveAuthoringCatalog,
  route: StorefrontResourceType,
): readonly CertifiedPropertyControl[] => {
  const blueprint = catalog.blueprints.find((candidate) => candidate.resourceType === route);
  if (!blueprint) return [];
  return blueprint.sections.flatMap((section) => {
    const component = catalog.componentLibrary.components[section.componentId];
    if (!component) return [];
    const editable = new Set(component.customization.editableProperties);
    return component.properties.flatMap((property): CertifiedPropertyControl[] => {
      if (!editable.has(property.id) || ![
        "string", "number", "boolean", "rich-text", "color",
      ].includes(property.valueType)) return [];
      return [{
        path: `${section.path}.${property.id}`,
        label: property.label,
        valueType: property.valueType as CertifiedPropertyControl["valueType"],
      }];
    });
  });
};

/** Mirrors the compiler's fail-closed visible-section invariant without
 * pretending to run the compiler inside the browser authoring surface. */
export const routesWithoutVisibleSections = (
  catalog: AdaptiveAuthoringCatalog,
  document: SemanticStorefrontDocument,
): readonly StorefrontResourceType[] => STOREFRONT_RESOURCE_TYPES.filter((route) => {
  const blueprint = catalog.blueprints.find((candidate) => candidate.resourceType === route);
  if (!blueprint) return true;
  const order = document.collections[routeSectionOrderSemanticPath(route)]?.order
    ?? blueprint.sections.map((section) => section.path);
  const knownSections = new Map<string, (typeof blueprint.sections)[number]>(
    blueprint.sections.map((section) => [section.path, section]),
  );
  return !order.some((path) => {
    const section = knownSections.get(path);
    return section && document.values[sectionControlSemanticPath(section.path, "visible")] !== false;
  });
});

const literalKey = (value: DesignTokenLiteral): string => JSON.stringify(value);

export type CertifiedTokenChoice = Readonly<{
  address: string;
  label: string;
  values: readonly DesignTokenLiteral[];
}>;

/** Only DesignPack-declared literal values are offered. This keeps the merchant
 * surface out of raw token generation while still allowing certified font and
 * palette choices. */
export const certifiedTokenChoices = (designPack: DesignPack): readonly CertifiedTokenChoice[] => {
  const values = new Map<string, Map<string, DesignTokenLiteral>>();
  const add = (address: string, value: DesignTokenLiteral) => {
    const entry = values.get(address) ?? new Map<string, DesignTokenLiteral>();
    entry.set(literalKey(value), value);
    values.set(address, entry);
  };
  designPack.presets.forEach((preset) => preset.overrides.forEach((override) =>
    add(override.address, override.value)));
  (["semantic", "component"] as const).forEach((tier) => {
    Object.entries(designPack.tokens[tier]).forEach(([path, token]) => {
      if ("$value" in token) add(`${tier}:${path}`, token);
    });
  });
  return [...values.entries()]
    .filter(([, choices]) => choices.size > 1)
    .map(([address, choices]) => ({
      address,
      label: address.split(":").at(-1)!.split(".").join(" "),
      values: [...choices.values()],
    }))
    .sort((left, right) => left.address.localeCompare(right.address));
};
