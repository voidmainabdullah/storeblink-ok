import { describe, expect, it } from "vitest";
import type { CommandManager } from "@/engine/command";
import { createFieldUpdateCommand } from "@/engine/command";
import type { HistoryManager } from "@/engine/history";
import { createSceneNode, type SceneGraphAPI } from "@/engine/scene-graph";
import type { SelectionSystem } from "@/interaction/selection";
import type { TransformSystem } from "@/interaction/transform";
import type { EditorModeSystemAPI } from "@/interaction/modes";
import type { EditorRuntimeStores } from "@/stores/editorRuntimeStores";
import type { TelemetrySystem } from "@/infrastructure/telemetry";
import type { EditorDocumentMigrationSystem } from "@/engine/migration";
import type { EditorRecoverySystem } from "@/persistence/recovery";
import { createEditorKernel } from "./createEditorKernel";
import { EDITOR_SYSTEM_KEYS } from "./systemKeys";

describe("createEditorKernel", () => {
  it("registers private command and history services per kernel", () => {
    const first = createEditorKernel();
    const second = createEditorKernel();

    const firstHistory = first.resolve<HistoryManager>(EDITOR_SYSTEM_KEYS.history);
    const secondHistory = second.resolve<HistoryManager>(EDITOR_SYSTEM_KEYS.history);
    const firstCommands = first.resolve<CommandManager>(EDITOR_SYSTEM_KEYS.commands);
    const secondCommands = second.resolve<CommandManager>(EDITOR_SYSTEM_KEYS.commands);
    const firstMigrations = first.resolve<EditorDocumentMigrationSystem>(EDITOR_SYSTEM_KEYS.migrations);
    const secondMigrations = second.resolve<EditorDocumentMigrationSystem>(EDITOR_SYSTEM_KEYS.migrations);
    const firstRecovery = first.resolve<EditorRecoverySystem>(EDITOR_SYSTEM_KEYS.recovery);
    const secondRecovery = second.resolve<EditorRecoverySystem>(EDITOR_SYSTEM_KEYS.recovery);

    expect(firstHistory).not.toBe(secondHistory);
    expect(firstCommands).not.toBe(secondCommands);
    expect(firstCommands.history).toBe(firstHistory);
    expect(secondCommands.history).toBe(secondHistory);
    expect(firstMigrations).not.toBe(secondMigrations);
    expect(firstRecovery).not.toBe(secondRecovery);
  });

  it("isolates document, selection, transform preview, viewport, and history state", () => {
    const first = createEditorKernel();
    const second = createEditorKernel();
    const firstGraph = first.resolve<SceneGraphAPI>(EDITOR_SYSTEM_KEYS.commandSceneGraph);
    const secondGraph = second.resolve<SceneGraphAPI>(EDITOR_SYSTEM_KEYS.commandSceneGraph);
    const firstStores = first.resolve<EditorRuntimeStores>(EDITOR_SYSTEM_KEYS.stores);
    const secondStores = second.resolve<EditorRuntimeStores>(EDITOR_SYSTEM_KEYS.stores);
    const root = createSceneNode({ id: "root", type: "section", name: "Root" }, null);
    const shape = createSceneNode({ id: "shape", type: "shape", name: "Shape" }, root.id);
    root.childIds.push(shape.id);
    firstGraph.deserializeTree({ rootNodeId: root.id, nodes: { root, shape } });

    first.resolve<SelectionSystem>(EDITOR_SYSTEM_KEYS.selection).select([shape.id]);
    first.resolve<CommandManager>(EDITOR_SYSTEM_KEYS.commands).dispatch(
      createFieldUpdateCommand(shape.id, "transform.x", 0, 88),
      { sceneGraph: firstGraph },
    );
    const transform = first.resolve<TransformSystem>(EDITOR_SYSTEM_KEYS.transform);
    first.resolve<EditorModeSystemAPI>(EDITOR_SYSTEM_KEYS.editorMode).setMode("independent");
    transform.beginTransform([shape.id], "move");
    transform.updateTransform({ nodes: { shape: { x: 100 } } });
    transform.flushPreview();
    first.resolve<{ panTo(point: { x: number; y: number }): void }>(EDITOR_SYSTEM_KEYS.viewport).panTo({ x: 30, y: 40 });

    expect(firstStores.scene.getState().nodes.shape.transform.x).toBe(88);
    expect(firstStores.selection.getState().selectedIds).toEqual(["shape"]);
    expect(firstStores.transform.getState().previewTransforms.shape.x).toBe(100);
    expect(firstStores.viewport.getState().pan).toEqual({ x: 30, y: 40 });
    expect(first.resolve<HistoryManager>(EDITOR_SYSTEM_KEYS.history).canUndo()).toBe(true);
    expect(
      first.resolve<TelemetrySystem>(EDITOR_SYSTEM_KEYS.telemetry).list(),
    ).toEqual([
      expect.objectContaining({
        name: "editor.command.executed",
        correlationId: expect.any(String),
      }),
    ]);

    expect(secondGraph.serializeTree()).toEqual({ rootNodeId: null, nodes: {} });
    expect(secondStores.selection.getState().selectedIds).toEqual([]);
    expect(secondStores.transform.getState().previewTransforms).toEqual({});
    expect(secondStores.viewport.getState().pan).toEqual({ x: 0, y: 0 });
    expect(second.resolve<HistoryManager>(EDITOR_SYSTEM_KEYS.history).canUndo()).toBe(false);
    expect(
      second.resolve<TelemetrySystem>(EDITOR_SYSTEM_KEYS.telemetry).list(),
    ).toEqual([]);
    transform.cancelTransform();
  });
});
