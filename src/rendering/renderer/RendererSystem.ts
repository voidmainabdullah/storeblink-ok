import type { ReactNode } from "react";
import type { EngineEventBus, EngineEventMap } from "@/engine/event-bus";
import { renderRegisteredNode } from "@/rendering/registry";
import type { NodeId, SceneNode } from "@/types";

export type RendererInvalidationListener = (nodeIds: NodeId[]) => void;

export class RendererSystem {
  private invalidatedNodeIds = new Set<NodeId>();
  private listeners = new Set<RendererInvalidationListener>();
  private frameId: number | null = null;
  private disconnectEventBus: (() => void) | null = null;

  renderNode(node: SceneNode): ReactNode {
    return renderRegisteredNode(node);
  }

  invalidate(nodeId: NodeId): void {
    this.invalidatedNodeIds.add(nodeId);
    this.scheduleFlush();
  }

  flush(): void {
    if (this.frameId !== null && typeof window !== "undefined") {
      window.cancelAnimationFrame(this.frameId);
      this.frameId = null;
    }
    if (!this.invalidatedNodeIds.size) return;

    const nodeIds = Array.from(this.invalidatedNodeIds);
    this.invalidatedNodeIds.clear();
    this.listeners.forEach((listener) => listener(nodeIds));
  }

  subscribe(listener: RendererInvalidationListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  connectEventBus(eventBus: EngineEventBus<EngineEventMap>): () => void {
    this.disconnectEventBus?.();
    const unsubscribers = [
      eventBus.on("scene:node:created", ({ node }) => this.invalidate(node.id)),
      eventBus.on("scene:node:updated", ({ nodeId }) => this.invalidate(nodeId)),
      eventBus.on("scene:node:deleted", ({ nodeId }) => this.invalidate(nodeId)),
      eventBus.on("scene:node:moved", ({ nodeId }) => this.invalidate(nodeId)),
    ];
    const disconnect = () => unsubscribers.forEach((unsubscribe) => unsubscribe());
    this.disconnectEventBus = disconnect;
    return disconnect;
  }

  dispose(): void {
    this.disconnectEventBus?.();
    this.disconnectEventBus = null;
    if (this.frameId !== null && typeof window !== "undefined") window.cancelAnimationFrame(this.frameId);
    this.frameId = null;
    this.invalidatedNodeIds.clear();
    this.listeners.clear();
  }

  private scheduleFlush(): void {
    if (this.frameId !== null) return;
    if (typeof window === "undefined") return;
    this.frameId = window.requestAnimationFrame(() => {
      this.frameId = null;
      this.flush();
    });
  }
}

export const createRendererSystem = () => new RendererSystem();

export const rendererSystem = createRendererSystem();
