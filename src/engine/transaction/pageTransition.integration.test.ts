import { describe, expect, it } from "vitest";
import type { HistoryManager } from "@/engine/history";
import type { ComponentSystemAPI } from "@/document/components";
import type { SceneGraphAPI } from "@/engine/scene-graph";
import {
  buildBasicCustomPageScene,
  buildBasicTemplateScene,
} from "@/editor/engine/engineTemplates";
import { createEngineSceneTheme } from "@/editor/engine/storeSceneAdapter";
import {
  createEditorKernel,
  EDITOR_SYSTEM_KEYS,
} from "@/engine/kernel";
import type {
  PageDocumentSystem,
  PreparedPageTransition,
} from "@/document/pages";
import type { NodeSchemaRegistry } from "@/engine/node-schema";
import type { SceneTree } from "@/types";
import type { TransactionManager } from "./TransactionManager";

const activeScene = (transition: PreparedPageTransition): SceneTree => {
  const page = transition.before.document.pages.find(
    (candidate) => candidate.id === transition.before.activePageId,
  );
  if (!page) throw new Error("Prepared transition has no previous active page.");
  return page.scene;
};

describe("page transition transaction", () => {
  it("commits and restores the page document and Scene Graph as one history entry", () => {
    const kernel = createEditorKernel();
    const graph = kernel.resolve<SceneGraphAPI>(
      EDITOR_SYSTEM_KEYS.commandSceneGraph,
    );
    const pages = kernel.resolve<PageDocumentSystem>(EDITOR_SYSTEM_KEYS.pages);
    const schemas = kernel.resolve<NodeSchemaRegistry>(
      EDITOR_SYSTEM_KEYS.nodeSchemas,
    );
    const transactions = kernel.resolve<TransactionManager>(
      EDITOR_SYSTEM_KEYS.transactions,
    );
    const history = kernel.resolve<HistoryManager>(EDITOR_SYSTEM_KEYS.history);
    const profile = { business_name: "Transactional Store" };
    const home = buildBasicTemplateScene(profile, []);
    graph.deserializeTree(home);
    pages.load(createEngineSceneTheme(home), home);

    const prepared = pages.prepareAddPage(
      {
        title: "Journal",
        scene: buildBasicCustomPageScene(profile, "Journal", "journal"),
      },
      graph.serializeTree(),
    );
    const transition = pages.finalizeTransition(prepared, prepared.scene);
    const beforeScene = activeScene(transition);

    transactions.run(
      {
        label: "Create Journal",
        steps: [
          {
            id: "page-document",
            label: "Update page document",
            execute: () => pages.restore(transition.after),
            rollback: () => pages.restore(transition.before),
          },
          {
            id: "scene-tree",
            label: "Load active page scene",
            execute: ({ sceneGraph }) =>
              sceneGraph.deserializeTree(transition.scene),
            rollback: ({ sceneGraph }) =>
              sceneGraph.deserializeTree(beforeScene),
          },
        ],
        validators: [
          {
            id: "schema",
            validate: ({ sceneGraph }) =>
              schemas.assertTree(sceneGraph.serializeTree()),
          },
        ],
      },
      { sceneGraph: graph },
    );

    expect(pages.getSnapshot().activePageId).toBe(transition.page.id);
    expect(graph.serializeTree()).toEqual(transition.scene);
    expect(history.getSnapshot()).toMatchObject({
      undoDepth: 1,
      redoDepth: 0,
    });

    history.undo({ sceneGraph: graph });

    expect(pages.getSnapshot().activePageId).toBe("home");
    expect(pages.getSnapshot().document.pages).toHaveLength(1);
    expect(graph.serializeTree()).toEqual(beforeScene);
    expect(history.getSnapshot()).toMatchObject({
      undoDepth: 0,
      redoDepth: 1,
    });

    history.redo({ sceneGraph: graph });

    expect(pages.getSnapshot().activePageId).toBe(transition.page.id);
    expect(pages.getSnapshot().document.pages).toHaveLength(2);
    expect(graph.serializeTree()).toEqual(transition.scene);
  });

  it("updates inactive component instances and restores all pages with one undo", () => {
    const kernel = createEditorKernel();
    const graph = kernel.resolve<SceneGraphAPI>(EDITOR_SYSTEM_KEYS.commandSceneGraph);
    const pages = kernel.resolve<PageDocumentSystem>(EDITOR_SYSTEM_KEYS.pages);
    const components = kernel.resolve<ComponentSystemAPI>(EDITOR_SYSTEM_KEYS.components);
    const schemas = kernel.resolve<NodeSchemaRegistry>(EDITOR_SYSTEM_KEYS.nodeSchemas);
    const transactions = kernel.resolve<TransactionManager>(EDITOR_SYSTEM_KEYS.transactions);
    const history = kernel.resolve<HistoryManager>(EDITOR_SYSTEM_KEYS.history);
    const profile = { business_name: "Transactional Store" };
    const home = buildBasicTemplateScene(profile, []);
    graph.deserializeTree(home);
    pages.load(createEngineSceneTheme(home), home);
    const custom = pages.addPage(
      {
        title: "Journal",
        scene: buildBasicCustomPageScene(profile, "Journal", "journal"),
      },
      home,
    );
    const currentHome = pages.activate("home", custom.scene);
    graph.deserializeTree(currentHome);
    history.clear();
    const editedHome = structuredClone(currentHome);
    editedHome.nodes["basic-header"].style.fills = [
      { type: "solid", color: "#123456" },
    ];
    const updatedHome = components.updateDefinition(
      editedHome,
      "store-shared-header",
    ).scene;
    const transition = pages.prepareSceneUpdate(currentHome, updatedHome);
    const beforeCustom = transition.before.document.pages.find(
      (page) => page.id === custom.id,
    );
    const beforeHeader = Object.values(beforeCustom?.scene.nodes ?? {}).find(
      (node) => node.extensions?.sharedChromeRole === "header",
    );

    transactions.run(
      {
        label: "Update shared header",
        steps: [
          {
            id: "page-document",
            label: "Update page document",
            execute: () => pages.restore(transition.after),
            rollback: () => pages.restore(transition.before),
          },
          {
            id: "scene-tree",
            label: "Update active scene",
            execute: ({ sceneGraph }) => sceneGraph.deserializeTree(transition.scene),
            rollback: ({ sceneGraph }) => sceneGraph.deserializeTree(currentHome),
          },
        ],
        validators: [
          {
            id: "schema",
            validate: ({ sceneGraph }) => schemas.assertTree(sceneGraph.serializeTree()),
          },
        ],
      },
      { sceneGraph: graph },
    );

    const changedCustom = pages.getSnapshot().document.pages.find(
      (page) => page.id === custom.id,
    );
    const changedHeader = Object.values(changedCustom?.scene.nodes ?? {}).find(
      (node) => node.extensions?.sharedChromeRole === "header",
    );
    expect(changedHeader?.style.fills).toEqual([
      { type: "solid", color: "#123456" },
    ]);
    expect(history.getSnapshot().undoDepth).toBe(1);

    history.undo({ sceneGraph: graph });
    const restoredCustom = pages.getSnapshot().document.pages.find(
      (page) => page.id === custom.id,
    );
    const restoredHeader = Object.values(restoredCustom?.scene.nodes ?? {}).find(
      (node) => node.extensions?.sharedChromeRole === "header",
    );
    expect(restoredHeader?.style.fills).toEqual(beforeHeader?.style.fills);
    expect(graph.serializeTree()).toEqual(currentHome);

    history.redo({ sceneGraph: graph });
    const redoneCustom = pages.getSnapshot().document.pages.find(
      (page) => page.id === custom.id,
    );
    const redoneHeader = Object.values(redoneCustom?.scene.nodes ?? {}).find(
      (node) => node.extensions?.sharedChromeRole === "header",
    );
    expect(redoneHeader?.style.fills).toEqual([
      { type: "solid", color: "#123456" },
    ]);
  });
});
