import {
  semanticPathSchema,
  STOREFRONT_RESOURCE_SEMANTIC_PREFIXES,
  type SemanticPath,
  type StorefrontResourceType,
} from "./identifiers";

export const SECTION_CONTROL_KEYS = ["variant", "visible"] as const;
export type SectionControlKey = (typeof SECTION_CONTROL_KEYS)[number];

/** Reserved semantic value path for one certified section control. */
export const sectionControlSemanticPath = (
  sectionPath: SemanticPath,
  control: SectionControlKey,
): SemanticPath => semanticPathSchema.parse(`${sectionPath}.settings.${control}`);

/**
 * Reserved SemanticCollection path. `order` contains every blueprint section
 * path exactly once; collection item payloads are intentionally ignored.
 */
export const routeSectionOrderSemanticPath = (
  resourceType: StorefrontResourceType,
): SemanticPath => semanticPathSchema.parse(
  `${STOREFRONT_RESOURCE_SEMANTIC_PREFIXES[resourceType]}.sections`,
);

export const parseSectionControlPath = (path: string): Readonly<{
  sectionPath: SemanticPath;
  control: string;
}> | null => {
  const match = /^(.*)\.settings\.([a-z][a-z0-9-]*)$/.exec(path);
  if (!match) return null;
  const section = semanticPathSchema.safeParse(match[1]);
  return section.success
    ? Object.freeze({ sectionPath: section.data, control: match[2] })
    : null;
};
