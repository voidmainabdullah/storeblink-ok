import { create } from "zustand";

export type PaletteStoreState = {
  recentColors: string[];
  brandColors: string[];
  setRecentColorsFromPaletteSystem: (recentColors: string[]) => void;
  setBrandColorsFromPaletteSystem: (brandColors: string[]) => void;
};

export const usePaletteStore = create<PaletteStoreState>()((set) => ({
  recentColors: [],
  brandColors: [],
  setRecentColorsFromPaletteSystem: (recentColors) => set({ recentColors }),
  setBrandColorsFromPaletteSystem: (brandColors) => set({ brandColors }),
}));
