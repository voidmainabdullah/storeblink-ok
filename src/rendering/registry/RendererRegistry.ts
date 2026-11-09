import { createElement } from "react";
import type { ElementType, SceneNode } from "@/types";
import { FallbackRenderer } from "./FallbackRenderer";
import type { ElementRenderer, RendererRegistryAPI } from "./types";

export class RendererRegistry implements RendererRegistryAPI {
  private readonly renderers = new Map<ElementType, ElementRenderer>();

  register(type: ElementType, renderer: ElementRenderer): () => void {
    this.renderers.set(type, renderer);
    return () => {
      if (this.renderers.get(type) === renderer) {
        this.renderers.delete(type);
      }
    };
  }

  has(type: ElementType): boolean {
    return this.renderers.has(type);
  }

  get(type: ElementType): ElementRenderer {
    return this.renderers.get(type) ?? FallbackRenderer;
  }

  renderNode(node: SceneNode) {
    return createElement(this.get(node.type), { node, key: node.id });
  }

  clear(): void {
    this.renderers.clear();
  }
}

export const rendererRegistry = new RendererRegistry();

export const registerRenderer = (type: ElementType, renderer: ElementRenderer) =>
  rendererRegistry.register(type, renderer);

export const getRenderer = (type: ElementType) => rendererRegistry.get(type);

export const renderRegisteredNode = (node: SceneNode) => rendererRegistry.renderNode(node);
