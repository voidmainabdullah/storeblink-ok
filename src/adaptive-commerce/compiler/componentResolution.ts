import type {
  AdaptiveComponentDefinition,
  AdaptiveComponentLibrary,
  JsonValue,
  StorefrontResourceType,
} from "@/adaptive-commerce";
import { compilerError, type CompilerDiagnostic } from "./diagnostics";
import type { AnyBlueprintReference, ResolvedComponentReference } from "./types";

const own = (value: object, key: string): boolean =>
  Object.prototype.hasOwnProperty.call(value, key);

const itemCount = (value: JsonValue): number =>
  Array.isArray(value) ? value.length : 1;

const nonEmptyAccessibleValue = (value: JsonValue | undefined): boolean =>
  typeof value === "string" ? value.trim().length > 0 : value !== undefined && value !== null;

const containsAltText = (value: JsonValue): boolean => {
  if (Array.isArray(value)) return value.length > 0 && value.every(containsAltText);
  if (!value || typeof value !== "object") return false;
  const record = value as Record<string, JsonValue>;
  if (typeof record.alt === "string") return record.alt.trim().length > 0;
  return Object.values(record).some(containsAltText);
};

const referenceContext = (
  resourceType: StorefrontResourceType,
  reference: AnyBlueprintReference,
) => ({
  resourceType,
  semanticPath: reference.path,
  componentType: reference.componentId,
});

export const resolveComponentReference = (
  resourceType: StorefrontResourceType,
  reference: AnyBlueprintReference,
  library: AdaptiveComponentLibrary,
  compositionProperties: Readonly<Record<string, JsonValue>> = {},
): Readonly<{
  reference?: ResolvedComponentReference;
  diagnostics: readonly CompilerDiagnostic[];
}> => {
  const diagnostics: CompilerDiagnostic[] = [];
  const context = referenceContext(resourceType, reference);
  const component = library.components[reference.componentId];
  if (!component) {
    diagnostics.push(compilerError(
      "slot-resolution",
      "component-reference-missing",
      `Component ${reference.componentId} is not present in ${library.id}@${library.version}.`,
      context,
    ));
    return { diagnostics };
  }
  const variant = component.variants.find((candidate) => candidate.id === reference.variantId);
  if (!variant) {
    diagnostics.push(compilerError(
      "slot-resolution",
      "component-variant-missing",
      `Component ${component.id} does not certify variant ${reference.variantId}.`,
      context,
    ));
    return { diagnostics };
  }
  const expectedRole = "slot" in reference ? "global-region" : "section";
  if (component.role !== expectedRole) {
    diagnostics.push(compilerError(
      "slot-resolution",
      "component-role-invalid",
      `Component ${component.id} is ${component.role}; ${reference.path} requires ${expectedRole}.`,
      context,
    ));
  }
  const properties: Record<string, JsonValue> = {};
  component.properties.forEach((property) => {
    if (property.defaultValue !== undefined) properties[property.id] = structuredClone(property.defaultValue);
  });
  Object.assign(properties, structuredClone(variant.defaults));
  Object.assign(properties, structuredClone(reference.properties));
  Object.assign(properties, structuredClone(compositionProperties));
  const declaredProperties = new Set(component.properties.map((property) => property.id));
  Object.keys(properties).forEach((property) => {
    if (!declaredProperties.has(property)) {
      diagnostics.push(compilerError(
        "slot-resolution",
        "component-property-missing",
        `Component ${component.id} does not declare property ${property}.`,
        context,
      ));
    }
  });
  component.properties.filter((property) => property.required).forEach((property) => {
    if (!own(properties, property.id)) {
      diagnostics.push(compilerError(
        "slot-resolution",
        "component-property-required",
        `Component ${component.id} requires property ${property.id}.`,
        context,
      ));
    }
  });

  const valuesBySlot = new Map(reference.slots.map((slot) => [slot.slotId, slot.value]));
  const declaredSlots = new Map(component.slots.map((slot) => [slot.id, slot]));
  reference.slots.forEach((slot) => {
    const definition = declaredSlots.get(slot.slotId);
    if (!definition) {
      diagnostics.push(compilerError(
        "slot-resolution",
        "component-slot-missing",
        `Component ${component.id} does not declare slot ${slot.slotId}.`,
        context,
      ));
      return;
    }
    const count = itemCount(slot.value);
    if (count < definition.minimumItems || (
      definition.maximumItems !== null && count > definition.maximumItems
    )) {
      diagnostics.push(compilerError(
        "slot-resolution",
        "component-slot-cardinality",
        `Slot ${component.id}.${slot.slotId} contains ${count} item(s), outside its certified cardinality.`,
        context,
      ));
    }
  });
  const requiredSlots = new Set([
    ...component.slots.filter((slot) => slot.required).map((slot) => slot.id),
    ...variant.requiredSlots,
  ]);
  requiredSlots.forEach((slotId) => {
    const definition = declaredSlots.get(slotId);
    const value = valuesBySlot.get(slotId);
    if (value === undefined || (definition && itemCount(value) < definition.minimumItems)) {
      diagnostics.push(compilerError(
        "slot-resolution",
        "component-slot-required",
        `Variant ${component.id}.${variant.id} requires slot ${slotId}.`,
        context,
      ));
    }
  });
  reference.bindingIds.forEach((bindingId) => {
    if (!component.commerceBindingIds.includes(bindingId)) {
      diagnostics.push(compilerError(
        "slot-resolution",
        "component-binding-unsupported",
        `Component ${component.id} does not certify commerce binding ${bindingId}.`,
        context,
      ));
    }
  });
  if (diagnostics.length) return { diagnostics };
  return {
    diagnostics,
    reference: {
      path: reference.path,
      ...("slot" in reference ? { regionSlot: reference.slot } : {}),
      componentId: component.id,
      componentVersion: component.version,
      variantId: variant.id,
      properties,
      slots: reference.slots.map((slot) => ({
        slotId: slot.slotId,
        value: structuredClone(slot.value),
      })),
      bindingIds: [...reference.bindingIds],
      responsivePolicy: component.responsivePolicy,
      accessibility: component.a11y ? {
        landmark: component.a11y.landmark,
        accessibleNameProperty: component.a11y.accessibleNameProperty,
        requiredAltSlots: [...component.a11y.requiredAltSlots],
        requiresHeading: component.a11y.requiresHeading,
      } : null,
    },
  };
};

export const validateReferenceAccessibility = (
  resourceType: StorefrontResourceType,
  reference: ResolvedComponentReference,
  component: AdaptiveComponentDefinition | undefined,
): readonly CompilerDiagnostic[] => {
  const context = {
    resourceType,
    semanticPath: reference.path,
    componentType: reference.componentId,
  };
  if (!component?.a11y) {
    return [compilerError(
      "accessibility-validation",
      "component-a11y-missing",
      `Component ${reference.componentId} has no accessibility contract.`,
      context,
    )];
  }
  const diagnostics: CompilerDiagnostic[] = [];
  if (component.role !== "block" && component.a11y.landmark === "none") {
    diagnostics.push(compilerError(
      "accessibility-validation",
      "component-landmark-missing",
      `Component ${component.id} requires a semantic landmark.`,
      context,
    ));
  }
  const accessibleNameProperty = component.a11y.accessibleNameProperty;
  if (
    accessibleNameProperty &&
    !nonEmptyAccessibleValue(reference.properties[accessibleNameProperty])
  ) {
    diagnostics.push(compilerError(
      "accessibility-validation",
      "component-accessible-name-missing",
      `Component ${component.id} requires accessible name property ${accessibleNameProperty}.`,
      context,
    ));
  }
  if (component.a11y.requiresHeading) {
    const hasPropertyHeading = accessibleNameProperty
      ? nonEmptyAccessibleValue(reference.properties[accessibleNameProperty])
      : false;
    const hasHeadingSlot = reference.slots.some((slot) =>
      (slot.slotId === "heading" || slot.slotId === "title") && itemCount(slot.value) > 0);
    if (!hasPropertyHeading && !hasHeadingSlot) {
      diagnostics.push(compilerError(
        "accessibility-validation",
        "component-heading-missing",
        `Component ${component.id} requires a heading.`,
        context,
      ));
    }
  }
  component.a11y.requiredAltSlots.forEach((slotId) => {
    const slot = reference.slots.find((candidate) => candidate.slotId === slotId);
    if (slot && !containsAltText(slot.value)) {
      diagnostics.push(compilerError(
        "accessibility-validation",
        "component-alt-text-missing",
        `Component ${component.id} slot ${slotId} requires non-empty alt text.`,
        context,
      ));
    }
  });
  return diagnostics;
};
