import type { NodeId, SceneNode } from "@/types";

export type SceneNodeCreatedEvent = {
  node: SceneNode;
  parentId: NodeId | null;
  index: number | null;
};

export type SceneNodeUpdatedEvent = {
  nodeId: NodeId;
  node: SceneNode;
  previousNode: SceneNode;
};

export type SceneNodeDeletedEvent = {
  nodeId: NodeId;
  node: SceneNode;
  parentId: NodeId | null;
};

export type SceneNodeMovedEvent = {
  nodeId: NodeId;
  previousParentId: NodeId | null;
  nextParentId: NodeId | null;
  previousIndex: number;
  nextIndex: number;
};

export type EngineEventMap = {
  "scene:node:created": SceneNodeCreatedEvent;
  "scene:node:updated": SceneNodeUpdatedEvent;
  "scene:node:deleted": SceneNodeDeletedEvent;
  "scene:node:moved": SceneNodeMovedEvent;
};

export type EngineEventName = keyof EngineEventMap & string;

export type EngineEventHandler<TPayload> = (payload: Readonly<TPayload>) => void;
