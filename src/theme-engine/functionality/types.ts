import type { SceneNode } from "@/types";

export const THEME_FUNCTIONALITY_EXTENSION_KEY = "themeFunctionality";

export type ThemeFunctionalitySettings = {
  version: 1;
  productCarousel: {
    enabled: boolean;
    loop: boolean;
  };
  search: {
    enabled: boolean;
    predictive: boolean;
    maximumSuggestions: number;
  };
  categories: {
    enabled: boolean;
    showButtons: boolean;
    showDropdown: boolean;
  };
};

export type ThemeProductCarouselGroup = {
  sectionId: string;
  itemIds: string[];
  previousControlId: string | null;
  nextControlId: string | null;
  categoryControlId: string | null;
};

export type ThemeFunctionalityAudit = {
  settings: ThemeFunctionalitySettings;
  carousels: ThemeProductCarouselGroup[];
  actionableButtons: SceneNode[];
  inactiveButtons: SceneNode[];
};
