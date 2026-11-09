import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import {
  DEFAULT_LAYOUT,
  DEFAULT_STYLE,
  DEFAULT_TRANSFORM,
  type SceneNode,
} from "@/types";
import { AppearanceInspector } from "./AppearanceInspector";

const createNode = (overrides: Partial<SceneNode>): SceneNode => ({
  id: "node",
  type: "shape",
  name: "Node",
  parentId: null,
  childIds: [],
  props: {},
  style: DEFAULT_STYLE,
  layout: DEFAULT_LAYOUT,
  transform: DEFAULT_TRANSFORM,
  meta: { locked: false, hidden: false, createdAt: 1, updatedAt: 1 },
  ...overrides,
});

describe("AppearanceInspector", () => {
  it("adds and deletes a button fill through the renderer-owned button properties", () => {
    const onUpdateProps = vi.fn();
    render(
      <AppearanceInspector
        node={createNode({ type: "button", props: { background: "#111111" } })}
        brandColors={[]}
        onUpdateProps={onUpdateProps}
        onUpdateStyle={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByTitle("Add fill"));
    expect(onUpdateProps).toHaveBeenLastCalledWith({
      background: "#FFFFFF",
      backgroundVisible: true,
    });

    fireEvent.click(screen.getByTitle("Delete fill"));
    expect(onUpdateProps).toHaveBeenLastCalledWith({
      background: undefined,
      backgroundVisible: false,
    });
  });

  it("prepends a visible stroke instead of making Add stroke a no-op", () => {
    const onUpdateStyle = vi.fn();
    render(
      <AppearanceInspector
        node={createNode({
          style: {
            ...DEFAULT_STYLE,
            strokes: [{ color: "#ff0000", width: 3, style: "solid" }],
          },
        })}
        brandColors={[]}
        onUpdateProps={vi.fn()}
        onUpdateStyle={onUpdateStyle}
      />,
    );

    fireEvent.click(screen.getByTitle("Add stroke"));
    expect(onUpdateStyle).toHaveBeenCalledWith({
      strokes: [
        { color: "#000000", width: 1, style: "solid", position: "inside" },
        { color: "#ff0000", width: 3, style: "solid" },
      ],
    });
  });
});
