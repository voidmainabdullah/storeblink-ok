import { create } from "zustand";
import type {
  CanvasTool,
  ContextMenuState,
  Device,
  EditorElement,
  InspectorTab,
  SaveState,
  SelectedRect,
  Updater,
} from "@/editor/types/editor";
import type { SectionKey } from "@/lib/storeTheme";

const resolveUpdate = <T,>(update: Updater<T>, previous: T): T =>
  typeof update === "function" ? (update as (value: T) => T)(previous) : update;

const readStoredWidth = (key: string, fallback: number) => {
  if (typeof window === "undefined") return fallback;
  const value = Number(window.localStorage.getItem(key));
  return Number.isFinite(value) && value > 0 ? value : fallback;
};

export interface EditorUIState {
  loading: boolean;
  setLoading: (value: Updater<boolean>) => void;
  saving: boolean;
  setSaving: (value: Updater<boolean>) => void;
  aiLoading: "style" | "copy" | "any" | null;
  setAiLoading: (value: Updater<"style" | "copy" | "any" | null>) => void;
  previewKey: number;
  setPreviewKey: (value: Updater<number>) => void;
  items: any[];
  setItems: (value: Updater<any[]>) => void;

  device: Device;
  setDevice: (value: Updater<Device>) => void;
  previewW: number;
  setPreviewW: (value: Updater<number>) => void;
  previewH: number;
  setPreviewH: (value: Updater<number>) => void;
  zoom: number;
  setZoom: (value: Updater<number>) => void;
  canvasTool: CanvasTool;
  setCanvasTool: (value: Updater<CanvasTool>) => void;
  showGrid: boolean;
  setShowGrid: (value: Updater<boolean>) => void;

  sidebarOpen: boolean;
  setSidebarOpen: (value: Updater<boolean>) => void;
  leftWidth: number;
  setLeftWidth: (value: Updater<number>) => void;
  rightWidth: number;
  setRightWidth: (value: Updater<number>) => void;
  resizing: "left" | "right" | null;
  setResizing: (value: Updater<"left" | "right" | null>) => void;
  activeSection: SectionKey | null;
  setActiveSection: (value: Updater<SectionKey | null>) => void;
  activeTab: string;
  setActiveTab: (value: Updater<string>) => void;
  inspectorTab: InspectorTab;
  setInspectorTab: (value: Updater<InspectorTab>) => void;
  showHelp: boolean;
  setShowHelp: (value: Updater<boolean>) => void;
  paletteOpen: boolean;
  setPaletteOpen: (value: Updater<boolean>) => void;

  selectedEl: EditorElement | null;
  selectedRect: SelectedRect | null;
  contextMenu: ContextMenuState | null;
  setContextMenu: (value: Updater<ContextMenuState | null>) => void;
  selectElement: (element: EditorElement | null, rect?: SelectedRect | null) => void;
  setSelectedEl: (element: EditorElement | null) => void;
  clearSelection: () => void;

  aiPrompt: string;
  setAiPrompt: (value: Updater<string>) => void;
  knownElements: EditorElement[];
  setKnownElements: (value: Updater<EditorElement[]>) => void;
  elementNotes: Record<string, string>;
  setElementNotes: (value: Updater<Record<string, string>>) => void;

  canUndo: boolean;
  setCanUndo: (value: Updater<boolean>) => void;
  canRedo: boolean;
  setCanRedo: (value: Updater<boolean>) => void;
  saveState: SaveState;
  setSaveState: (value: Updater<SaveState>) => void;
}

export const createEditorUIStore = () =>
  create<EditorUIState>()((set, get) => ({
    loading: true,
    setLoading: (value) => set((state) => ({ loading: resolveUpdate(value, state.loading) })),
    saving: false,
    setSaving: (value) => set((state) => ({ saving: resolveUpdate(value, state.saving) })),
    aiLoading: null,
    setAiLoading: (value) => set((state) => ({ aiLoading: resolveUpdate(value, state.aiLoading) })),
    previewKey: 0,
    setPreviewKey: (value) => set((state) => ({ previewKey: resolveUpdate(value, state.previewKey) })),
    items: [],
    setItems: (value) => set((state) => ({ items: resolveUpdate(value, state.items) })),

    device: "desktop",
    setDevice: (value) => set((state) => ({ device: resolveUpdate(value, state.device) })),
    previewW: 1280,
    setPreviewW: (value) => set((state) => ({ previewW: resolveUpdate(value, state.previewW) })),
    previewH: 900,
    setPreviewH: (value) => set((state) => ({ previewH: resolveUpdate(value, state.previewH) })),
    zoom: 75,
    setZoom: (value) => set((state) => ({ zoom: resolveUpdate(value, state.zoom) })),
    canvasTool: "select",
    setCanvasTool: (value) => set((state) => ({ canvasTool: resolveUpdate(value, state.canvasTool) })),
    showGrid: false,
    setShowGrid: (value) => set((state) => ({ showGrid: resolveUpdate(value, state.showGrid) })),

    sidebarOpen: true,
    setSidebarOpen: (value) => set((state) => ({ sidebarOpen: resolveUpdate(value, state.sidebarOpen) })),
    leftWidth: readStoredWidth("sb-left-w", 264),
    setLeftWidth: (value) => set((state) => ({ leftWidth: resolveUpdate(value, state.leftWidth) })),
    rightWidth: readStoredWidth("sb-right-w", 336),
    setRightWidth: (value) => set((state) => ({ rightWidth: resolveUpdate(value, state.rightWidth) })),
    resizing: null,
    setResizing: (value) => set((state) => ({ resizing: resolveUpdate(value, state.resizing) })),
    activeSection: "hero",
    setActiveSection: (value) => set((state) => ({ activeSection: resolveUpdate(value, state.activeSection) })),
    activeTab: "branding",
    setActiveTab: (value) => set((state) => ({ activeTab: resolveUpdate(value, state.activeTab) })),
    inspectorTab: "style",
    setInspectorTab: (value) => set((state) => ({ inspectorTab: resolveUpdate(value, state.inspectorTab) })),
    showHelp: false,
    setShowHelp: (value) => set((state) => ({ showHelp: resolveUpdate(value, state.showHelp) })),
    paletteOpen: false,
    setPaletteOpen: (value) => set((state) => ({ paletteOpen: resolveUpdate(value, state.paletteOpen) })),

    selectedEl: null,
    selectedRect: null,
    contextMenu: null,
    setContextMenu: (value) => set((state) => ({ contextMenu: resolveUpdate(value, state.contextMenu) })),
    selectElement: (element, rect) =>
      set((state) => {
        const sameElement =
          state.selectedEl?.id === element?.id &&
          state.selectedEl?.label === element?.label &&
          state.selectedEl?.tag === element?.tag &&
          state.selectedEl?.text === element?.text &&
          state.selectedEl?.kind === element?.kind &&
          state.selectedEl?.childCount === element?.childCount;
        const nextRect = rect ?? null;
        const sameRect =
          state.selectedRect?.x === nextRect?.x &&
          state.selectedRect?.y === nextRect?.y &&
          state.selectedRect?.width === nextRect?.width &&
          state.selectedRect?.height === nextRect?.height;

        return {
          selectedEl: sameElement ? state.selectedEl : element,
          selectedRect: sameRect ? state.selectedRect : nextRect,
          contextMenu: state.contextMenu ? null : state.contextMenu,
          inspectorTab: element ? (state.inspectorTab === "style" ? state.inspectorTab : "style") : state.inspectorTab,
        };
      }),
    setSelectedEl: (element) => get().selectElement(element, null),
    clearSelection: () => get().selectElement(null, null),

    aiPrompt: "",
    setAiPrompt: (value) => set((state) => ({ aiPrompt: resolveUpdate(value, state.aiPrompt) })),
    knownElements: [],
    setKnownElements: (value) => set((state) => ({ knownElements: resolveUpdate(value, state.knownElements) })),
    elementNotes: {},
    setElementNotes: (value) => set((state) => ({ elementNotes: resolveUpdate(value, state.elementNotes) })),

    canUndo: false,
    setCanUndo: (value) => set((state) => ({ canUndo: resolveUpdate(value, state.canUndo) })),
    canRedo: false,
    setCanRedo: (value) => set((state) => ({ canRedo: resolveUpdate(value, state.canRedo) })),
    saveState: "idle",
    setSaveState: (value) => set((state) => ({ saveState: resolveUpdate(value, state.saveState) })),
  }));
