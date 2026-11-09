import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { ComponentDefinition } from "@/types";
import { ComponentLibraryPanel } from "./ComponentLibraryPanel";

const definition: ComponentDefinition = {
  id: "product-card",
  name: "Product card",
  defaultVariantId: "default",
  variants: {
    default: {
      id: "default",
      name: "Default",
      tree: { rootNodeId: "card", nodes: {} },
    },
  },
  createdAt: 1,
  updatedAt: 1,
};

describe("ComponentLibraryPanel", () => {
  it("renders an empty component library", () => {
    render(<ComponentLibraryPanel definitions={[]} onInsert={vi.fn()} />);
    expect(screen.getByText("No components")).toBeInTheDocument();
  });

  it("inserts a selected component definition", () => {
    const onInsert = vi.fn();
    render(<ComponentLibraryPanel definitions={[definition]} onInsert={onInsert} />);
    fireEvent.click(screen.getByRole("button", { name: "Insert Product card" }));
    expect(onInsert).toHaveBeenCalledWith("product-card");
  });
});
