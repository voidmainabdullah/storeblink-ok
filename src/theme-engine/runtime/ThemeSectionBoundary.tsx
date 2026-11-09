import { useMemo, type ReactNode } from "react";
import { CANONICAL_SECTION_TYPES, type CanonicalSectionType } from "@/theme-engine/contracts";
import {
  UnknownSectionFallback,
  UniversalSectionRenderer,
} from "@/theme-engine/renderers";
import { useThemeRuntime } from "./ThemeRuntimeProvider";
import type { SceneNode } from "@/types";
import { sectionRegistry } from "@/document/sections";
import { AnnouncementMarquee } from "@/document/animation";

const canonicalTypes = new Set<string>(CANONICAL_SECTION_TYPES);

const legacySectionMap: Record<string, CanonicalSectionType> = {
  header: "site-header",
  hero: "immersive-product-hero",
  "product-grid": "featured-product-collection",
  "rich-text": "image-with-text",
  footer: "site-footer",
};

export const canonicalSectionForNode = (node: SceneNode): CanonicalSectionType | null => {
  const explicit = node.extensions?.canonicalSectionType;
  if (typeof explicit === "string" && canonicalTypes.has(explicit)) {
    return explicit as CanonicalSectionType;
  }
  const legacy = node.extensions?.sectionType;
  return typeof legacy === "string" ? legacySectionMap[legacy] ?? null : null;
};

export const ThemeSectionBoundary = ({
  node,
  children,
}: {
  node: SceneNode;
  children: ReactNode;
}) => {
  const runtime = useThemeRuntime();
  const canonicalType = canonicalSectionForNode(node);
  const validation = useMemo(
    () => sectionRegistry.validateNodeSettings(node),
    [node],
  );
  const Renderer = !validation.valid
    ? UnknownSectionFallback
    : canonicalType
      ? runtime.resolveSectionRenderer(canonicalType)
      : UniversalSectionRenderer;
  const content =
    canonicalType === "announcement-marquee" ||
    canonicalType === "promotional-marquee" ? (
      <AnnouncementMarquee node={node} mode={runtime.mode}>
        {children}
      </AnnouncementMarquee>
    ) : (
      children
    );

  return (
    <Renderer
      node={node}
      tokens={runtime.tokens}
      mode={runtime.mode}
      validationIssues={validation.issues.map((issue) => issue.message)}
    >
      {content}
    </Renderer>
  );
};
