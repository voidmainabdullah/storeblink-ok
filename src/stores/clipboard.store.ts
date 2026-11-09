import { create } from "zustand";

export type ClipboardStoreState = {
  hasContent: boolean;
  setHasContent: (hasContent: boolean) => void;
};

export const useClipboardStore = create<ClipboardStoreState>()((set) => ({
  hasContent: false,
  setHasContent: (hasContent) => set({ hasContent }),
}));
