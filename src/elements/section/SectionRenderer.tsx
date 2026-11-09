import { memo } from "react";
import type { SceneNode } from "@/types";
import { renderChildren } from "@/rendering/renderer";
import { ThemeSectionBoundary } from "@/theme-engine/runtime";

export type SectionRendererProps = {
  node: SceneNode;
};

export const SectionRenderer = memo(({ node }: SectionRendererProps) => {
  return (
    <ThemeSectionBoundary node={node}>
      {renderChildren(node)}
    </ThemeSectionBoundary>
  );
});

SectionRenderer.displayName = "SectionRenderer";
