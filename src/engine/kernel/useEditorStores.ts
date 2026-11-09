import { useStore } from "zustand";
import type { CanvasStoreState } from "@/stores/canvas.store";
import type { ResponsiveStoreState } from "@/stores/responsive.store";
import type { SceneStoreState } from "@/stores/scene.store";
import type { SelectionStoreState } from "@/stores/selection.store";
import type { ToolStoreState } from "@/stores/tool.store";
import type { TransformStoreState } from "@/stores/transform.store";
import type { ViewportStoreState } from "@/stores/viewport.store";
import { legacyEditorRuntimeStores, type EditorRuntimeStores } from "@/stores/editorRuntimeStores";
import { EDITOR_SYSTEM_KEYS } from "./systemKeys";
import { useEngineContext, useOptionalEngineContext } from "./useEngine";

export const useEditorStores = (): EditorRuntimeStores =>
  useEngineContext().resolveSystem<EditorRuntimeStores>(EDITOR_SYSTEM_KEYS.stores);

export const useOptionalEditorStores = (): EditorRuntimeStores =>
  useOptionalEngineContext()?.tryResolveSystem<EditorRuntimeStores>(EDITOR_SYSTEM_KEYS.stores) ?? legacyEditorRuntimeStores;

export const useEngineSceneStore = <T,>(selector: (state: SceneStoreState) => T): T =>
  useStore(useEditorStores().scene, selector);

export const useEngineSelectionStore = <T,>(selector: (state: SelectionStoreState) => T): T =>
  useStore(useEditorStores().selection, selector);

export const useEngineTransformStore = <T,>(selector: (state: TransformStoreState) => T): T =>
  useStore(useEditorStores().transform, selector);

export const useEngineViewportStore = <T,>(selector: (state: ViewportStoreState) => T): T =>
  useStore(useEditorStores().viewport, selector);

export const useEngineCanvasStore = <T,>(selector: (state: CanvasStoreState) => T): T =>
  useStore(useEditorStores().canvas, selector);

export const useEngineResponsiveStore = <T,>(selector: (state: ResponsiveStoreState) => T): T =>
  useStore(useEditorStores().responsive, selector);

export const useEngineToolStore = <T,>(selector: (state: ToolStoreState) => T): T =>
  useStore(useEditorStores().tool, selector);
