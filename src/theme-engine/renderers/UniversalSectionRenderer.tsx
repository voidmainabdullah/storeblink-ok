import { memo } from "react";
import { getNodeDomId, getNodeFrameStyle } from "@/rendering/renderer";
import {
  CANONICAL_SECTION_TYPES,
  type ThemeSectionRendererProps,
} from "@/theme-engine/contracts";
import { themePackageRegistry } from "@/theme-engine/registry";

export const UniversalSectionRenderer = memo(({
  node,
  children,
}: ThemeSectionRendererProps) => (
  <section
    id={getNodeDomId(node)}
    data-node-id={node.id}
    data-node-type={node.type}
    data-canonical-section={String(node.extensions?.canonicalSectionType ?? "") || undefined}
    style={{
      ...getNodeFrameStyle(node),
      overflow: String(node.props.overflow ?? "visible"),
    }}
  >
    {children}
  </section>
));

UniversalSectionRenderer.displayName = "UniversalSectionRenderer";

export const UnknownSectionFallback = memo(({
  node,
  children,
  mode,
  validationIssues,
}: ThemeSectionRendererProps) => (
  <section
    id={getNodeDomId(node)}
    data-node-id={node.id}
    data-node-type={node.type}
    data-theme-section-fallback="unknown"
    style={{
      ...getNodeFrameStyle(node),
      overflow: String(node.props.overflow ?? "visible"),
    }}
  >
    {children}
    {mode === "editor" && node.extensions?.canonicalSectionType ? (
      <div
        role="status"
        style={{
          position: "absolute",
          right: 8,
          bottom: 8,
          padding: "5px 8px",
          background: "#fff7ed",
          border: "1px solid #fdba74",
          color: "#9a3412",
          font: "600 10px/1.2 Inter, system-ui, sans-serif",
          zIndex: 99999,
          pointerEvents: "none",
        }}
      >
        {validationIssues?.[0] ?? "Using safe section fallback"}
      </div>
    ) : null}
  </section>
));

UnknownSectionFallback.displayName = "UnknownSectionFallback";

let universalRenderersRegistered = false;

export const ensureUniversalSectionRenderers = () => {
  if (universalRenderersRegistered) return;
  universalRenderersRegistered = true;
  CANONICAL_SECTION_TYPES.forEach((sectionType) => {
    if (themePackageRegistry.hasUniversalRenderer(sectionType)) return;
    themePackageRegistry.registerUniversalRenderer(
      sectionType,
      UniversalSectionRenderer,
    );
  });
};
