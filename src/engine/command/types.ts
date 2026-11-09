import type { SceneGraphAPI } from "@/engine/scene-graph";
import type { LayoutData, NodeId, TransformData } from "@/types";

export type CommandContext = {
  sceneGraph: SceneGraphAPI;
};

export type Command<TPayload = unknown> = {
  id: string;
  type: string;
  label: string;
  timestamp: number;
  payload: TPayload;
  execute(ctx: CommandContext): void;
  undo(ctx: CommandContext): void;
  redo?(ctx: CommandContext): void;
  merge?(next: Command): Command | null;
};

export type TransformKind = "move" | "resize" | "rotate" | "scale";

export type TransformCommandChange = {
  nodeId: NodeId;
  before: TransformData;
  after: TransformData;
  propsBefore?: Record<string, unknown>;
  propsAfter?: Record<string, unknown>;
  layoutBefore?: LayoutData;
  layoutAfter?: LayoutData;
};

export type TransformCommandPayload = {
  kind: TransformKind;
  changes: TransformCommandChange[];
};
