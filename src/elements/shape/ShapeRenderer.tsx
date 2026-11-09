import { memo } from "react";
import type { SceneNode } from "@/types";
import { getNodeDomId, getNodeFrameStyle } from "@/rendering/renderer/style";

export type ShapeRendererProps = {
  node: SceneNode;
};

const CLIP_PATHS: Record<string, string> = {
  triangle: "polygon(50% 0%, 100% 100%, 0% 100%)",
  star: "polygon(50% 0%, 61% 35%, 98% 35%, 68% 57%, 79% 94%, 50% 72%, 21% 94%, 32% 57%, 2% 35%, 39% 35%)",
  polygon: "polygon(25% 7%, 75% 7%, 100% 50%, 75% 93%, 25% 93%, 0% 50%)",
  diamond: "polygon(50% 0%, 100% 50%, 50% 100%, 0% 50%)",
};

export const ShapeRenderer = memo(({ node }: ShapeRendererProps) => {
  const kind = String(node.props.shapeKind ?? "rectangle");
  const frameStyle = getNodeFrameStyle(node);

  if (kind === "line" || kind === "arrow") {
    const fill = node.style.fills[0];
    const stroke = node.style.strokes[0];
    const color = stroke?.color ?? (fill?.type === "solid" ? fill.color : "#111827");
    const strokeWidth = Math.max(1, stroke?.width ?? 3);
    return (
      <div
        id={getNodeDomId(node)}
        data-node-id={node.id}
        data-node-type={node.type}
        data-shape-kind={kind}
        style={{ ...frameStyle, background: "transparent", border: 0 }}
      >
        <svg width="100%" height="100%" viewBox="0 0 100 20" preserveAspectRatio="none" aria-hidden="true">
          <line x1="2" y1="10" x2={kind === "arrow" ? "88" : "98"} y2="10" stroke={color} strokeWidth={strokeWidth} vectorEffect="non-scaling-stroke" />
          {kind === "arrow" ? <path d="M86 3 L98 10 L86 17 Z" fill={color} /> : null}
        </svg>
      </div>
    );
  }

  const shapeStyle =
    kind === "circle" || kind === "ellipse"
      ? { borderRadius: "50%" }
      : CLIP_PATHS[kind]
        ? { clipPath: CLIP_PATHS[kind] }
        : {};

  return (
    <div
      id={getNodeDomId(node)}
      data-node-id={node.id}
      data-node-type={node.type}
      data-shape-kind={kind}
      style={{ ...frameStyle, ...shapeStyle }}
    />
  );
});

ShapeRenderer.displayName = "ShapeRenderer";
