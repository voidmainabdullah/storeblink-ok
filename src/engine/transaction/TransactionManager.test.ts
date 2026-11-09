import { describe, expect, it } from "vitest";
import { createCommandManager } from "@/engine/command";
import { createHistoryManager } from "@/engine/history";
import { createSceneGraph } from "@/engine/scene-graph";
import { createTransactionManager, TransactionError } from "./index";

describe("TransactionManager", () => {
  it("commits cross-domain steps as one undoable history entry", () => {
    const history = createHistoryManager();
    const transactions = createTransactionManager(createCommandManager({ historyManager: history }));
    const graph = createSceneGraph();
    const assets: string[] = [];
    const pages: string[] = [];
    const context = { sceneGraph: graph };

    transactions.run({
      id: "create-page-transaction",
      label: "Create page and asset",
      steps: [
        { id: "asset", label: "Add asset", execute: () => assets.push("asset-1"), rollback: () => { assets.pop(); } },
        { id: "page", label: "Add page", execute: () => pages.push("page-1"), rollback: () => { pages.pop(); } },
      ],
      validators: [{ id: "integrity", validate: () => { if (!assets.length || !pages.length) throw new Error("incomplete"); } }],
    }, context);

    expect(assets).toEqual(["asset-1"]);
    expect(pages).toEqual(["page-1"]);
    expect(history.getSnapshot().undoDepth).toBe(1);
    history.undo(context);
    expect(assets).toEqual([]);
    expect(pages).toEqual([]);
  });

  it("rolls back completed steps and does not create history when a step fails", () => {
    const history = createHistoryManager();
    const transactions = createTransactionManager(createCommandManager({ historyManager: history }));
    const values: string[] = [];

    expect(() => transactions.run({
      id: "failed-transaction",
      label: "Fail atomically",
      steps: [
        { id: "first", label: "First", execute: () => values.push("first"), rollback: () => { values.pop(); } },
        { id: "second", label: "Second", execute: () => { throw new Error("write failed"); }, rollback: () => undefined },
      ],
    }, { sceneGraph: createSceneGraph() })).toThrow(TransactionError);

    expect(values).toEqual([]);
    expect(history.getSnapshot()).toMatchObject({ canUndo: false, undoDepth: 0 });
    expect(transactions.getSnapshot()).toMatchObject({ failedCount: 1, activeTransactionId: null });
  });
});
