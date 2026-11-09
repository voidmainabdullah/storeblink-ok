import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { CanvasToolDock } from "./CanvasToolDock";

const renderDock = () => {
  const onInsertShape = vi.fn();
  const onInsertText = vi.fn();
  const onUploadImage = vi.fn();
  const { container } = render(
    <CanvasToolDock
      activeTool="select"
      gridVisible={false}
      zoom={1}
      onSelectTool={vi.fn()}
      onInsertShape={onInsertShape}
      onInsertText={onInsertText}
      onUploadImage={onUploadImage}
      onToggleGrid={vi.fn()}
      onZoomOut={vi.fn()}
      onZoomIn={vi.fn()}
    />,
  );
  return { container, onInsertShape, onInsertText, onUploadImage };
};

describe("CanvasToolDock", () => {
  it("inserts expanded shape and text presets", () => {
    const { onInsertShape, onInsertText } = renderDock();

    fireEvent.click(screen.getByLabelText("Add shape"));
    fireEvent.click(screen.getByText("Triangle"));
    expect(onInsertShape).toHaveBeenCalledWith("triangle");

    fireEvent.click(screen.getByLabelText("Add text"));
    fireEvent.click(screen.getByText("Subheading"));
    expect(onInsertText).toHaveBeenCalledWith("subheading");
  });

  it("passes uploaded image files to the Scene Graph insertion handler", () => {
    const { container, onUploadImage } = renderDock();
    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    const file = new File(["image"], "product.png", { type: "image/png" });

    fireEvent.change(input, { target: { files: [file] } });

    expect(onUploadImage).toHaveBeenCalledWith(file);
  });
});
