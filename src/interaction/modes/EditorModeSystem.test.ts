import { describe, expect, it, vi } from "vitest";
import { createSceneNode } from "@/engine/scene-graph";
import { createEditorModeSystem } from "./EditorModeSystem";

describe("EditorModeSystem", () => {
  const text = createSceneNode({ id: "text", type: "text", name: "Heading" }, null);
  const image = createSceneNode({ id: "image", type: "image", name: "Hero" }, null);

  it("defaults to fixed content-safe capabilities", () => {
    const system = createEditorModeSystem();

    expect(system.getSnapshot()).toBe("fixed");
    expect(system.can("edit-content", text)).toBe(true);
    expect(system.can("replace-image", image)).toBe(true);
    expect(system.can("brand")).toBe(true);
    expect(system.can("theme")).toBe(false);
    expect(system.can("transform", text)).toBe(false);
    expect(system.can("structure", text)).toBe(false);
    expect(system.filterContentPatch(text, { text: "New", fontSize: 72 })).toEqual({ text: "New" });
  });

  it("unlocks every capability in independent mode and publishes one change", () => {
    const system = createEditorModeSystem();
    const listener = vi.fn();
    system.subscribe(listener);

    system.setMode("independent");
    system.setMode("independent");

    expect(listener).toHaveBeenCalledTimes(1);
    expect(system.can("transform", image)).toBe(true);
    expect(system.can("structure", image)).toBe(true);
    expect(system.filterContentPatch(text, { text: "New", fontSize: 72 })).toEqual({
      text: "New",
      fontSize: 72,
    });
  });
});
