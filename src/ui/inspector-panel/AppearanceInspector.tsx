import { Eye, EyeOff, Plus, Trash2 } from "lucide-react";
import type { ReactNode } from "react";
import { FigmaColorPicker } from "@/editor/components/toolbars/FigmaColorPicker";
import type { Effect, Fill, SceneNode, Stroke } from "@/types";
import {
  InspectorIconButton,
  InspectorSection,
  NumberField,
  SelectField,
  ToggleRow,
} from "./InspectorControls";

export type AppearanceInspectorProps = {
  node: SceneNode;
  brandColors: string[];
  showAppearance?: boolean;
  showFill?: boolean;
  showStroke?: boolean;
  showEffects?: boolean;
  effectExtras?: ReactNode;
  onUpdateProps: (patch: Record<string, unknown>) => void;
  onUpdateStyle: (patch: Partial<SceneNode["style"]>) => void;
};

const primaryFillColor = (node: SceneNode) => {
  if (node.type === "button" && typeof node.props.background === "string") return node.props.background;
  const fill = node.style.fills[0];
  return fill?.type === "solid" ? fill.color : "#FFFFFF";
};

const effectKind = (effect: Effect) =>
  String(
    effect.value.kind ??
      (effect.type === "shadow" ? "drop-shadow" : effect.type === "blur" ? "layer-blur" : effect.type),
  );

export const AppearanceInspector = ({
  node,
  brandColors,
  showAppearance = true,
  showFill = true,
  showStroke = true,
  showEffects = true,
  effectExtras,
  onUpdateProps,
  onUpdateStyle,
}: AppearanceInspectorProps) => {
  const fill = node.style.fills[0];
  const stroke = node.style.strokes[0];
  const fillVisible =
    node.type === "button"
      ? node.props.backgroundVisible !== false
      : fill?.visible !== false;

  const updateFill = (patch: Partial<Fill>) => {
    const current: Fill = fill ?? { type: "solid", color: "#FFFFFF" };
    onUpdateStyle({ fills: [Object.assign({}, current, patch) as Fill, ...node.style.fills.slice(1)] });
  };

  const setFillColor = (color: string) => {
    if (node.type === "button") {
      onUpdateProps({ background: color });
      return;
    }
    updateFill({ type: "solid", color } as Partial<Fill>);
  };

  const updateStroke = (patch: Partial<Stroke>) => {
    const current: Stroke = stroke ?? { color: "#000000", width: 1, style: "solid" };
    onUpdateStyle({ strokes: [{ ...current, ...patch }, ...node.style.strokes.slice(1)] });
  };

  const toggleEffect = (kind: "drop-shadow" | "inner-shadow" | "layer-blur" | "background-blur", enabled: boolean) => {
    const next = node.style.effects.filter((effect) => effectKind(effect) !== kind);
    if (enabled) {
      if (kind === "drop-shadow" || kind === "inner-shadow") {
        next.push({
          type: "shadow",
          value: {
            kind,
            x: 0,
            y: kind === "drop-shadow" ? 4 : 2,
            blur: 12,
            spread: 0,
            color: kind === "drop-shadow" ? "rgba(0,0,0,0.22)" : "rgba(0,0,0,0.18)",
          },
        });
      } else {
        next.push({
          type: "blur",
          value: { kind, radius: kind === "layer-blur" ? 4 : 12 },
        });
      }
    }
    onUpdateStyle({ effects: next });
  };

  const updateEffect = (kind: string, patch: Record<string, unknown>) => {
    onUpdateStyle({
      effects: node.style.effects.map((effect) =>
        effectKind(effect) === kind ? { ...effect, value: { ...effect.value, ...patch } } : effect,
      ),
    });
  };

  const dropShadow = node.style.effects.find((effect) => effectKind(effect) === "drop-shadow");
  const innerShadow = node.style.effects.find((effect) => effectKind(effect) === "inner-shadow");
  const layerBlur = node.style.effects.find((effect) => effectKind(effect) === "layer-blur");
  const backgroundBlur = node.style.effects.find((effect) => effectKind(effect) === "background-blur");

  return (
    <>
      {showAppearance ? (
        <InspectorSection title="Appearance">
          <div className="grid grid-cols-2 gap-2">
            <NumberField
              label="Opacity"
              value={Math.round(node.style.opacity * 100)}
              min={0}
              max={100}
              suffix="%"
              onCommit={(opacity) => onUpdateStyle({ opacity: opacity / 100 })}
            />
            <NumberField
              label="Corner radius"
              value={typeof node.style.cornerRadius === "number" ? node.style.cornerRadius : 0}
              min={0}
              onCommit={(cornerRadius) => onUpdateStyle({ cornerRadius })}
            />
          </div>
        </InspectorSection>
      ) : null}

      {showFill ? (
        <InspectorSection
          title="Fill"
          actions={
            <InspectorIconButton
              icon={Plus}
              title="Add fill"
              onClick={() =>
                node.type === "button"
                  ? onUpdateProps({ background: "#FFFFFF", backgroundVisible: true })
                  : onUpdateStyle({ fills: [{ type: "solid", color: "#FFFFFF" }, ...node.style.fills] })
              }
            />
          }
        >
          <div className="grid grid-cols-[auto_1fr_auto_auto] items-center gap-1 rounded bg-[#383838] px-1.5 py-1">
            <span className="h-4 w-4 rounded-sm border border-white/30" style={{ background: primaryFillColor(node) }} />
            <span className="truncate text-[10px] text-[#ddd]">
              {fill?.type === "gradient" ? "Gradient" : fill?.type === "image" ? "Image" : primaryFillColor(node)}
            </span>
            <span className="text-[9px] text-[#aaa]">
              {Math.round((node.type === "button" ? Number(node.props.backgroundOpacity ?? 1) : fill?.opacity ?? 1) * 100)}%
            </span>
            <FigmaColorPicker
              value={primaryFillColor(node)}
              label="Fill color"
              brandColors={brandColors}
              opacity={Math.round((node.type === "button" ? Number(node.props.backgroundOpacity ?? 1) : fill?.opacity ?? 1) * 100)}
              onOpacityChange={(opacity) =>
                node.type === "button"
                  ? onUpdateProps({ backgroundOpacity: opacity / 100 })
                  : updateFill({ opacity: opacity / 100 })
              }
              onChange={setFillColor}
            />
            <span />
            <span />
            <InspectorIconButton
              icon={fillVisible ? Eye : EyeOff}
              title={fillVisible ? "Hide fill" : "Show fill"}
              onClick={() =>
                node.type === "button"
                  ? onUpdateProps({ backgroundVisible: !fillVisible })
                  : updateFill({ visible: !fillVisible })
              }
            />
            <InspectorIconButton
              icon={Trash2}
              title="Delete fill"
              disabled={node.type !== "button" && !node.style.fills.length}
              onClick={() =>
                node.type === "button"
                  ? onUpdateProps({ background: undefined, backgroundVisible: false })
                  : onUpdateStyle({ fills: node.style.fills.slice(1) })
              }
            />
          </div>
        </InspectorSection>
      ) : null}

      {showStroke ? (
        <InspectorSection
          title="Stroke"
          defaultOpen={Boolean(stroke)}
          actions={
            <InspectorIconButton
              icon={Plus}
              title="Add stroke"
              onClick={() =>
                onUpdateStyle({
                  strokes: [
                    { color: "#000000", width: 1, style: "solid", position: "inside" },
                    ...node.style.strokes,
                  ],
                })
              }
            />
          }
        >
          {stroke ? (
            <>
              <div className="flex items-center justify-between rounded bg-[#383838] px-2 py-1">
                <span className="text-[10px] text-[#ddd]">Color</span>
                <FigmaColorPicker
                  value={stroke.color}
                  label="Stroke color"
                  brandColors={brandColors}
                  opacity={Math.round((stroke.opacity ?? 1) * 100)}
                  onOpacityChange={(opacity) => updateStroke({ opacity: opacity / 100 })}
                  onChange={(color) => updateStroke({ color })}
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <SelectField
                  label="Position"
                  value={stroke.position ?? "inside"}
                  options={[
                    { value: "inside", label: "Inside" },
                    { value: "center", label: "Center" },
                    { value: "outside", label: "Outside" },
                  ]}
                  onChange={(position) => updateStroke({ position: position as Stroke["position"] })}
                />
                <NumberField label="Weight" value={stroke.width} min={0} onCommit={(width) => updateStroke({ width })} />
              </div>
              <div className="grid grid-cols-[1fr_auto] items-end gap-2">
                <SelectField
                  label="Dash"
                  value={stroke.style ?? "solid"}
                  options={[
                    { value: "solid", label: "Solid" },
                    { value: "dashed", label: "Dashed" },
                    { value: "dotted", label: "Dotted" },
                  ]}
                  onChange={(style) => updateStroke({ style: style as Stroke["style"] })}
                />
                <InspectorIconButton
                  icon={Trash2}
                  title="Delete stroke"
                  onClick={() => onUpdateStyle({ strokes: node.style.strokes.slice(1) })}
                  className="mb-0"
                />
              </div>
            </>
          ) : <div className="text-[9px] text-[#888]">No stroke</div>}
        </InspectorSection>
      ) : null}

      {showEffects ? (
        <InspectorSection title="Effects" defaultOpen={false}>
          <ToggleRow label="Drop shadow" checked={Boolean(dropShadow)} onChange={(enabled) => toggleEffect("drop-shadow", enabled)} />
          {dropShadow ? (
            <div className="grid grid-cols-4 gap-1">
              {(["x", "y", "blur", "spread"] as const).map((key) => (
                <NumberField
                  key={key}
                  label={key.toUpperCase()}
                  value={Number(dropShadow.value[key] ?? 0)}
                  min={key === "blur" ? 0 : undefined}
                  onCommit={(value) => updateEffect("drop-shadow", { [key]: value })}
                />
              ))}
            </div>
          ) : null}
          <ToggleRow label="Inner shadow" checked={Boolean(innerShadow)} onChange={(enabled) => toggleEffect("inner-shadow", enabled)} />
          <ToggleRow label="Layer blur" checked={Boolean(layerBlur)} onChange={(enabled) => toggleEffect("layer-blur", enabled)} />
          {layerBlur ? <NumberField label="Layer blur radius" value={Number(layerBlur.value.radius ?? 4)} min={0} onCommit={(radius) => updateEffect("layer-blur", { radius })} /> : null}
          <ToggleRow label="Background blur" checked={Boolean(backgroundBlur)} onChange={(enabled) => toggleEffect("background-blur", enabled)} />
          {backgroundBlur ? <NumberField label="Background blur radius" value={Number(backgroundBlur.value.radius ?? 12)} min={0} onCommit={(radius) => updateEffect("background-blur", { radius })} /> : null}
          {effectExtras}
        </InspectorSection>
      ) : null}
    </>
  );
};
