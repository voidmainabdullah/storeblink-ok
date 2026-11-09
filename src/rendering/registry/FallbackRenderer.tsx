import { memo } from "react";
import type { SceneNode } from "@/types";
import { getNodeDomId, getNodeFrameStyle } from "@/rendering/renderer/style";

export type FallbackRendererProps = {
  node: SceneNode;
};

export const FallbackRenderer = memo(({ node }: FallbackRendererProps) => {
  return (
    <div
      id={getNodeDomId(node)}
      data-node-id={node.id}
      data-node-type={node.type}
      style={{
        ...getNodeFrameStyle(node),
        display: "grid",
        placeItems: "center",
        color: "#64748b",
        fontSize: 12,
        fontFamily: "Inter, system-ui, sans-serif",
        background: "#f8fafc",
        border: "1px dashed #cbd5e1",
      }}
    >
      {node.type}
    </div>
  );
});

FallbackRenderer.displayName = "FallbackRenderer";
