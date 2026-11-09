import { createElement } from "react";
import type { ReactNode } from "react";
import type { SceneNode } from "@/types";
import { RenderNode } from "./RenderNode";

export const renderChildren = (node: SceneNode): ReactNode =>
  node.childIds.map((childId) => createElement(RenderNode, { key: childId, nodeId: childId }));
