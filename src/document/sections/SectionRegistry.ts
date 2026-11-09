import { z } from "zod";
import type { SceneNode, SceneTree } from "@/types";
import { BUILT_IN_SECTION_DEFINITIONS } from "./definitions";
import type {
  BlockDefinition,
  SectionDefinition,
  SectionPlacementValidation,
  SectionRegistryAPI,
  SettingDefinition,
  StructuredSceneValidationIssue,
  StructuredSceneValidationResult,
} from "./types";

const definitionSchema = z.object({
  type: z.string().min(1),
  name: z.string().min(1),
  icon: z.string().min(1),
  category: z.enum(["Header", "Hero", "Products", "Content", "Marketing", "Footer"]),
  description: z.string().min(1),
  settings: z.array(z.object({ id: z.string().min(1), label: z.string().min(1), group: z.string(), control: z.string() }).passthrough()),
  blocks: z.record(z.object({ type: z.string().min(1), name: z.string().min(1), elementType: z.string() }).passthrough()),
  defaultBlocks: z.array(z.string()),
  responsiveBehavior: z.object({ desktop: z.string(), tablet: z.string(), mobile: z.string() }),
}).superRefine((definition, context) => {
  definition.defaultBlocks.forEach((blockType) => {
    if (!definition.blocks[blockType]) {
      context.addIssue({ code: z.ZodIssueCode.custom, message: `Default block ${blockType} is not registered.` });
    }
  });
});

const extensionString = (node: SceneNode, key: string): string | null => {
  const value = node.extensions?.[key];
  return typeof value === "string" ? value : null;
};

const readSettingValue = (node: SceneNode, setting: SettingDefinition): unknown => {
  const target = setting.target ?? "props";
  if (target === "meta") return node.meta[setting.id as keyof SceneNode["meta"]];
  if (target === "extensions") return node.extensions?.[setting.id];
  if (target === "transform") {
    return node.transform[setting.id as keyof SceneNode["transform"]];
  }
  if (target === "style") {
    if (setting.id === "fillColor") {
      const fill = node.style.fills[0];
      return fill?.type === "solid" ? fill.color : undefined;
    }
    return node.style[setting.id as keyof SceneNode["style"]];
  }
  return node.props[setting.id];
};

const isMissing = (value: unknown) =>
  value === undefined || value === null || (typeof value === "string" && !value.trim());

const validateSettings = (
  node: SceneNode,
  settings: SettingDefinition[],
  issues: StructuredSceneValidationIssue[],
) => {
  settings.forEach((setting) => {
    const value = readSettingValue(node, setting);
    if (setting.required && isMissing(value)) {
      issues.push({ nodeId: node.id, message: `${setting.label} is required.`, severity: "warning" });
      return;
    }
    if (isMissing(value)) return;
    if (setting.control === "number" || setting.control === "range") {
      const responsiveValues =
        setting.responsive &&
        value &&
        typeof value === "object" &&
        !Array.isArray(value) &&
        "base" in value
          ? ["base", "tablet", "mobile"]
              .map((breakpoint) => (value as Record<string, unknown>)[breakpoint])
              .filter((entry) => entry !== undefined)
          : [value];
      responsiveValues.forEach((entry) => {
        const number = Number(entry);
        if (!Number.isFinite(number)) {
          issues.push({ nodeId: node.id, message: `${setting.label} must be a number.`, severity: "error" });
        } else if (
          (setting.min !== undefined && number < setting.min) ||
          (setting.max !== undefined && number > setting.max)
        ) {
          issues.push({
            nodeId: node.id,
            message: `${setting.label} is outside the preset range ${setting.min ?? "-infinity"} to ${setting.max ?? "infinity"}.`,
            severity: "warning",
          });
        }
      });
    }
    if (setting.control === "color" && typeof value === "string") {
      const validColor =
        /^#[0-9a-f]{3,8}$/i.test(value) ||
        /^(rgb|hsl)a?\([^)]*\)$/i.test(value) ||
        /^var\(--[-\w]+\)$/i.test(value) ||
        value === "transparent";
      if (!validColor) {
        issues.push({ nodeId: node.id, message: `${setting.label} is not a recognized color value.`, severity: "warning" });
      }
    }
  });
};

const validateResponsiveLayout = (
  node: SceneNode,
  issues: StructuredSceneValidationIssue[],
) => {
  const responsive = node.layout.responsive;
  if (responsive === undefined) return;
  if (!responsive || typeof responsive !== "object" || Array.isArray(responsive)) {
    issues.push({ nodeId: node.id, message: "Responsive overrides must be an object.", severity: "error" });
    return;
  }
  Object.entries(responsive).forEach(([breakpoint, rawOverride]) => {
    if (!["desktop", "tablet", "mobile"].includes(breakpoint)) {
      issues.push({ nodeId: node.id, message: `Custom responsive breakpoint ${breakpoint} is not used by the current preview.`, severity: "warning" });
      return;
    }
    if (!rawOverride || typeof rawOverride !== "object" || Array.isArray(rawOverride)) {
      issues.push({ nodeId: node.id, message: `${breakpoint} override is invalid.`, severity: "error" });
      return;
    }
    const transform = (rawOverride as { transform?: SceneNode["transform"] }).transform;
    if (transform) {
      const hidden = (rawOverride as { meta?: { hidden?: boolean } }).meta?.hidden === true;
      const numbers = [
        transform.x,
        transform.y,
        transform.width,
        transform.height,
        transform.rotation,
        transform.scaleX,
        transform.scaleY,
      ];
      if (
        numbers.some((value) => !Number.isFinite(value)) ||
        (!hidden && (transform.width < 0 || transform.height < 0))
      ) {
        issues.push({
          nodeId: node.id,
          message: `${breakpoint} transform contains invalid geometry.`,
          severity: "error",
        });
      }
    }
  });
};

export class SectionRegistry implements SectionRegistryAPI {
  private readonly sections = new Map<string, SectionDefinition>();

  registerSection(definition: SectionDefinition): () => void {
    definitionSchema.parse(definition);
    if (this.sections.has(definition.type)) {
      throw new Error(`Section type ${definition.type} is already registered.`);
    }
    this.sections.set(definition.type, definition);
    return () => {
      if (this.sections.get(definition.type) === definition) this.sections.delete(definition.type);
    };
  }

  getSection(type: string): SectionDefinition | undefined {
    return this.sections.get(type);
  }

  listSections(): SectionDefinition[] {
    return [...this.sections.values()];
  }

  searchSections(query: string, category?: SectionDefinition["category"]): SectionDefinition[] {
    const normalized = query.trim().toLowerCase();
    return this.listSections().filter((definition) => {
      if (category && definition.category !== category) return false;
      if (!normalized) return true;
      return [definition.name, definition.description, definition.category, definition.type]
        .some((value) => value.toLowerCase().includes(normalized));
    });
  }

  getNodeSettings(node: SceneNode): SettingDefinition[] {
    const sectionType = extensionString(node, "sectionType");
    if (!sectionType) return [];
    const definition = this.getSection(sectionType);
    if (!definition) return [];
    if (extensionString(node, "editorKind") === "section") return definition.settings;
    const blockType = extensionString(node, "blockType");
    return blockType ? definition.blocks[blockType]?.settings ?? [] : [];
  }

  getBlock(sectionType: string, blockType: string): BlockDefinition | undefined {
    return this.getSection(sectionType)?.blocks[blockType];
  }

  validatePlacement(
    scene: SceneTree,
    parentId: string,
  ): SectionPlacementValidation {
    const parent = scene.nodes[parentId];
    if (!parent) {
      return { valid: false, message: "The section destination no longer exists." };
    }
    if (parent.meta.locked) {
      return { valid: false, message: `${parent.name} is locked.` };
    }
    const acceptsSections =
      parent.id === scene.rootNodeId ||
      parent.type === "container" ||
      parent.type === "section" ||
      parent.extensions?.acceptsSections === true;
    if (!acceptsSections) {
      return {
        valid: false,
        message: `${parent.name} does not accept section instances.`,
      };
    }
    return { valid: true, parentId };
  }

  validateNodeSettings(node: SceneNode): StructuredSceneValidationResult {
    const issues: StructuredSceneValidationIssue[] = [];
    const editorKind = extensionString(node, "editorKind");
    if (editorKind !== "section" && editorKind !== "block") {
      return { valid: true, issues };
    }
    const sectionType = extensionString(node, "sectionType");
    const definition = sectionType ? this.getSection(sectionType) : undefined;
    if (!definition) {
      issues.push({
        nodeId: node.id,
        message: `Unknown structured section type ${sectionType ?? "(missing)"}.`,
        severity: "warning",
      });
      return { valid: true, issues };
    }
    if (editorKind === "section") {
      validateSettings(node, definition.settings, issues);
    } else {
      const blockType = extensionString(node, "blockType");
      const settings = blockType ? definition.blocks[blockType]?.settings ?? [] : [];
      if (!blockType || !definition.blocks[blockType]) {
        issues.push({
          nodeId: node.id,
          message: `${blockType ?? "Unknown block"} has no registered preset for ${definition.name}.`,
          severity: "warning",
        });
      }
      validateSettings(node, settings, issues);
    }
    return {
      valid: issues.every((issue) => issue.severity !== "error"),
      issues,
    };
  }

  validateScene(scene: SceneTree): StructuredSceneValidationResult {
    const issues: StructuredSceneValidationIssue[] = [];
    Object.values(scene.nodes).forEach((node) => {
      validateResponsiveLayout(node, issues);
      if (extensionString(node, "editorKind") !== "section") return;
      const sectionType = extensionString(node, "sectionType");
      const definition = sectionType ? this.getSection(sectionType) : undefined;
      if (!definition) {
        issues.push({ nodeId: node.id, message: `Unknown structured section type ${sectionType ?? "(missing)"}.`, severity: "warning" });
        return;
      }
      validateSettings(node, definition.settings, issues);
      const blocks = node.childIds
        .map((id) => scene.nodes[id])
        .filter((child): child is SceneNode => child?.extensions?.editorKind === "block");
      blocks.forEach((block) => {
        const blockType = extensionString(block, "blockType");
        if (!blockType || !definition.blocks[blockType]) {
          issues.push({
            nodeId: block.id,
            message: `${blockType ?? "Unknown block"} has no registered preset for ${definition.name}.`,
            severity: "warning",
          });
        }
        if (extensionString(block, "sectionType") !== sectionType) {
          issues.push({
            nodeId: block.id,
            message: `${block.name} belongs to a different section type.`,
            severity: "warning",
          });
        }
        const settings = blockType ? definition.blocks[blockType]?.settings ?? [] : [];
        validateSettings(block, settings, issues);
      });
    });
    return { valid: issues.every((issue) => issue.severity !== "error"), issues };
  }
}

export const createSectionRegistry = (): SectionRegistry => {
  const registry = new SectionRegistry();
  BUILT_IN_SECTION_DEFINITIONS.forEach((definition) => registry.registerSection(definition));
  return registry;
};

export const sectionRegistry = createSectionRegistry();
