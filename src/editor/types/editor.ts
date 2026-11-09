import type { ComponentType } from "react";
import type { StoreTemplate } from "@/components/store/templates";
import type { SectionKey, SpecialSectionItem, StoreTheme } from "@/lib/storeTheme";

export type Updater<T> = T | ((prev: T) => T);

export type Bp = "desktop" | "tablet" | "mobile";

export type Device = "mobile" | "tablet" | "desktop" | "custom";

export type CanvasTool = "select" | "pan";

export type InspectorTab = "style" | "advanced" | "interactions";

export type SaveState = "idle" | "saving" | "saved" | "dirty" | "error";

export type SelectedRect = { x: number; y: number; width: number; height: number };

export type ContextMenuState = { id: string; clientX: number; clientY: number };

export type ElementKind =
  | import("@/lib/storeTheme").CustomBlockKind
  | "frame"
  | "group"
  | "generic";

export type EditorElement = {
  id: string;
  label: string;
  tag?: string;
  replaceable?: boolean;
  text?: string;
  kind?: ElementKind;
  parentId?: string;
  parentTag?: string;
  childCount?: number;
  locked?: boolean;
  hidden?: boolean;
  display?: string;
};

export type InspectorFeature =
  | "blockProps"
  | "text"
  | "media"
  | "typography"
  | "appearance"
  | "spacing"
  | "border"
  | "layout"
  | "responsive"
  | "size"
  | "layer"
  | "motion"
  | "link"
  | "hover"
  | "notes"
  | "ai";

export type InspectorProfile = {
  label: string;
  features: readonly InspectorFeature[];
};

export type PaletteCommand = {
  id: string;
  group: string;
  label: string;
  hint?: string;
  icon: ComponentType<any>;
  disabled?: boolean;
  run: () => void;
};

export type EditorForm = {
  business_name: string;
  store_slug: string;
  store_tagline: string;
  store_about: string;
  store_color: string;
  store_banner_url: string;
  store_template: StoreTemplate;
  banners: string[];
  special_sections: SpecialSectionItem[];
};

export type EditorTabItem = {
  id: string;
  label: string;
  icon: ComponentType<any>;
};

export type EditorSnapshot = {
  theme: StoreTheme;
  banners: string[];
  special_sections: SpecialSectionItem[];
  store_color: string;
  store_template: StoreTemplate;
  store_banner_url: string;
  store_tagline: string;
  store_about: string;
};
