import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { NumberPropertyEditor } from "./NumberPropertyEditor";

describe("NumberPropertyEditor", () => {
  it("keeps keystrokes local and commits once on blur", () => {
    const onCommit = vi.fn();
    render(<NumberPropertyEditor label="Width" value={100} onCommit={onCommit} />);

    const input = screen.getByLabelText("Width");
    fireEvent.change(input, { target: { value: "480" } });
    fireEvent.change(input, { target: { value: "481" } });
    expect(onCommit).not.toHaveBeenCalled();

    fireEvent.blur(input);
    expect(onCommit).toHaveBeenCalledTimes(1);
    expect(onCommit).toHaveBeenCalledWith(481);
  });
});
