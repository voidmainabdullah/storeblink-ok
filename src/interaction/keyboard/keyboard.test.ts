import { describe, expect, it, vi } from "vitest";
import {
  canDeleteCanvasSelection,
  getShortcutAction,
  handleShortcut,
  isCanvasFocusActive,
  isTypingTarget,
  type ShortcutHandlerContext,
} from "./index";

const createCtx = (): ShortcutHandlerContext => ({
  undo: vi.fn(),
  redo: vi.fn(),
  copy: vi.fn(),
  cut: vi.fn(),
  paste: vi.fn(),
  duplicate: vi.fn(),
  deleteSelection: vi.fn(),
  clearSelection: vi.fn(),
  nudge: vi.fn(),
});

describe("keyboard system", () => {
  it("maps shortcuts to their phase 6 targets", () => {
    expect(getShortcutAction(new KeyboardEvent("keydown", { key: "z", ctrlKey: true }))).toBe("undo");
    expect(getShortcutAction(new KeyboardEvent("keydown", { key: "z", ctrlKey: true, shiftKey: true }))).toBe("redo");
    expect(getShortcutAction(new KeyboardEvent("keydown", { key: "v", metaKey: true }))).toBe("paste");
    expect(getShortcutAction(new KeyboardEvent("keydown", { key: "Delete" }))).toBe("delete");
    expect(getShortcutAction(new KeyboardEvent("keydown", { key: "ArrowRight" }))).toBe("nudge-right");
  });

  it("does nothing while typing into an input", () => {
    const input = document.createElement("input");
    expect(isTypingTarget(input)).toBe(true);
    const event = new KeyboardEvent("keydown", { key: "Delete", bubbles: true });
    Object.defineProperty(event, "target", { value: input });
    const ctx = createCtx();
    expect(handleShortcut(event, ctx)).toBe(false);
    expect(ctx.deleteSelection).not.toHaveBeenCalled();
  });

  it("recognizes focus inside the canvas or structure tree", () => {
    const canvas = document.createElement("div");
    canvas.setAttribute("data-editor-canvas-shell", "");
    canvas.tabIndex = 0;
    const editable = document.createElement("div");
    editable.tabIndex = 0;
    canvas.appendChild(editable);
    document.body.appendChild(canvas);

    editable.focus();
    expect(isCanvasFocusActive()).toBe(true);
    document.body.focus();
    expect(isCanvasFocusActive(document.body)).toBe(false);
    const tree = document.createElement("aside");
    tree.setAttribute("data-editor-structure-tree", "");
    const treeButton = document.createElement("button");
    tree.appendChild(treeButton);
    document.body.appendChild(tree);
    treeButton.focus();
    expect(isCanvasFocusActive()).toBe(true);
    canvas.remove();
    tree.remove();
  });

  it("allows deletion only for a focused, non-editing canvas", () => {
    const canvas = document.createElement("div");
    canvas.setAttribute("data-editor-canvas-shell", "");
    canvas.tabIndex = 0;
    const input = document.createElement("input");
    document.body.append(canvas, input);
    canvas.focus();

    expect(canDeleteCanvasSelection(canvas, null, canvas)).toBe(true);
    expect(canDeleteCanvasSelection(input, null, canvas)).toBe(false);
    expect(canDeleteCanvasSelection(canvas, "text-1", canvas)).toBe(false);
    expect(canDeleteCanvasSelection(canvas, null, document.body)).toBe(false);
    canvas.remove();
    input.remove();
  });

  it("routes arrow nudges with shift using a larger step", () => {
    const event = new KeyboardEvent("keydown", { key: "ArrowDown", shiftKey: true });
    const ctx = createCtx();
    expect(handleShortcut(event, ctx)).toBe(true);
    expect(ctx.nudge).toHaveBeenCalledWith({ x: 0, y: 10 });
  });
});
