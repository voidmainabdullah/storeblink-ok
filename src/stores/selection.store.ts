import { create } from "zustand";
import type { NodeId } from "@/types";

export type SelectionStoreState = {
  selectedIds: NodeId[];
  hoveredId: NodeId | null;
  activeId: NodeId | null;
  editingId: NodeId | null;
  setSelectedFromSelectionSystem: (selectedIds: NodeId[]) => void;
  setHoveredFromSelectionSystem: (hoveredId: NodeId | null) => void;
  setEditingFromSelectionSystem: (editingId: NodeId | null) => void;
  clearSelectionFromSelectionSystem: () => void;
  pruneNodeFromSelectionSystem: (nodeId: NodeId) => void;
  getSelectionSnapshot: () => {
    selectedIds: NodeId[];
    hoveredId: NodeId | null;
    activeId: NodeId | null;
    editingId: NodeId | null;
  };
};

const getActiveId = (selectedIds: NodeId[]) => selectedIds[selectedIds.length - 1] ?? null;

export const createSelectionStore = () => create<SelectionStoreState>()((set, get) => ({
  selectedIds: [],
  hoveredId: null,
  activeId: null,
  editingId: null,
  setSelectedFromSelectionSystem: (selectedIds) =>
    set((state) => {
      const nextSelectedIds = [...selectedIds];
      return {
        selectedIds: nextSelectedIds,
        activeId: getActiveId(nextSelectedIds),
        editingId: state.editingId && nextSelectedIds.includes(state.editingId) ? state.editingId : null,
      };
    }),
  setHoveredFromSelectionSystem: (hoveredId) => set({ hoveredId }),
  setEditingFromSelectionSystem: (editingId) => set({ editingId }),
  clearSelectionFromSelectionSystem: () => set({ selectedIds: [], activeId: null, editingId: null }),
  pruneNodeFromSelectionSystem: (nodeId) =>
    set((state) => {
      const selectedIds = state.selectedIds.filter((id) => id !== nodeId);
      return {
        selectedIds,
        activeId: getActiveId(selectedIds),
        hoveredId: state.hoveredId === nodeId ? null : state.hoveredId,
        editingId: state.editingId === nodeId ? null : state.editingId,
      };
    }),
  getSelectionSnapshot: () => {
    const { selectedIds, hoveredId, activeId, editingId } = get();
    return { selectedIds: [...selectedIds], hoveredId, activeId, editingId };
  },
}));

export type SelectionStore = ReturnType<typeof createSelectionStore>;
export const useSelectionStore = createSelectionStore();
