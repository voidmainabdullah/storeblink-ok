import { create } from "zustand";

export type ColorModePreference = "system" | "light" | "dark";

export type PreferencesStoreState = {
  colorMode: ColorModePreference;
  reducedMotion: boolean;
  autosaveEnabled: boolean;
  panelWidths: {
    left: number;
    right: number;
  };
  setColorMode: (mode: ColorModePreference) => void;
  setReducedMotion: (enabled: boolean) => void;
  setAutosaveEnabled: (enabled: boolean) => void;
  setPanelWidth: (side: "left" | "right", width: number) => void;
  resetPreferences: () => void;
};

const defaultPreferences = {
  colorMode: "system" as ColorModePreference,
  reducedMotion: false,
  autosaveEnabled: true,
  panelWidths: {
    left: 264,
    right: 336,
  },
};

export const usePreferencesStore = create<PreferencesStoreState>()((set) => ({
  ...defaultPreferences,
  setColorMode: (mode) => set({ colorMode: mode }),
  setReducedMotion: (enabled) => set({ reducedMotion: enabled }),
  setAutosaveEnabled: (enabled) => set({ autosaveEnabled: enabled }),
  setPanelWidth: (side, width) =>
    set((state) => ({
      panelWidths: {
        ...state.panelWidths,
        [side]: Math.max(160, Math.round(width)),
      },
    })),
  resetPreferences: () => set(defaultPreferences),
}));
