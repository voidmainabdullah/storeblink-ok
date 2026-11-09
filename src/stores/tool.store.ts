import { create } from "zustand";

export type EditorTool = "select" | "hand";

export type ToolStoreState = {
  activeTool: EditorTool;
  setActiveToolFromToolSystem: (activeTool: EditorTool) => void;
  getToolSnapshot: () => { activeTool: EditorTool };
};

export const createToolStore = () => create<ToolStoreState>()((set, get) => ({
  activeTool: "select",
  setActiveToolFromToolSystem: (activeTool) => set({ activeTool }),
  getToolSnapshot: () => ({ activeTool: get().activeTool }),
}));

export type ToolStore = ReturnType<typeof createToolStore>;
export const useToolStore = createToolStore();
