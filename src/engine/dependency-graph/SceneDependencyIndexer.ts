import type { EngineEventBus, EngineEventMap } from "@/engine/event-bus";
import type { SceneGraphAPI } from "@/engine/scene-graph";
import type { DependencyGraph } from "./DependencyGraph";

export class SceneDependencyIndexer {
  private unsubscriptions: Array<() => void> = [];

  constructor(
    private readonly graph: DependencyGraph,
    private readonly sceneGraph: SceneGraphAPI,
    private readonly eventBus: EngineEventBus<EngineEventMap>,
  ) {}

  init(): void {
    if (this.unsubscriptions.length) return;
    const rebuild = () => this.graph.rebuildScene(this.sceneGraph.serializeTree());
    this.unsubscriptions = [
      this.eventBus.on("scene:node:created", rebuild),
      this.eventBus.on("scene:node:updated", rebuild),
      this.eventBus.on("scene:node:deleted", rebuild),
    ];
    rebuild();
  }

  dispose(): void {
    this.unsubscriptions.forEach((unsubscribe) => unsubscribe());
    this.unsubscriptions = [];
  }
}
