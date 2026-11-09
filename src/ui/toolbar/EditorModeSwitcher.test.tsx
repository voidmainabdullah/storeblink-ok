import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { EditorModeSwitcher } from "./EditorModeSwitcher";

describe("EditorModeSwitcher", () => {
  it("presents merchant-facing Store and Design modes while preserving engine mode ids", () => {
    const onChange = vi.fn();
    render(<EditorModeSwitcher mode="fixed" onChange={onChange} />);

    const store = screen.getByRole("button", { name: /Store mode/i });
    const design = screen.getByRole("button", { name: /Design mode/i });

    expect(store).toHaveAttribute("aria-pressed", "true");
    expect(design).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByText("Store")).toBeInTheDocument();
    expect(screen.getByText("Design")).toBeInTheDocument();

    fireEvent.click(design);
    expect(onChange).toHaveBeenCalledWith("independent");
  });
});
