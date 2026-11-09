import { create } from "zustand";

export type ResponsiveBreakpoint = "desktop" | "tablet" | "mobile";

export type ResponsiveStoreState = {
  activeBreakpoint: ResponsiveBreakpoint;
  setActiveBreakpointFromResponsiveSystem: (activeBreakpoint: ResponsiveBreakpoint) => void;
};

export const createResponsiveStore = () => create<ResponsiveStoreState>()((set) => ({
  activeBreakpoint: "desktop",
  setActiveBreakpointFromResponsiveSystem: (activeBreakpoint) => set({ activeBreakpoint }),
}));

export type ResponsiveStore = ReturnType<typeof createResponsiveStore>;
export const useResponsiveStore = createResponsiveStore();
