import type { ElementType, SceneNode, SceneTree } from "@/types";

export type SettingGroup =
  | "content"
  | "layout"
  | "appearance"
  | "typography"
  | "behavior"
  | "responsive";

export type SettingControl =
  | "text"
  | "textarea"
  | "number"
  | "range"
  | "select"
  | "segmented"
  | "checkbox"
  | "switch"
  | "color"
  | "image"
  | "link"
  | "product"
  | "collection"
  | "menu"
  | "alignment"
  | "spacing"
  | "radius"
  | "shadow"
  | "device-visibility";

export type SettingOption = {
  label: string;
  value: string | number | boolean;
};

export type SettingCondition = {
  setting: string;
  equals: unknown;
};

export type SettingDefinition = {
  id: string;
  label: string;
  group: SettingGroup;
  control: SettingControl;
  target?: "props" | "style" | "meta" | "extensions" | "transform";
  defaultValue?: unknown;
  required?: boolean;
  min?: number;
  max?: number;
  step?: number;
  options?: SettingOption[];
  responsive?: boolean;
  dynamicSources?: string[];
  visibleWhen?: SettingCondition;
  mode?: "simple" | "advanced";
};

export type BlockDefinition = {
  type: string;
  name: string;
  icon: string;
  elementType: ElementType;
  settings: SettingDefinition[];
  defaultProps: Record<string, unknown>;
  defaultStyle?: Partial<SceneNode["style"]>;
};

export type SectionDefinition = {
  type: string;
  name: string;
  icon: string;
  category: "Header" | "Hero" | "Products" | "Content" | "Marketing" | "Footer";
  description: string;
  settings: SettingDefinition[];
  blocks: Record<string, BlockDefinition>;
  defaultBlocks: string[];
  responsiveBehavior: {
    desktop: string;
    tablet: string;
    mobile: string;
  };
};

export type StructuredSceneValidationIssue = {
  nodeId: string;
  message: string;
  severity: "error" | "warning";
};

export type StructuredSceneValidationResult = {
  valid: boolean;
  issues: StructuredSceneValidationIssue[];
};

export type SectionPlacementValidation =
  | { valid: true; parentId: string }
  | { valid: false; message: string };

export type SectionRegistryAPI = {
  registerSection(definition: SectionDefinition): () => void;
  getSection(type: string): SectionDefinition | undefined;
  listSections(): SectionDefinition[];
  searchSections(query: string, category?: SectionDefinition["category"]): SectionDefinition[];
  getNodeSettings(node: SceneNode): SettingDefinition[];
  getBlock(sectionType: string, blockType: string): BlockDefinition | undefined;
  validatePlacement(
    scene: SceneTree,
    parentId: string,
  ): SectionPlacementValidation;
  validateNodeSettings(node: SceneNode): StructuredSceneValidationResult;
  validateScene(scene: SceneTree): StructuredSceneValidationResult;
};
