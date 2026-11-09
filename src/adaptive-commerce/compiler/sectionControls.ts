import {
  routeSectionOrderSemanticPath,
  sectionControlSemanticPath,
  semanticStorefrontDocumentSchema,
  STOREFRONT_RESOURCE_TYPES,
  type SemanticStorefrontDocument,
  type StorefrontResourceType,
  type TemplateBlueprint,
} from "../contracts";
import { artifactHashFor } from "./sha256";

export type SectionControlBlueprints = Readonly<Record<
  StorefrontResourceType,
  Pick<TemplateBlueprint, "sections">
>>;

/**
 * Adds missing control defaults without overwriting merchant values or order.
 * The returned base document has a recomputed hash and never mutates input.
 */
export const seedStorefrontSectionControls = (
  document: SemanticStorefrontDocument,
  blueprints: SectionControlBlueprints,
): SemanticStorefrontDocument => {
  const values = structuredClone(document.values);
  const collections = structuredClone(document.collections);
  const owns = (value: object, key: string): boolean =>
    Object.prototype.hasOwnProperty.call(value, key);
  STOREFRONT_RESOURCE_TYPES.forEach((resourceType) => {
    const sections = blueprints[resourceType].sections;
    sections.forEach((section) => {
      const variantPath = sectionControlSemanticPath(section.path, "variant");
      const visibilityPath = sectionControlSemanticPath(section.path, "visible");
      if (!owns(values, variantPath)) values[variantPath] = section.variantId;
      if (!owns(values, visibilityPath)) values[visibilityPath] = true;
    });
    const orderPath = routeSectionOrderSemanticPath(resourceType);
    if (!owns(collections, orderPath)) {
      collections[orderPath] = {
        order: sections.map((section) => section.path),
        items: Object.fromEntries(sections.map((section) => [section.path, null])),
      };
    }
  });
  const payload = {
    schemaVersion: document.schemaVersion,
    revisionId: document.revisionId,
    values,
    collections,
  };
  return semanticStorefrontDocumentSchema.parse({
    ...payload,
    baseHash: artifactHashFor(payload),
  });
};
