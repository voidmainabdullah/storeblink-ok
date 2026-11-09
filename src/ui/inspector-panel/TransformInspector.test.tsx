import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { DEFAULT_LAYOUT, DEFAULT_STYLE, DEFAULT_TRANSFORM, type SceneNode } from "@/types";
import { TransformInspector } from "./TransformInspector";

const createNode = (overrides: Partial<SceneNode> = {}): SceneNode => ({
  id: "node",
  type: "shape",
  name: "Node",
  parentId: "parent",
  childIds: [],
  props: {},
  style: DEFAULT_STYLE,
  layout: DEFAULT_LAYOUT,
  transform: { ...DEFAULT_TRANSFORM, width: 100, height: 50 },
  meta: { locked: false, hidden: false, createdAt: 1, updatedAt: 1 },
  ...overrides,
});

describe("TransformInspector", () => {
  it("aligns relative to the parent and preserves a locked aspect ratio", () => {
    const onUpdateTransform = vi.fn();
    const node = createNode({
      extensions: { aspectRatioLocked: true, aspectRatio: 2 },
    });
    const parent = createNode({
      id: "parent",
      parentId: null,
      transform: { ...DEFAULT_TRANSFORM, width: 500, height: 400 },
    });
    render(
      <TransformInspector
        node={node}
        parent={parent}
        breakpointLabel="Desktop"
        onUpdateTransform={onUpdateTransform}
        onUpdateProps={vi.fn()}
        onUpdateExtensions={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByTitle("Align horizontal center"));
    expect(onUpdateTransform).toHaveBeenCalledWith({ x: 200 });

    const width = screen.getByLabelText("W");
    fireEvent.change(width, { target: { value: "160" } });
    fireEvent.blur(width);
    expect(onUpdateTransform).toHaveBeenCalledWith({ width: 160, height: 80 });
  });
});
