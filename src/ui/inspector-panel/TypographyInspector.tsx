import {
  AlignCenter,
  AlignJustify,
  AlignLeft,
  AlignRight,
  AlignVerticalJustifyCenter,
  AlignVerticalJustifyEnd,
  AlignVerticalJustifyStart,
} from "lucide-react";
import { FigmaColorPicker } from "@/editor/components/toolbars/FigmaColorPicker";
import type { SceneNode } from "@/types";
import {
  THEME_FONT_CATALOG,
  themeFontById,
  themeFontIdForFamily,
} from "@/theme-engine/branding";
import {
  InspectorSection,
  NumberField,
  SegmentedControl,
  SelectField,
} from "./InspectorControls";

export type TypographyInspectorProps = {
  node: SceneNode;
  brandColors: string[];
  onUpdateProps: (patch: Record<string, unknown>) => void;
  contentOnly?: boolean;
};

const FONT_OPTIONS = THEME_FONT_CATALOG.map((font) => ({ value: font.id, label: font.label }));

const WEIGHT_OPTIONS = [
  { value: "100", label: "Thin" },
  { value: "200", label: "Extra light" },
  { value: "300", label: "Light" },
  { value: "400", label: "Regular" },
  { value: "500", label: "Medium" },
  { value: "600", label: "Semi bold" },
  { value: "700", label: "Bold" },
  { value: "800", label: "Extra bold" },
  { value: "900", label: "Black" },
];

export const TypographyInspector = ({
  node,
  brandColors,
  onUpdateProps,
  contentOnly = false,
}: TypographyInspectorProps) => {
  const isButton = node.type === "button";
  const contentKey = isButton ? "label" : "text";
  const content = String(node.props[contentKey] ?? node.props.text ?? "");
  const inferredRole = isButton ? "ui" : Number(node.props.fontSize ?? 0) >= 28 ? "heading" : "body";
  const fontBinding = String(node.props.fontBinding ?? "brand") === "local"
    ? "local"
    : String(node.props.typographyRole ?? inferredRole);

  return (
    <>
      <InspectorSection title="Text">
        <textarea
          aria-label="Text content"
          value={content}
          onChange={(event) => onUpdateProps({ [contentKey]: event.target.value })}
          className="min-h-20 w-full resize-y rounded border border-[#484848] bg-[#383838] p-2 text-[11px] leading-4 text-white outline-none focus:border-[#0178ff]"
        />
      </InspectorSection>

      {!contentOnly ? <InspectorSection title="Typography">
        <SelectField
          label="Brand font role"
          value={fontBinding}
          options={[
            { value: "heading", label: "Brand heading" },
            { value: "body", label: "Brand paragraph" },
            { value: "accent", label: "Brand accent" },
            { value: "ui", label: "Brand navigation and UI" },
            { value: "local", label: "Local override" },
          ]}
          onChange={(value) =>
            value === "local"
              ? onUpdateProps({ fontBinding: "local" })
              : onUpdateProps({ fontBinding: "brand", typographyRole: value })
          }
        />
        <SelectField
          label="Local font family"
          value={themeFontIdForFamily(node.props.fontFamily, "inter")}
          options={FONT_OPTIONS}
          onChange={(fontId) => onUpdateProps({
            fontBinding: "local",
            fontFamily: themeFontById(fontId).stack,
          })}
        />
        <div className="grid grid-cols-2 gap-2">
          <SelectField
            label="Font weight"
            value={String(node.props.fontWeight ?? 400)}
            options={WEIGHT_OPTIONS}
            onChange={(fontWeight) => onUpdateProps({ fontWeight: Number(fontWeight) })}
          />
          <NumberField
            label="Font size"
            value={Number(node.props.fontSize ?? 16)}
            min={4}
            max={512}
            onCommit={(fontSize) => onUpdateProps({ fontSize })}
          />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <NumberField
            label="Line height"
            value={Number(node.props.lineHeight ?? 1.35)}
            min={0.5}
            max={8}
            step={0.05}
            onCommit={(lineHeight) => onUpdateProps({ lineHeight })}
          />
          <NumberField
            label="Letter spacing"
            value={Number(node.props.letterSpacing ?? 0)}
            min={-100}
            max={500}
            step={0.1}
            suffix="px"
            onCommit={(letterSpacing) => onUpdateProps({ letterSpacing })}
          />
        </div>
        <SegmentedControl
          label="Alignment"
          value={String(node.props.textAlign ?? "left")}
          options={[
            { value: "left", label: "Left", icon: AlignLeft },
            { value: "center", label: "Center", icon: AlignCenter },
            { value: "right", label: "Right", icon: AlignRight },
            { value: "justify", label: "Justify", icon: AlignJustify },
          ]}
          onChange={(textAlign) => onUpdateProps({ textAlign })}
        />
        <SegmentedControl
          label="Vertical alignment"
          value={String(node.props.verticalAlign ?? "top")}
          options={[
            { value: "top", label: "Top", icon: AlignVerticalJustifyStart },
            { value: "middle", label: "Middle", icon: AlignVerticalJustifyCenter },
            { value: "bottom", label: "Bottom", icon: AlignVerticalJustifyEnd },
          ]}
          onChange={(verticalAlign) => onUpdateProps({ verticalAlign })}
        />
        <div className="grid grid-cols-2 gap-2">
          <SelectField
            label="Text transform"
            value={String(node.props.textTransform ?? "none")}
            options={[
              { value: "none", label: "None" },
              { value: "uppercase", label: "Uppercase" },
              { value: "lowercase", label: "Lowercase" },
              { value: "capitalize", label: "Capitalize" },
            ]}
            onChange={(textTransform) => onUpdateProps({ textTransform })}
          />
          <SelectField
            label="Decoration"
            value={String(node.props.textDecoration ?? "none")}
            options={[
              { value: "none", label: "None" },
              { value: "underline", label: "Underline" },
              { value: "line-through", label: "Strikethrough" },
              { value: "overline", label: "Overline" },
            ]}
            onChange={(textDecoration) => onUpdateProps({ textDecoration })}
          />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <SelectField
            label="Writing direction"
            value={String(node.props.direction ?? "ltr")}
            options={[
              { value: "ltr", label: "Left to right" },
              { value: "rtl", label: "Right to left" },
            ]}
            onChange={(direction) => onUpdateProps({ direction })}
          />
          <SelectField
            label="Writing mode"
            value={String(node.props.writingMode ?? "horizontal-tb")}
            options={[
              { value: "horizontal-tb", label: "Horizontal" },
              { value: "vertical-rl", label: "Vertical right" },
              { value: "vertical-lr", label: "Vertical left" },
            ]}
            onChange={(writingMode) => onUpdateProps({ writingMode })}
          />
        </div>
        <label className="block">
          <span className="mb-1 block text-[9px] font-medium text-[#a6a6a6]">OpenType features</span>
          <input
            value={String(node.props.fontFeatureSettings ?? "normal")}
            onChange={(event) => onUpdateProps({ fontFeatureSettings: event.target.value })}
            placeholder='"liga" 1, "kern" 1'
            className="h-7 w-full rounded border border-transparent bg-[#383838] px-2 text-[11px] text-white outline-none focus:border-[#0178ff]"
          />
        </label>
      </InspectorSection> : null}

      {!contentOnly ? <InspectorSection title="Fill">
        <div className="flex items-center justify-between rounded bg-[#383838] px-2 py-1">
          <span className="text-[10px] text-[#ddd]">Text color</span>
          <div className="flex items-center gap-2 text-[9px] text-[#aaa]">
            <span>{Math.round(Number(node.props.textFillOpacity ?? 100))}%</span>
            <FigmaColorPicker
              value={String(node.props.color ?? "#111827")}
              label="Text color"
              brandColors={brandColors}
              opacity={Number(node.props.textFillOpacity ?? 100)}
              onOpacityChange={(textFillOpacity) => onUpdateProps({ textFillOpacity })}
              onChange={(color) => onUpdateProps({ color })}
            />
          </div>
        </div>
      </InspectorSection> : null}
    </>
  );
};
