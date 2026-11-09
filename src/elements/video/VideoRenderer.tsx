import { memo } from "react";
import type { SceneNode } from "@/types";
import { getNodeDomId, getNodeFrameStyle } from "@/rendering/renderer/style";

export type VideoRendererProps = {
  node: SceneNode;
};

export const VideoRenderer = memo(({ node }: VideoRendererProps) => {
  const src = typeof node.props.src === "string" ? node.props.src : undefined;
  const poster = typeof node.props.poster === "string" ? node.props.poster : undefined;

  return (
    <div
      id={getNodeDomId(node)}
      data-node-id={node.id}
      data-node-type={node.type}
      style={{
        ...getNodeFrameStyle(node),
        overflow: "hidden",
        ...(!src && !node.style.fills.length ? { background: "#111827" } : {}),
      }}
    >
      {src ? (
        <video
          src={src}
          poster={poster}
          muted
          playsInline
          controls={Boolean(node.props.controls ?? true)}
          style={{ width: "100%", height: "100%", objectFit: "cover" }}
        />
      ) : null}
    </div>
  );
});

VideoRenderer.displayName = "VideoRenderer";
