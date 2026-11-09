import { useSyncExternalStore } from "react";
import { EDITOR_SYSTEM_KEYS } from "@/engine/kernel/systemKeys";
import { useEngineContext, useOptionalEngineContext } from "@/engine/kernel/useEngine";
import type { EditorMode, EditorModeSystemAPI } from "./EditorModeSystem";

const subscribeFixed = () => () => undefined;
const getFixedSnapshot = (): EditorMode => "fixed";

export const useEditorMode = (): EditorMode => {
  const engine = useEngineContext();
  const system = engine.resolveSystem<EditorModeSystemAPI>(EDITOR_SYSTEM_KEYS.editorMode);
  return useSyncExternalStore(system.subscribe, system.getSnapshot, system.getSnapshot);
};

export const useOptionalEditorMode = (): EditorMode => {
  const engine = useOptionalEngineContext();
  const system = engine?.tryResolveSystem<EditorModeSystemAPI>(EDITOR_SYSTEM_KEYS.editorMode);
  return useSyncExternalStore(
    system?.subscribe ?? subscribeFixed,
    system?.getSnapshot ?? getFixedSnapshot,
    system?.getSnapshot ?? getFixedSnapshot,
  );
};
