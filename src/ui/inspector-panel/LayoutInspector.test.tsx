import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { createSceneNode } from "@/engine/scene-graph";
import { LayoutInspector } from "./LayoutInspector";

describe("LayoutInspector", () => {
  it("emits typed layout mode and sizing changes", () => {
    const onChange = vi.fn();
    const node = createSceneNode({
      id: "section",
      type: "section",
      name: "Section",
      transform: { width: 800, height: 400 },
    }, null);
    const view = render(<LayoutInspector node={node} onChange={onChange} />);

    fireEvent.click(screen.getByRole("button", { name: "Auto layout" }));
    fireEvent.click(screen.getByRole("button", { name: "Vertical" }));
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ mode: "vertical" }));

    view.rerender(
      <LayoutInspector
        node={{ ...node, layout: { ...node.layout, mode: "vertical" } }}
        onChange={onChange}
      />,
    );
    fireEvent.change(screen.getByLabelText("Width"), { target: { value: "fill" } });
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({
      sizing: expect.objectContaining({ width: expect.objectContaining({ mode: "fill" }) }),
    }));
  });
});
