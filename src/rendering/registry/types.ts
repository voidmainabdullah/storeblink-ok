import type { ComponentType, ReactNode } from "react";
import type { ElementType, SceneNode } from "@/types";

export type ElementRendererProps = {
  node: SceneNode;
};

export type ElementRenderer = ComponentType<ElementRendererProps>;

export type RendererRegistryAPI = {
  register(type: ElementType, renderer: ElementRenderer): () => void;
  has(type: ElementType): boolean;
  get(type: ElementType): ElementRenderer;
  renderNode(node: SceneNode): ReactNode;
  clear(): void;
};
