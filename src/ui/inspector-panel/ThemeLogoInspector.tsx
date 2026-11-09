import { useRef, useState, type ChangeEvent } from "react";
import { ImagePlus, RotateCcw, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type {
  ThemeChromeBreakpoint,
  ThemeChromeSettings,
  ThemeLogoAssetSlot,
} from "@/theme-engine/chrome";
import { NavigationTargetControl } from "./NavigationTargetControl";
import type {
  StructuredNavigationOption,
  StructuredProductOption,
} from "./StructuredInspectorFields";

export type ThemeLogoInspectorProps = {
  settings: ThemeChromeSettings;
  activeBreakpoint: ThemeChromeBreakpoint;
  onChange: (settings: ThemeChromeSettings) => void;
  onUpload: (file: File, slot: ThemeLogoAssetSlot) => Promise<void>;
  onResetPlacement: () => void;
  products?: StructuredProductOption[];
  collections?: StructuredNavigationOption[];
  pages?: StructuredNavigationOption[];
  sections?: StructuredNavigationOption[];
  replaceOnly?: boolean;
};

const assetKey = (slot: ThemeLogoAssetSlot) => {
  if (slot === "primary") return "assetId" as const;
  if (slot === "light") return "lightAssetId" as const;
  if (slot === "dark") return "darkAssetId" as const;
  return "fallbackAssetId" as const;
};

const slotLabel: Record<ThemeLogoAssetSlot, string> = {
  primary: "Primary",
  light: "For dark headers",
  dark: "For light headers",
  fallback: "Fallback",
};

export const ThemeLogoInspector = ({
  settings,
  activeBreakpoint,
  onChange,
  onUpload,
  onResetPlacement,
  products = [],
  collections = [],
  pages = [],
  sections = [],
  replaceOnly = false,
}: ThemeLogoInspectorProps) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploadSlot, setUploadSlot] = useState<ThemeLogoAssetSlot>("primary");
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const placement = settings.logo.placement[activeBreakpoint];

  const update = (mutate: (next: ThemeChromeSettings) => void) => {
    const next = structuredClone(settings);
    mutate(next);
    try {
      onChange(next);
      setError(null);
    } catch (updateError) {
      setError(
        updateError instanceof Error
          ? updateError.message
          : "The logo setting could not be applied.",
      );
    }
  };

  const chooseFile = (slot: ThemeLogoAssetSlot) => {
    setUploadSlot(slot);
    setError(null);
    inputRef.current?.click();
  };

  const upload = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setUploading(true);
    setError(null);
    try {
      await onUpload(file, uploadSlot);
    } catch (uploadError) {
      setError(
        uploadError instanceof Error
          ? uploadError.message
          : "The logo could not be imported.",
      );
    } finally {
      setUploading(false);
    }
  };

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="text-[11px] font-bold uppercase text-[#b8b8b8]">Store logo</div>
        <span className="text-[9px] uppercase text-[#808080]">{activeBreakpoint}</span>
      </div>

      <input
        ref={inputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/svg+xml,.svg"
        onChange={(event) => void upload(event)}
        className="hidden"
      />

      <div className="grid grid-cols-2 gap-1.5">
        {(Object.keys(slotLabel) as ThemeLogoAssetSlot[]).map((slot) => {
          const present =
            Boolean(settings.logo[assetKey(slot)]) ||
            (slot === "primary" && Boolean(settings.logo.src));
          return (
            <div key={slot} className="rounded border border-[#444] bg-[#262626] p-1.5">
              <div className="mb-1 truncate text-[9px] text-[#aaa]">{slotLabel[slot]}</div>
              <div className="flex gap-1">
                <Button
                  type="button"
                  variant="outline"
                  className="h-7 min-w-0 flex-1 border-[#4b4b4b] bg-transparent px-1 text-[9px] text-white hover:bg-white/10"
                  disabled={uploading}
                  onClick={() => chooseFile(slot)}
                >
                  <ImagePlus size={11} className="mr-1 shrink-0" />
                  {present ? "Replace" : "Add"}
                </Button>
                {present && !replaceOnly ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label={`Remove ${slotLabel[slot]} logo`}
                    className="h-7 w-7 text-red-300 hover:bg-red-500/10"
                    onClick={() =>
                      update((next) => {
                        next.logo[assetKey(slot)] = null;
                        if (slot === "primary") next.logo.src = null;
                      })
                    }
                  >
                    <Trash2 size={11} />
                  </Button>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>

      {error ? (
        <p role="alert" className="rounded border border-red-500/40 bg-red-500/10 px-2 py-1.5 text-[10px] leading-4 text-red-200">
          {error}
        </p>
      ) : null}

      {replaceOnly ? (
        <p className="rounded border border-[#444] bg-[#262626] px-2 py-2 text-[10px] leading-4 text-[#aaa]">
          Fixed mode preserves logo placement and navigation behavior.
        </p>
      ) : null}

      {!replaceOnly ? <><label className="block">
        <span className="mb-1 block text-[9px] font-semibold uppercase text-[#999]">Alt text</span>
        <Input
          value={settings.logo.altText}
          onChange={(event) =>
            update((next) => {
              next.logo.altText = event.target.value;
            })
          }
          className="h-8 border-[#444] bg-[#333] text-xs text-white"
        />
      </label>

      <div>
        <span className="mb-1 block text-[9px] font-semibold uppercase text-[#999]">
          Link destination
        </span>
        <NavigationTargetControl
          value={settings.logo.linkDestination}
          products={products}
          collections={collections}
          pages={pages}
          sections={sections}
          onChange={(target) =>
            update((next) => {
              next.logo.linkDestination = target;
            })
          }
        />
      </div>

      <label className="flex items-start justify-between gap-3 rounded border border-[#444] bg-[#262626] px-2 py-2 text-[10px] text-white">
        <span>
          <span className="block font-semibold">Auto responsive placement</span>
          <span className="mt-0.5 block text-[9px] leading-4 text-[#8f8f8f]">
            Dragging or resizing keeps the logo anchored across all devices.
          </span>
        </span>
        <input
          type="checkbox"
          className="mt-0.5"
          checked={settings.logo.responsiveMode === "auto"}
          onChange={(event) =>
            update((next) => {
              next.logo.responsiveMode = event.target.checked ? "auto" : "independent";
            })
          }
        />
      </label>

      <div className="grid grid-cols-3 gap-1.5">
        {[
          ["Width", "width"],
          ["Minimum", "minWidth"],
          ["Maximum", "maxWidth"],
        ].map(([label, key]) => (
          <label key={key} className="block">
            <span className="mb-1 block text-[8px] font-semibold uppercase text-[#888]">{label}</span>
            <Input
              type="number"
              min={1}
              max={key === "maxWidth" ? 2048 : 1024}
              value={placement[key as "width" | "minWidth" | "maxWidth"]}
              onChange={(event) =>
                update((next) => {
                  const current = next.logo.placement[activeBreakpoint];
                  const previousWidth = current.width;
                  const value = Math.max(1, Number(event.target.value) || 1);
                  if (key === "minWidth") {
                    current.minWidth = Math.min(value, current.maxWidth);
                    current.width = Math.max(current.width, current.minWidth);
                  } else if (key === "maxWidth") {
                    current.maxWidth = Math.max(value, current.minWidth);
                    current.width = Math.min(current.width, current.maxWidth);
                  } else {
                    current.width = Math.max(
                      current.minWidth,
                      Math.min(current.maxWidth, value),
                    );
                  }
                  if (
                    key === "width" &&
                    next.logo.responsiveMode === "auto" &&
                    previousWidth > 0
                  ) {
                    const ratio = current.width / previousWidth;
                    (Object.keys(next.logo.placement) as ThemeChromeBreakpoint[])
                      .filter((breakpoint) => breakpoint !== activeBreakpoint)
                      .forEach((breakpoint) => {
                        const linked = next.logo.placement[breakpoint];
                        linked.width = Math.max(
                          linked.minWidth,
                          Math.min(linked.maxWidth, linked.width * ratio),
                        );
                      });
                  }
                })
              }
              className="h-8 border-[#444] bg-[#333] px-2 text-[10px] text-white"
            />
          </label>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-1.5">
        <label className="block">
          <span className="mb-1 block text-[8px] font-semibold uppercase text-[#888]">
            Height mode
          </span>
          <select
            value={placement.heightMode}
            onChange={(event) =>
              update((next) => {
                const heightMode = event.target.value as typeof placement.heightMode;
                const targets = next.logo.responsiveMode === "auto"
                  ? Object.values(next.logo.placement)
                  : [next.logo.placement[activeBreakpoint]];
                targets.forEach((target) => { target.heightMode = heightMode; });
              })
            }
            className="h-8 w-full rounded border border-[#444] bg-[#333] px-2 text-[10px] text-white"
          >
            <option value="auto">Auto</option>
            <option value="fit-header">Fit header</option>
          </select>
        </label>
        <label className="block">
          <span className="mb-1 block text-[8px] font-semibold uppercase text-[#888]">Image alignment</span>
          <select
            value={placement.alignment}
            onChange={(event) =>
              update((next) => {
                const alignment = event.target.value as typeof placement.alignment;
                const targets = next.logo.responsiveMode === "auto"
                  ? Object.values(next.logo.placement)
                  : [next.logo.placement[activeBreakpoint]];
                targets.forEach((target) => { target.alignment = alignment; });
              })
            }
            className="h-8 w-full rounded border border-[#444] bg-[#333] px-2 text-[10px] text-white"
          >
            <option value="left">Left</option>
            <option value="center">Center</option>
            <option value="right">Right</option>
          </select>
        </label>
      </div>

      <div className="grid grid-cols-2 gap-1.5">
        <label className="block">
          <span className="mb-1 block text-[8px] font-semibold uppercase text-[#888]">Header position</span>
          <select
            value={placement.headerPosition}
            onChange={(event) =>
              update((next) => {
                const headerPosition = event.target.value as typeof placement.headerPosition;
                const targets = next.logo.responsiveMode === "auto"
                  ? Object.values(next.logo.placement)
                  : [next.logo.placement[activeBreakpoint]];
                targets.forEach((target) => { target.headerPosition = headerPosition; });
              })
            }
            className="h-8 w-full rounded border border-[#444] bg-[#333] px-2 text-[10px] text-white"
          >
            <option value="theme">Theme default</option>
            <option value="start">Start</option>
            <option value="center">Center</option>
            <option value="end">End</option>
          </select>
        </label>
        <label className="flex h-8 items-center justify-between rounded border border-[#444] bg-[#333] px-2 text-[10px] text-white">
          <span>Visible</span>
          <input
            type="checkbox"
            checked={placement.visible}
            onChange={(event) =>
              update((next) => {
                const targets = next.logo.responsiveMode === "auto"
                  ? Object.values(next.logo.placement)
                  : [next.logo.placement[activeBreakpoint]];
                targets.forEach((target) => { target.visible = event.target.checked; });
              })
            }
          />
        </label>
        <label className="block">
          <span className="sr-only">Logo padding</span>
          <Input
            type="number"
            min={0}
            max={128}
            aria-label="Logo padding"
            value={placement.padding}
            onChange={(event) =>
              update((next) => {
                const padding = Math.max(0, Number(event.target.value) || 0);
                const targets = next.logo.responsiveMode === "auto"
                  ? Object.values(next.logo.placement)
                  : [next.logo.placement[activeBreakpoint]];
                targets.forEach((target) => { target.padding = padding; });
              })
            }
            className="h-8 border-[#444] bg-[#333] px-2 text-[10px] text-white"
          />
        </label>
      </div>

      <Button
        type="button"
        variant="outline"
        className="h-8 w-full border-[#444] bg-transparent text-[10px] text-white hover:bg-white/10"
        onClick={onResetPlacement}
      >
        <RotateCcw size={12} className="mr-1.5" />
        Reset {activeBreakpoint} placement
      </Button>
      </> : null}
    </section>
  );
};
