import type { EngineEventBus, EngineEventMap } from "@/engine/event-bus";
import type { SceneGraphAPI } from "@/engine/scene-graph";
import { getTransformedOBB, polygonToAABB, unionBounds } from "@/rendering/geometry";
import { getWorldTransform } from "@/rendering/coordinate";
import { useSelectionStore, type SelectionStore } from "@/stores/selection.store";
import type { NodeId, Rect, SceneNode } from "@/types";

export type SelectionStateSystemOptions = {
  sceneGraph?: SceneGraphAPI;
  eventBus?: EngineEventBus<EngineEventMap>;
  store?: SelectionStore;
};

export type SelectionAPI = {
  select(ids: NodeId[], options?: { includeHidden?: boolean; includeLocked?: boolean }): void;
  toggleSelection(id: NodeId): void;
  clearSelection(): void;
  setHovered(id: NodeId | null): void;
  setEditing(id: NodeId | null): void;
  getSelected(): NodeId[];
  getActive(): NodeId | null;
  getHovered(): NodeId | null;
  getEditing(): NodeId | null;
  isSelected(id: NodeId): boolean;
  getSelectionBounds(): Rect | null;
};

export const canSelect = (node: SceneNode | undefined): boolean => Boolean(node && !node.meta.locked && !node.meta.hidden);

const unique = (ids: NodeId[]): NodeId[] => [...new Set(ids)];

export class SelectionSystem implements SelectionAPI {
  private sceneGraph?: SceneGraphAPI;
  private store: SelectionStore;
  private unsubscribers: Array<() => void> = [];

  constructor(options: SelectionStateSystemOptions = {}) {
    this.store = options.store ?? useSelectionStore;
    this.configure(options);
  }

  configure(options: SelectionStateSystemOptions): void {
    this.dispose();
    this.sceneGraph = options.sceneGraph ?? this.sceneGraph;
    this.store = options.store ?? this.store;
    if (options.eventBus) {
      this.unsubscribers.push(options.eventBus.on("scene:node:deleted", ({ nodeId }) => this.pruneNode(nodeId)));
    }
    this.pruneInvalidSelections();
  }

  select(ids: NodeId[], options: { includeHidden?: boolean; includeLocked?: boolean } = {}): void {
    const selectedIds = this.normalizeSelection(ids, options);
    this.store.getState().setSelectedFromSelectionSystem(selectedIds);
  }

  toggleSelection(id: NodeId): void {
    if (!canSelect(this.sceneGraph?.getNode(id))) return;
    const selectedIds = this.getSelected();
    if (selectedIds.includes(id)) {
      this.select(selectedIds.filter((selectedId) => selectedId !== id));
      return;
    }
    this.select([...selectedIds, id]);
  }

  clearSelection(): void {
    this.store.getState().clearSelectionFromSelectionSystem();
  }

  setHovered(id: NodeId | null): void {
    if (!id) {
      this.store.getState().setHoveredFromSelectionSystem(null);
      return;
    }
    this.store.getState().setHoveredFromSelectionSystem(canSelect(this.sceneGraph?.getNode(id)) ? id : null);
  }

  setEditing(id: NodeId | null): void {
    if (!id) {
      this.store.getState().setEditingFromSelectionSystem(null);
      return;
    }
    this.store.getState().setEditingFromSelectionSystem(canSelect(this.sceneGraph?.getNode(id)) ? id : null);
  }

  getSelected(): NodeId[] {
    return this.store.getState().getSelectionSnapshot().selectedIds;
  }

  getActive(): NodeId | null {
    return this.store.getState().activeId;
  }

  getHovered(): NodeId | null {
    return this.store.getState().hoveredId;
  }

  getEditing(): NodeId | null {
    return this.store.getState().editingId;
  }

  isSelected(id: NodeId): boolean {
    return this.getSelected().includes(id);
  }

  getSelectionBounds(): Rect | null {
    if (!this.sceneGraph) return null;
    const rects = this.getSelected()
      .map((id) => this.sceneGraph?.getNode(id))
      .filter((node): node is SceneNode => canSelect(node))
      .map((node) => polygonToAABB(getTransformedOBB(node, getWorldTransform(node, this.sceneGraph as SceneGraphAPI))));

    return rects.length ? unionBounds(rects) : null;
  }

  pruneInvalidSelections(): void {
    const selectedIds = this.getSelected().filter((id) => canSelect(this.sceneGraph?.getNode(id)));
    this.store.getState().setSelectedFromSelectionSystem(selectedIds);
    const hoveredId = this.getHovered();
    if (hoveredId && !canSelect(this.sceneGraph?.getNode(hoveredId))) {
      this.store.getState().setHoveredFromSelectionSystem(null);
    }
  }

  pruneNode(nodeId: NodeId): void {
    this.store.getState().pruneNodeFromSelectionSystem(nodeId);
  }

  dispose(): void {
    this.unsubscribers.forEach((unsubscribe) => unsubscribe());
    this.unsubscribers = [];
  }

  private normalizeSelection(
    ids: NodeId[],
    options: { includeHidden?: boolean; includeLocked?: boolean } = {},
  ): NodeId[] {
    const selectedIds = unique(ids).filter((id) => {
      const node = this.sceneGraph?.getNode(id);
      if (!node) return false;
      if (!options.includeHidden && node.meta.hidden) return false;
      if (!options.includeLocked && node.meta.locked) return false;
      return true;
    });
    if (!this.sceneGraph || selectedIds.length < 2) return selectedIds;

    const selectedSet = new Set(selectedIds);
    return selectedIds.filter((id) => {
      const descendants = this.sceneGraph?.getDescendants(id) ?? [];
      return !descendants.some((descendant) => selectedSet.has(descendant.id));
    });
  }
}

export const createSelectionSystem = (options?: SelectionStateSystemOptions) => new SelectionSystem(options);

export const selectionSystem = createSelectionSystem();
