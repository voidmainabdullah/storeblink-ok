import { z, type ZodTypeAny } from "zod";
import type { ElementType, SceneNode } from "@/types";

export type PropertyEditorKind =
  | "number"
  | "slider"
  | "select"
  | "colorPicker"
  | "checkbox"
  | "switch"
  | "text";

export type PropertySchema = {
  key: string;
  group: "dimensions" | "position" | "typography" | "fill" | "border" | "effects" | "layout" | "state" | string;
  editor: PropertyEditorKind | string;
  defaultValue: unknown;
  validate: (value: unknown) => boolean;
  appliesTo?: (node: SceneNode) => boolean;
  label?: string;
  options?: Array<{ label: string; value: unknown }>;
};

const validator = (schema: ZodTypeAny) => (value: unknown) => schema.safeParse(value).success;
const cssLength = z.union([z.string().min(1), z.number().finite().nonnegative()]);
const color = z.string().regex(/^(#([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})|rgb\(|rgba\(|hsl\(|hsla\()/i);

export class PropertyRegistry {
  private readonly schemas = new Map<ElementType | "shared", Map<string, PropertySchema>>();

  register(elementType: ElementType | "shared", schema: PropertySchema): void {
    const bucket = this.schemas.get(elementType) ?? new Map<string, PropertySchema>();
    bucket.set(schema.key, schema);
    this.schemas.set(elementType, bucket);
  }

  getSchemasFor(elementType: ElementType, node?: SceneNode): PropertySchema[] {
    const shared = Array.from(this.schemas.get("shared")?.values() ?? []);
    const local = Array.from(this.schemas.get(elementType)?.values() ?? []);
    return [...shared, ...local].filter((schema) => !node || !schema.appliesTo || schema.appliesTo(node));
  }

  getSchema(elementType: ElementType, key: string, node?: SceneNode): PropertySchema | undefined {
    const schema = this.schemas.get(elementType)?.get(key) ?? this.schemas.get("shared")?.get(key);
    if (!schema || (node && schema.appliesTo && !schema.appliesTo(node))) return undefined;
    return schema;
  }
}

export const createPropertyRegistry = () => new PropertyRegistry();

export const registerDefaultStyleProperties = (registry: PropertyRegistry): void => {
  [
    { key: "transform.width", group: "dimensions", editor: "number", defaultValue: 100, validate: validator(z.number().finite().positive()), label: "Width" },
    { key: "transform.height", group: "dimensions", editor: "number", defaultValue: 100, validate: validator(z.number().finite().positive()), label: "Height" },
    { key: "transform.x", group: "position", editor: "number", defaultValue: 0, validate: validator(z.number().finite()), label: "X" },
    { key: "transform.y", group: "position", editor: "number", defaultValue: 0, validate: validator(z.number().finite()), label: "Y" },
    { key: "transform.rotation", group: "position", editor: "number", defaultValue: 0, validate: validator(z.number().finite()), label: "Rotation" },
    { key: "transform.zIndex", group: "position", editor: "number", defaultValue: 0, validate: validator(z.number().finite()), label: "Z index" },
    { key: "style.opacity", group: "effects", editor: "slider", defaultValue: 1, validate: validator(z.number().finite().min(0).max(1)), label: "Opacity" },
    { key: "style.cornerRadius", group: "border", editor: "number", defaultValue: 0, validate: validator(z.number().finite().nonnegative()), label: "Corner radius" },
    { key: "meta.hidden", group: "state", editor: "switch", defaultValue: false, validate: validator(z.boolean()), label: "Hidden" },
    { key: "meta.locked", group: "state", editor: "switch", defaultValue: false, validate: validator(z.boolean()), label: "Locked" },
    { key: "layout.mode", group: "layout", editor: "select", defaultValue: "absolute", validate: validator(z.enum(["absolute", "flex", "grid"])), label: "Layout mode" },
    { key: "props.text", group: "typography", editor: "text", defaultValue: "", validate: validator(z.string()), label: "Text" },
    { key: "props.fontSize", group: "typography", editor: "number", defaultValue: 16, validate: validator(z.number().finite().min(1).max(300)), label: "Font size" },
    { key: "props.color", group: "fill", editor: "colorPicker", defaultValue: "#000000", validate: validator(color), label: "Text color" },
    { key: "props.background", group: "fill", editor: "text", defaultValue: "", validate: validator(z.union([color, z.string().min(1)])), label: "Background" },
    { key: "props.padding", group: "dimensions", editor: "number", defaultValue: 0, validate: validator(cssLength), label: "Padding" },
    { key: "props.shadow", group: "effects", editor: "select", defaultValue: "none", validate: validator(z.enum(["none", "sm", "md", "lg", "xl"])), label: "Shadow" },
    { key: "props.transition", group: "effects", editor: "text", defaultValue: "", validate: validator(z.string()), label: "Transition" },
  ].forEach((schema) => registry.register("shared", schema as PropertySchema));
};

export const propertyRegistry = createPropertyRegistry();
registerDefaultStyleProperties(propertyRegistry);
