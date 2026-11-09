import { describe, expect, it, vi } from "vitest";
import { createSceneGraph, createSceneNode } from "@/engine/scene-graph";
import { createHistoryManager } from "@/engine/history";
import { createCommandManager, createFieldUpdateCommand } from "./index";

const createGraph = () => {
  const root = createSceneNode(
    {
      id: "root",
      type: "section",
      name: "Root",
      transform: { width: 320, height: 200 },
    },
    null,
  );
  return createSceneGraph({ initialTree: { rootNodeId: root.id, nodes: { [root.id]: root } } });
};

describe("kernel-owned command and history managers", () => {
  it("keeps undo stacks isolated across editor instances", () => {
    const firstGraph = createGraph();
    const secondGraph = createGraph();
    const firstHistory = createHistoryManager();
    const secondHistory = createHistoryManager();
    const firstCommands = createCommandManager({ historyManager: firstHistory });
    const secondCommands = createCommandManager({ historyManager: secondHistory });

    firstCommands.dispatch(
      createFieldUpdateCommand("root", "transform.x", 0, 120),
      { sceneGraph: firstGraph },
    );

    expect(firstGraph.getNode("root")?.transform.x).toBe(120);
    expect(secondGraph.getNode("root")?.transform.x).toBe(0);
    expect(firstHistory.getSnapshot()).toMatchObject({ canUndo: true, undoDepth: 1 });
    expect(secondHistory.getSnapshot()).toMatchObject({ canUndo: false, undoDepth: 0 });

    firstHistory.undo({ sceneGraph: firstGraph });
    expect(firstGraph.getNode("root")?.transform.x).toBe(0);
    expect(secondGraph.getNode("root")?.transform.x).toBe(0);
  });

  it("publishes stable external-store snapshots and restores failed undo entries", () => {
    const graph = createGraph();
    const manager = createHistoryManager();
    const listener = vi.fn();
    manager.subscribe(listener);
    const before = manager.getSnapshot();

    manager.record({
      id: "failing-command",
      type: "test",
      label: "Failing command",
      timestamp: 1,
      payload: null,
      execute: () => undefined,
      undo: () => {
        throw new Error("rollback failed");
      },
    });

    expect(manager.getSnapshot()).not.toBe(before);
    expect(() => manager.undo({ sceneGraph: graph })).toThrow("rollback failed");
    expect(manager.getSnapshot()).toMatchObject({ canUndo: true, canRedo: false, undoDepth: 1 });
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it("reports successful and failed command boundaries without recording failures", () => {
    const graph = createGraph();
    const history = createHistoryManager();
    const onExecuted = vi.fn();
    const onFailed = vi.fn();
    const commands = createCommandManager({
      historyManager: history,
      onExecuted,
      onFailed,
    });
    const successful = createFieldUpdateCommand(
      "root",
      "transform.x",
      0,
      42,
    );
    const failed = {
      ...createFieldUpdateCommand("root", "transform.y", 0, 42),
      execute: () => {
        throw new Error("command failed");
      },
    };

    commands.dispatch(successful, { sceneGraph: graph });
    expect(() => commands.dispatch(failed, { sceneGraph: graph })).toThrow(
      "command failed",
    );

    expect(onExecuted).toHaveBeenCalledWith(successful);
    expect(onFailed).toHaveBeenCalledWith(failed, expect.any(Error));
    expect(history.getSnapshot().undoDepth).toBe(1);
  });
});
