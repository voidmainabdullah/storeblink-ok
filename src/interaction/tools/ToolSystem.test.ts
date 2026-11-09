import { beforeEach, describe, expect, it, vi } from "vitest";
import { useToolStore } from "@/stores/tool.store";
import { ToolSystem } from "./ToolSystem";

describe("ToolSystem", () => {
  const tools = new ToolSystem();

  beforeEach(() => {
    useToolStore.setState({ activeTool: "select" });
  });

  it("owns pointer and hand mode transitions", () => {
    tools.activate("hand");
    expect(tools.getActiveTool()).toBe("hand");
    expect(tools.isActive("hand")).toBe(true);

    tools.reset();
    expect(tools.getActiveTool()).toBe("select");
  });

  it("notifies only when the active tool changes", () => {
    const listener = vi.fn();
    const unsubscribe = tools.subscribe(listener);

    tools.activate("select");
    tools.activate("hand");
    tools.activate("hand");

    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener).toHaveBeenCalledWith("hand");
    unsubscribe();
  });
});
