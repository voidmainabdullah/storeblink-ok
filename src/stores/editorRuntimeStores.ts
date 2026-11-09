import { createCanvasStore, useCanvasStore, type CanvasStore } from "./canvas.store";
import { createResponsiveStore, useResponsiveStore, type ResponsiveStore } from "./responsive.store";
import { createSceneStore, useSceneStore, type SceneStore } from "./scene.store";
import { createSelectionStore, useSelectionStore, type SelectionStore } from "./selection.store";
import { createToolStore, useToolStore, type ToolStore } from "./tool.store";
import { createTransformStore, useTransformStore, type TransformStore } from "./transform.store";
import { createViewportStore, useViewportStore, type ViewportStore } from "./viewport.store";

export type EditorRuntimeStores = Readonly<{
  scene: SceneStore;
  selection: SelectionStore;
  transform: TransformStore;
  viewport: ViewportStore;
  canvas: CanvasStore;
  responsive: ResponsiveStore;
  tool: ToolStore;
}>;

export const createEditorRuntimeStores = (): EditorRuntimeStores => Object.freeze({
  scene: createSceneStore(),
  selection: createSelectionStore(),
  transform: createTransformStore(),
  viewport: createViewportStore(),
  canvas: createCanvasStore(),
  responsive: createResponsiveStore(),
  tool: createToolStore(),
});

export const legacyEditorRuntimeStores: EditorRuntimeStores = Object.freeze({
  scene: useSceneStore,
  selection: useSelectionStore,
  transform: useTransformStore,
  viewport: useViewportStore,
  canvas: useCanvasStore,
  responsive: useResponsiveStore,
  tool: useToolStore,
});
