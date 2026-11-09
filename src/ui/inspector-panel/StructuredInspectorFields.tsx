import { useMemo, useRef, useState, type ChangeEvent } from "react";
import { ImagePlus, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FigmaColorPicker } from "@/editor/components/toolbars/FigmaColorPicker";
import { EDITOR_SYSTEM_KEYS, useEngineContext } from "@/engine/kernel";
import type { SectionRegistry, SettingDefinition, SettingGroup } from "@/document/sections";
import type { ResponsiveSystem } from "@/layout/responsive";
import type { ResponsiveBreakpoint } from "@/stores/responsive.store";
import type { SceneNode } from "@/types";
import { NavigationTargetControl } from "./NavigationTargetControl";

export type StructuredProductOption = {
  id: string;
  name: string;
};

export type StructuredNavigationOption = {
  id: string;
  name: string;
};

export type StructuredInspectorFieldsProps = {
  node: SceneNode;
  sourceNode: SceneNode;
  activeBreakpoint: ResponsiveBreakpoint;
  brandColors: string[];
  products: StructuredProductOption[];
  collections: StructuredNavigationOption[];
  pages: StructuredNavigationOption[];
  sections: StructuredNavigationOption[];
  onUpdateProps: (patch: Record<string, unknown>) => void;
  onUploadImage?: (file: File) => Promise<void>;
  onUpdateTransform: (patch: Partial<SceneNode["transform"]>) => void;
  onUpdateStyle: (patch: Partial<SceneNode["style"]>) => void;
  onUpdateExtensions: (patch: Record<string, unknown>) => void;
  onSetHidden: (hidden: boolean) => void;
  onSetProductReference: (productId: string) => void;
  onResetResponsiveOverride: () => void;
  onResetResponsiveSetting: (setting: SettingDefinition) => void;
  excludedGroups?: SettingGroup[];
  excludedControls?: SettingDefinition["control"][];
  excludedSettingIds?: string[];
};

const groupOrder: SettingGroup[] = [
  "content",
  "layout",
  "appearance",
  "typography",
  "behavior",
  "responsive",
];

const groupLabel: Record<SettingGroup, string> = {
  content: "Content",
  layout: "Layout",
  appearance: "Appearance",
  typography: "Typography",
  behavior: "Behavior",
  responsive: "Responsive",
};

const primaryFill = (node: SceneNode) => {
  const fill = node.style.fills[0];
  return fill?.type === "solid" ? fill.color : "#ffffff";
};

const isResponsiveValue = (value: unknown): value is Record<"base" | "tablet" | "mobile", unknown> =>
  Boolean(value && typeof value === "object" && !Array.isArray(value) && "base" in value);

const resolveResponsiveSettingValue = (
  value: unknown,
  breakpoint: ResponsiveBreakpoint,
): unknown => {
  if (!isResponsiveValue(value)) return value;
  if (breakpoint === "mobile") return value.mobile ?? value.tablet ?? value.base;
  if (breakpoint === "tablet") return value.tablet ?? value.base;
  return value.base;
};

const readValue = (
  node: SceneNode,
  setting: SettingDefinition,
  breakpoint: ResponsiveBreakpoint,
): unknown => {
  const target = setting.target ?? "props";
  if (target === "meta") {
    if (setting.id === "hidden") return !node.meta.hidden;
    return node.meta[setting.id as keyof SceneNode["meta"]];
  }
  if (target === "extensions") return node.extensions?.[setting.id];
  if (target === "transform") {
    return node.transform[setting.id as keyof SceneNode["transform"]];
  }
  if (target === "style") {
    if (setting.id === "fillColor") return primaryFill(node);
    return node.style[setting.id as keyof SceneNode["style"]];
  }
  return resolveResponsiveSettingValue(
    node.props[setting.id] ?? setting.defaultValue,
    breakpoint,
  );
};

const visibleSetting = (node: SceneNode, setting: SettingDefinition) => {
  if (!setting.visibleWhen) return true;
  const target = setting.target ?? "props";
  const value =
    target === "extensions"
      ? node.extensions?.[setting.visibleWhen.setting]
      : target === "transform"
        ? node.transform[
            setting.visibleWhen.setting as keyof SceneNode["transform"]
          ]
      : target === "style"
        ? node.style[setting.visibleWhen.setting as keyof SceneNode["style"]]
        : target === "meta"
          ? node.meta[setting.visibleWhen.setting as keyof SceneNode["meta"]]
          : node.props[setting.visibleWhen.setting];
  return value === setting.visibleWhen.equals;
};

export const StructuredInspectorFields = ({
  node,
  sourceNode,
  activeBreakpoint,
  brandColors,
  products,
  collections,
  pages,
  sections,
  onUpdateProps,
  onUploadImage,
  onUpdateTransform,
  onUpdateStyle,
  onUpdateExtensions,
  onSetHidden,
  onSetProductReference,
  onResetResponsiveOverride,
  onResetResponsiveSetting,
  excludedGroups = [],
  excludedControls = [],
  excludedSettingIds = [],
}: StructuredInspectorFieldsProps) => {
  const engine = useEngineContext();
  const registry = engine.resolveSystem<SectionRegistry>(EDITOR_SYSTEM_KEYS.sections);
  const responsive = engine.resolveSystem<ResponsiveSystem>(EDITOR_SYSTEM_KEYS.responsive);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const [mode, setMode] = useState<"simple" | "advanced">("simple");
  const settings = registry
    .getNodeSettings(node)
    .filter((setting) => visibleSetting(node, setting))
    .filter((setting) => !excludedGroups.includes(setting.group))
    .filter((setting) => !excludedControls.includes(setting.control))
    .filter((setting) => !excludedSettingIds.includes(setting.id))
    .filter(
      (setting) =>
        mode === "advanced" ||
        (setting.mode !== "advanced" &&
          (setting.group === "content" ||
            setting.group === "appearance" ||
            setting.id === "hidden" ||
            setting.id === "columns")),
    );
  const grouped = useMemo(
    () =>
      groupOrder
        .map((group) => ({ group, settings: settings.filter((setting) => setting.group === group) }))
        .filter((entry) => entry.settings.length),
    [settings],
  );
  const explicitOverride = responsive.hasExplicitOverride(sourceNode, activeBreakpoint);

  const update = (setting: SettingDefinition, value: unknown) => {
    const target = setting.target ?? "props";
    if (target === "meta" && setting.id === "hidden") {
      onSetHidden(!value);
      return;
    }
    if (target === "extensions") {
      if (setting.control === "product") onSetProductReference(String(value));
      else onUpdateExtensions({ [setting.id]: value });
      return;
    }
    if (target === "transform") {
      onUpdateTransform({
        [setting.id]: value,
      } as Partial<SceneNode["transform"]>);
      return;
    }
    if (target === "style") {
      if (setting.id === "fillColor") {
        onUpdateStyle({ fills: [{ type: "solid", color: String(value) }, ...node.style.fills.slice(1)] });
      } else {
        onUpdateStyle({ [setting.id]: value } as Partial<SceneNode["style"]>);
      }
      return;
    }
    const current = sourceNode.props[setting.id] ?? setting.defaultValue;
    if (setting.responsive && isResponsiveValue(current)) {
      const key = activeBreakpoint === "desktop" ? "base" : activeBreakpoint;
      onUpdateProps({ [setting.id]: { ...current, [key]: value } });
      return;
    }
    onUpdateProps({ [setting.id]: value });
  };

  const uploadImage = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file || !onUploadImage) return;
    void onUploadImage(file);
  };

  const control = (setting: SettingDefinition) => {
    const value = readValue(node, setting, activeBreakpoint);
    if (setting.control === "color") {
      return (
        <FigmaColorPicker
          value={String(value ?? "#ffffff")}
          label={setting.label}
          brandColors={brandColors}
          onChange={(color) => update(setting, color)}
        />
      );
    }
    if (setting.control === "textarea") {
      return (
        <textarea
          value={String(value ?? "")}
          onChange={(event) => update(setting, event.target.value)}
          className="min-h-20 w-full resize-y rounded border border-[#444] bg-[#333] p-2 text-xs text-white outline-none focus:border-[#0178ff]"
        />
      );
    }
    if (setting.control === "range" || setting.control === "number") {
      const numberValue = Number(value ?? setting.min ?? 0);
      return (
        <div className="grid grid-cols-[1fr_64px] gap-2">
          <input
            type="range"
            min={setting.min}
            max={setting.max}
            step={setting.step ?? 1}
            value={numberValue}
            onChange={(event) => update(setting, Number(event.target.value))}
            className="accent-[#0178ff]"
          />
          <Input
            type="number"
            step={setting.step ?? 1}
            value={numberValue}
            onChange={(event) => update(setting, Number(event.target.value))}
            className="h-8 border-[#444] bg-[#333] px-2 text-xs text-white"
          />
        </div>
      );
    }
    if (setting.control === "switch" || setting.control === "checkbox" || setting.control === "device-visibility") {
      return (
        <button
          type="button"
          role="switch"
          aria-checked={Boolean(value)}
          onClick={() => update(setting, !value)}
          className={`relative h-5 w-9 rounded-full transition-colors ${value ? "bg-[#0178ff]" : "bg-[#555]"}`}
        >
          <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white transition-transform ${value ? "translate-x-4" : "translate-x-0.5"}`} />
        </button>
      );
    }
    if (setting.control === "image") {
      return (
        <>
          <Button
            type="button"
            variant="outline"
            className="h-8 border-[#444] bg-transparent text-xs text-white hover:bg-white/10"
            onClick={() => imageInputRef.current?.click()}
          >
            <ImagePlus size={13} className="mr-2" /> {node.props.src ? "Replace" : "Add image"}
          </Button>
          <input ref={imageInputRef} type="file" accept="image/*" onChange={uploadImage} className="hidden" />
        </>
      );
    }
    if (setting.control === "product") {
      return (
        <select
          value={String(value ?? "")}
          onChange={(event) => update(setting, event.target.value)}
          className="h-8 w-full rounded border border-[#444] bg-[#333] px-2 text-xs text-white outline-none focus:border-[#0178ff]"
        >
          <option value="">Select product</option>
          {products.map((product) => <option key={product.id} value={product.id}>{product.name}</option>)}
        </select>
      );
    }
    if (setting.control === "link") {
      return (
        <NavigationTargetControl
          value={value}
          products={products}
          collections={collections}
          pages={pages}
          sections={sections}
          onChange={(target) => update(setting, target)}
        />
      );
    }
    if (setting.control === "select" || setting.control === "segmented" || setting.control === "alignment") {
      return (
        <select
          value={String(value ?? "")}
          onChange={(event) => update(setting, event.target.value)}
          className="h-8 w-full rounded border border-[#444] bg-[#333] px-2 text-xs text-white outline-none focus:border-[#0178ff]"
        >
          {(setting.options ?? []).map((option) => <option key={String(option.value)} value={String(option.value)}>{option.label}</option>)}
        </select>
      );
    }
    return (
      <Input
        value={String(value ?? "")}
        onChange={(event) => update(setting, event.target.value)}
        className="h-8 border-[#444] bg-[#333] text-xs text-white"
      />
    );
  };

  const dynamicSourceControl = (setting: SettingDefinition) => {
    if (!setting.dynamicSources?.length) return null;
    const binding =
      node.extensions?.dynamicBinding && typeof node.extensions.dynamicBinding === "object"
        ? node.extensions.dynamicBinding as Record<string, unknown>
        : null;
    const current =
      binding && binding.target === setting.id
        ? `${String(binding.source)}.${String(binding.field)}`
        : "";
    return (
      <select
        value={current}
        aria-label={`${setting.label} dynamic source`}
        onChange={(event) => {
          const value = event.target.value;
          if (!value) {
            onUpdateExtensions({ dynamicBinding: undefined });
            return;
          }
          const [source, ...fieldParts] = value.split(".");
          const field = fieldParts.join(".");
          onUpdateExtensions({
            dynamicBinding: {
              source,
              field,
              target: setting.id,
              ...(source === "product" && node.extensions?.productId
                ? { productId: node.extensions.productId }
                : {}),
              ...(field.endsWith("price_cents") ? { format: "currency" } : {}),
            },
          });
        }}
        className="h-8 w-full rounded border border-[#285b47] bg-[#193b2f] px-2 text-[10px] text-[#a8e6cc] outline-none focus:border-[#0178ff]"
      >
        <option value="">Static value</option>
        {setting.dynamicSources.map((source) => (
          <option key={source} value={source}>{source}</option>
        ))}
      </select>
    );
  };

  return (
    <div className="space-y-1">
      <div className="mb-3 grid grid-cols-2 rounded border border-[#444] bg-[#252525] p-0.5">
        {(["simple", "advanced"] as const).map((option) => (
          <button
            key={option}
            type="button"
            aria-pressed={mode === option}
            onClick={() => setMode(option)}
            className={`h-7 text-[10px] font-semibold capitalize ${
              mode === option ? "bg-[#0178ff] text-white" : "text-[#aaa] hover:text-white"
            }`}
          >
            {option}
          </button>
        ))}
      </div>
      {node.extensions?.dynamicSource ? (
        <div className="mb-3 rounded border border-[#285b47] bg-[#193b2f] px-2 py-2 text-[10px] text-[#a8e6cc]">
          Live product reference. Catalog values are resolved at render time.
        </div>
      ) : null}
      {grouped.map(({ group, settings: groupSettings }) => (
        <section key={group} className="space-y-3 border-t border-[#414141] py-3 first:border-t-0 first:pt-0">
          <div className="text-[11px] font-bold uppercase text-[#b8b8b8]">{groupLabel[group]}</div>
          {groupSettings.map((setting) => (
            <div key={`${setting.target ?? "props"}:${setting.id}`} className="grid gap-1.5">
              <span className="flex items-center justify-between text-[10px] font-semibold text-[#a9a9a9]">
                {setting.label}
                {setting.responsive ? (
                  <span className="flex items-center gap-1 text-[9px] font-medium text-[#7fc6ff]">
                    {(() => {
                      const target = setting.target ?? "props";
                      if (target === "extensions") {
                        return <>Scene setting</>;
                      }
                      const source = responsive.getValueSource(
                        sourceNode,
                        activeBreakpoint,
                        target,
                        setting.id,
                      );
                      const ownOverride = responsive.hasExplicitOverride(
                        sourceNode,
                        activeBreakpoint,
                        target,
                        setting.id,
                      );
                      return (
                        <>
                          {ownOverride
                            ? `${activeBreakpoint[0].toUpperCase()}${activeBreakpoint.slice(1)} override`
                            : `Inherited from ${source === "base" ? "desktop" : source}`}
                          {activeBreakpoint !== "desktop" && ownOverride ? (
                            <button
                              type="button"
                              title={`Reset ${setting.label} to inherited`}
                              aria-label={`Reset ${setting.label} to inherited`}
                              onClick={(event) => {
                                event.preventDefault();
                                event.stopPropagation();
                                onResetResponsiveSetting(setting);
                              }}
                              className="grid h-5 w-5 place-items-center rounded hover:bg-white/10"
                            >
                              <RotateCcw size={11} />
                            </button>
                          ) : null}
                        </>
                      );
                    })()}
                  </span>
                ) : null}
              </span>
              {control(setting)}
              {dynamicSourceControl(setting)}
            </div>
          ))}
          {group === "responsive" && activeBreakpoint !== "desktop" ? (
            <Button
              type="button"
              variant="outline"
              className="h-8 w-full border-[#444] bg-transparent text-xs text-white hover:bg-white/10"
              onClick={onResetResponsiveOverride}
              disabled={!explicitOverride}
            >
              <RotateCcw size={13} className="mr-2" /> Reset to inherited
            </Button>
          ) : null}
        </section>
      ))}
    </div>
  );
};
