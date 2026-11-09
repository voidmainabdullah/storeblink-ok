import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { DEFAULT_LAYOUT, DEFAULT_STYLE, DEFAULT_TRANSFORM, type SceneNode } from "@/types";
import { ImageInspector } from "./ImageInspector";

const imageNode: SceneNode = {
  id: "image",
  type: "image",
  name: "Product image",
  parentId: null,
  childIds: [],
  props: { src: "data:image/png;base64,AA==", objectFit: "cover" },
  style: DEFAULT_STYLE,
  layout: DEFAULT_LAYOUT,
  transform: { ...DEFAULT_TRANSFORM, width: 300, height: 200 },
  meta: { locked: false, hidden: false, createdAt: 1, updatedAt: 1 },
};

describe("ImageInspector", () => {
  it("writes image scale, crop, and adjustment properties", () => {
    const onUpdateProps = vi.fn();
    render(
      <ImageInspector
        node={imageNode}
        brandColors={["#0178ff"]}
        onUpdateProps={onUpdateProps}
      />,
    );

    fireEvent.change(screen.getByLabelText("Scale"), { target: { value: "175" } });
    expect(onUpdateProps).toHaveBeenCalledWith({ imageScale: 175 });

    fireEvent.click(screen.getByRole("checkbox", { name: /^Crop/ }));
    expect(onUpdateProps).toHaveBeenCalledWith({ cropEnabled: true, objectFit: "cover" });

    fireEvent.change(screen.getByLabelText("Brightness"), { target: { value: "30" } });
    expect(onUpdateProps).toHaveBeenCalledWith(
      expect.objectContaining({
        imageAdjustments: expect.objectContaining({ brightness: 30 }),
      }),
    );
  });

  it("does not expose fake AI actions when no processing provider exists", () => {
    render(<ImageInspector node={imageNode} brandColors={[]} onUpdateProps={vi.fn()} />);
    expect(screen.getByRole("button", { name: /Remove BG/i })).toBeDisabled();
    expect(screen.getByRole("button", { name: /AI enhance/i })).toBeDisabled();
  });
});
