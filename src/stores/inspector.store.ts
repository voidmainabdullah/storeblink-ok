import { create } from "zustand";

export type InspectorStoreState = {
  expandedGroups: string[];
  activeTab: string | null;
  toggleGroup: (group: string) => void;
  setExpandedGroups: (groups: string[]) => void;
  setActiveTab: (tab: string | null) => void;
};

export const useInspectorStore = create<InspectorStoreState>()((set) => ({
  expandedGroups: ["dimensions", "fill", "typography"],
  activeTab: "style",
  toggleGroup: (group) =>
    set((state) => ({
      expandedGroups: state.expandedGroups.includes(group)
        ? state.expandedGroups.filter((current) => current !== group)
        : [...state.expandedGroups, group],
    })),
  setExpandedGroups: (expandedGroups) => set({ expandedGroups }),
  setActiveTab: (activeTab) => set({ activeTab }),
}));
