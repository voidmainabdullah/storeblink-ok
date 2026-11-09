import { create } from "zustand";
import type { Page, Project } from "@/types";
import { validateProject } from "@/engine/validation";

export type ProjectStoreState = {
  project: Project | null;
  currentPageId: string | null;
  setProjectFromEngine: (project: Project | null) => void;
  setCurrentPageFromEngine: (pageId: string | null) => void;
  getCurrentPageSnapshot: () => Page | undefined;
};

export const useProjectStore = create<ProjectStoreState>()((set, get) => ({
  project: null,
  currentPageId: null,
  setProjectFromEngine: (project) => {
    if (!project) {
      set({ project: null, currentPageId: null });
      return;
    }
    const validated = validateProject(project);
    set({
      project: validated,
      currentPageId: validated.pages[0]?.id ?? null,
    });
  },
  setCurrentPageFromEngine: (pageId) => {
    const project = get().project;
    if (pageId && !project?.pages.some((page) => page.id === pageId)) {
      throw new Error(`Page ${pageId} does not exist in the current project.`);
    }
    set({ currentPageId: pageId });
  },
  getCurrentPageSnapshot: () => {
    const { project, currentPageId } = get();
    return project?.pages.find((page) => page.id === currentPageId);
  },
}));
