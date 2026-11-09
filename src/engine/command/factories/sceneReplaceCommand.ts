import { cloneSceneTree } from "@/engine/scene-graph";
import type { Command } from "@/engine/command/types";
import type { SceneTree } from "@/types";

export type SceneReplaceCommandPayload = {
  label: string;
};

export const createSceneReplaceCommand = (
  before: SceneTree,
  after: SceneTree,
  label: string,
): Command<SceneReplaceCommandPayload> => {
  const beforeTree = cloneSceneTree(before);
  const afterTree = cloneSceneTree(after);
  return {
    id: `scene-replace-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    type: "scene:replace",
    label,
    timestamp: Date.now(),
    payload: { label },
    execute: (ctx) => ctx.sceneGraph.deserializeTree(cloneSceneTree(afterTree)),
    undo: (ctx) => ctx.sceneGraph.deserializeTree(cloneSceneTree(beforeTree)),
  };
};
