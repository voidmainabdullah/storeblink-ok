import { useToolStore, type EditorTool, type ToolStore } from "@/stores/tool.store";

export type ToolSystemAPI = {
  activate(tool: EditorTool): void;
  getActiveTool(): EditorTool;
  isActive(tool: EditorTool): boolean;
  reset(): void;
  subscribe(listener: (tool: EditorTool) => void): () => void;
};

export class ToolSystem implements ToolSystemAPI {
  constructor(private readonly store: ToolStore = useToolStore) {}

  activate(tool: EditorTool): void {
    if (this.store.getState().activeTool === tool) return;
    this.store.getState().setActiveToolFromToolSystem(tool);
  }

  getActiveTool(): EditorTool {
    return this.store.getState().activeTool;
  }

  isActive(tool: EditorTool): boolean {
    return this.getActiveTool() === tool;
  }

  reset(): void {
    this.activate("select");
  }

  subscribe(listener: (tool: EditorTool) => void): () => void {
    return this.store.subscribe((state, previous) => {
      if (state.activeTool !== previous.activeTool) listener(state.activeTool);
    });
  }
}

export const createToolSystem = (store?: ToolStore) => new ToolSystem(store);
export const toolSystem = createToolSystem();
