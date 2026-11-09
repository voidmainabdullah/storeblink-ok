import {
  Columns3,
  Grid3X3,
  Layers3,
  Move,
  Rows3,
} from "lucide-react";
import type {
  AxisSizeData,
  LayoutData,
  LayoutMode,
  SceneNode,
  SizeMode,
} from "@/types";
import {
  InspectorSection,
  NumberField,
  SegmentedControl,
  SelectField,
  ToggleRow,
} from "./InspectorControls";

const layoutModes: Array<{ value: string; label: string; icon: typeof Move }> = [
  { value: "absolute", label: "Free", icon: Move },
  { value: "horizontal", label: "Horizontal", icon: Columns3 },
  { value: "vertical", label: "Vertical", icon: Rows3 },
  { value: "grid", label: "Grid", icon: Grid3X3 },
  { value: "overlay", label: "Overlay", icon: Layers3 },
];

const sizeModes = ["fixed", "hug", "fill", "minmax", "percentage"].map((value) => ({
  value,
  label: value[0].toUpperCase() + value.slice(1),
}));

const axisSize = (node: SceneNode, axis: "width" | "height"): AxisSizeData =>
  node.layout.sizing?.[axis] ?? { mode: "fixed", value: node.transform[axis] };

export const LayoutInspector = ({
  node,
  onChange,
}: {
  node: SceneNode;
  onChange: (layout: LayoutData) => void;
}) => {
  const mode = node.layout.mode === "flex" ? "horizontal" : node.layout.mode;
  const autoLayout = node.layout.autoLayout ?? {};
  const intent = node.layout.responsiveIntent ?? {};
  const update = (patch: Partial<LayoutData>) => onChange({
    ...node.layout,
    ...patch,
    ...(patch.sizing ? { sizing: { ...(node.layout.sizing ?? {}), ...patch.sizing } } : {}),
    ...(patch.constraints
      ? { constraints: { ...(node.layout.constraints ?? {}), ...patch.constraints } }
      : {}),
    ...(patch.autoLayout
      ? { autoLayout: { ...(node.layout.autoLayout ?? {}), ...patch.autoLayout } }
      : {}),
    ...(patch.responsiveIntent
      ? { responsiveIntent: { ...(node.layout.responsiveIntent ?? {}), ...patch.responsiveIntent } }
      : {}),
  });
  const updateSizeMode = (axis: "width" | "height", sizeMode: SizeMode) => {
    const current = axisSize(node, axis);
    update({
      sizing: {
        [axis]: {
          ...current,
          mode: sizeMode,
          ...(sizeMode === "fixed" ? { value: node.transform[axis] } : {}),
          ...(sizeMode === "percentage" && current.percentage === undefined ? { percentage: 1 } : {}),
        },
      },
    });
  };

  return (
    <InspectorSection title="Auto layout" defaultOpen={false}>
      <SegmentedControl
        label="Mode"
        value={mode}
        options={layoutModes}
        onChange={(value) => update({ mode: value as LayoutMode })}
      />
      <div className="grid grid-cols-2 gap-2">
        <SelectField
          label="Width"
          value={axisSize(node, "width").mode}
          options={sizeModes}
          onChange={(value) => updateSizeMode("width", value as SizeMode)}
        />
        <SelectField
          label="Height"
          value={axisSize(node, "height").mode}
          options={sizeModes}
          onChange={(value) => updateSizeMode("height", value as SizeMode)}
        />
      </div>

      {mode !== "absolute" && mode !== "overlay" ? (
        <>
          <div className="grid grid-cols-2 gap-2">
            <NumberField
              label="Padding"
              min={0}
              value={typeof autoLayout.padding === "number" ? autoLayout.padding : 0}
              onCommit={(padding) => update({ autoLayout: { padding } })}
            />
            <NumberField
              label="Gap"
              min={0}
              value={autoLayout.gap ?? 0}
              onCommit={(gap) => update({ autoLayout: { gap } })}
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <SelectField
              label="Alignment"
              value={autoLayout.alignment ?? "start"}
              options={["start", "center", "end", "stretch"].map((value) => ({ value, label: value }))}
              onChange={(alignment) => update({ autoLayout: { alignment: alignment as NonNullable<LayoutData["autoLayout"]>["alignment"] } })}
            />
            <SelectField
              label="Distribution"
              value={autoLayout.distribution ?? "start"}
              options={["start", "center", "end", "space-between", "space-around", "space-evenly"].map((value) => ({ value, label: value }))}
              onChange={(distribution) => update({ autoLayout: { distribution: distribution as NonNullable<LayoutData["autoLayout"]>["distribution"] } })}
            />
          </div>
        </>
      ) : null}

      {mode === "horizontal" ? (
        <ToggleRow
          label="Wrap children"
          checked={autoLayout.wrap === true}
          onChange={(wrap) => update({ autoLayout: { wrap } })}
        />
      ) : null}

      {mode === "grid" ? (
        <div className="grid grid-cols-2 gap-2">
          <SelectField
            label="Columns"
            value={String(autoLayout.columns ?? "auto")}
            options={[
              { value: "auto", label: "Auto" },
              ...[1, 2, 3, 4, 5, 6].map((value) => ({ value: String(value), label: String(value) })),
            ]}
            onChange={(value) => update({ autoLayout: { columns: value === "auto" ? "auto" : Number(value) } })}
          />
          <NumberField
            label="Min column"
            min={1}
            value={autoLayout.minColumnWidth ?? 220}
            onCommit={(minColumnWidth) => update({ autoLayout: { minColumnWidth } })}
          />
        </div>
      ) : null}

      <div className="grid grid-cols-2 gap-2">
        <SelectField
          label="Horizontal"
          value={node.layout.constraints?.horizontal ?? "left"}
          options={["left", "right", "center", "stretch", "scale", "fixed", "fill", "hug"].map((value) => ({ value, label: value }))}
          onChange={(horizontal) => update({ constraints: { horizontal: horizontal as NonNullable<LayoutData["constraints"]>["horizontal"] } })}
        />
        <SelectField
          label="Vertical"
          value={node.layout.constraints?.vertical ?? "top"}
          options={["top", "bottom", "center", "stretch", "scale", "fixed", "fill", "hug"].map((value) => ({ value, label: value }))}
          onChange={(vertical) => update({ constraints: { vertical: vertical as NonNullable<LayoutData["constraints"]>["vertical"] } })}
        />
      </div>

      <div className="grid grid-cols-2 gap-2">
        <SelectField
          label="Narrow"
          value={intent.narrowBehavior ?? "preserve"}
          options={["preserve", "stack", "wrap", "collapse"].map((value) => ({ value, label: value }))}
          onChange={(narrowBehavior) => update({ responsiveIntent: { narrowBehavior: narrowBehavior as NonNullable<LayoutData["responsiveIntent"]>["narrowBehavior"] } })}
        />
        <SelectField
          label="Overflow"
          value={intent.overflow ?? "visible"}
          options={["visible", "wrap", "clip", "scroll"].map((value) => ({ value, label: value }))}
          onChange={(overflow) => update({ responsiveIntent: { overflow: overflow as NonNullable<LayoutData["responsiveIntent"]>["overflow"] } })}
        />
      </div>
      <ToggleRow
        label="Preserve aspect ratio"
        checked={intent.preserveAspectRatio === true}
        onChange={(preserveAspectRatio) => update({ responsiveIntent: { preserveAspectRatio } })}
      />
      {node.type === "text" ? (
        <NumberField
          label="Minimum readable size"
          min={8}
          max={72}
          value={intent.minimumReadableSize ?? 12}
          onCommit={(minimumReadableSize) => update({ responsiveIntent: { minimumReadableSize } })}
          suffix="px"
        />
      ) : null}
    </InspectorSection>
  );
};
