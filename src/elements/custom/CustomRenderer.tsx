import { memo } from "react";
import type { SceneNode } from "@/types";
import { FallbackRenderer } from "@/rendering/registry";

export type CustomRendererProps = {
  node: SceneNode;
};

export const CustomRenderer = memo(({ node }: CustomRendererProps) => {
  return <FallbackRenderer node={node} />;
});

CustomRenderer.displayName = "CustomRenderer";
