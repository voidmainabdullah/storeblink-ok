import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { createSceneNode } from "@/engine/scene-graph";
import { createDefaultCustomCodeProps } from "@/extension/custom-code";
import { SceneRenderProvider } from "@/rendering/renderer";
import { CustomCodeRenderer } from "./CustomCodeRenderer";

describe("CustomCodeRenderer", () => {
  it("uses an opaque-origin script-only sandbox and disables frame input in editor mode", () => {
    const node = createSceneNode({
      id: "custom-code",
      type: "custom:code",
      name: "Custom section",
      props: createDefaultCustomCodeProps(),
      transform: { width: 640, height: 320 },
    }, null);
    const scene = { rootNodeId: node.id, nodes: { [node.id]: node } };

    render(
      <SceneRenderProvider scene={scene} interactionPreviewEnabled>
        <CustomCodeRenderer node={node} />
      </SceneRenderProvider>,
    );

    const frame = screen.getByTitle("Custom React section");
    expect(frame).toHaveAttribute("sandbox", "allow-scripts");
    expect(frame).not.toHaveAttribute("allow-same-origin");
    expect(frame).toHaveAttribute("referrerpolicy", "no-referrer");
    expect(frame).toHaveStyle({ pointerEvents: "none" });
    expect(frame.getAttribute("srcdoc")).toContain("connect-src 'none'");
  });
});
