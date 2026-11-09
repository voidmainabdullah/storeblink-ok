import { create } from "zustand";

export type HistoryStoreState = {
  canUndo: boolean;
  canRedo: boolean;
  setAvailability: (next: Pick<HistoryStoreState, "canUndo" | "canRedo">) => void;
};

export const useHistoryStore = create<HistoryStoreState>()((set) => ({
  canUndo: false,
  canRedo: false,
  setAvailability: (next) => set(next),
}));
