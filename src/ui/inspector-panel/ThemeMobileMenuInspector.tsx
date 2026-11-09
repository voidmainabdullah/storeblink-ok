import { useRef, useState, type ChangeEvent } from "react";
import { ImagePlus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  mobileMenuAnimationRegistry,
  type ThemeChromeBreakpoint,
  type ThemeChromeSettings,
} from "@/theme-engine/chrome";

export type ThemeMobileMenuInspectorProps = {
  settings: ThemeChromeSettings;
  activeBreakpoint: ThemeChromeBreakpoint;
  onChange: (settings: ThemeChromeSettings) => void;
  onUploadCustomIcon: (file: File) => Promise<void>;
};

export const ThemeMobileMenuInspector = ({
  settings,
  activeBreakpoint,
  onChange,
  onUploadCustomIcon,
}: ThemeMobileMenuInspectorProps) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const icon = settings.mobileMenu.icon[activeBreakpoint];

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
          : "The mobile navigation setting could not be applied.",
      );
    }
  };

  const upload = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setUploading(true);
    setError(null);
    try {
      await onUploadCustomIcon(file);
    } catch (uploadError) {
      setError(
        uploadError instanceof Error
          ? uploadError.message
          : "The custom menu icon could not be imported.",
      );
    } finally {
      setUploading(false);
    }
  };

  return (
    <section className="space-y-2.5">
      <div className="flex items-center justify-between">
        <div className="text-[11px] font-bold uppercase text-[#b8b8b8]">Mobile navigation</div>
        <span className="text-[9px] uppercase text-[#808080]">{activeBreakpoint}</span>
      </div>

      <div className="grid grid-cols-2 gap-1.5">
        <label>
          <span className="mb-1 block text-[8px] font-semibold uppercase text-[#888]">Presentation</span>
          <select
            value={settings.mobileMenu.presentation}
            onChange={(event) =>
              update((next) => {
                next.mobileMenu.presentation =
                  event.target.value as ThemeChromeSettings["mobileMenu"]["presentation"];
              })
            }
            className="h-8 w-full rounded border border-[#444] bg-[#333] px-2 text-[10px] text-white"
          >
            <option value="drawer">Drawer</option>
            <option value="dropdown">Dropdown</option>
            <option value="fullscreen">Full screen</option>
          </select>
        </label>
        <label>
          <span className="mb-1 block text-[8px] font-semibold uppercase text-[#888]">Animation</span>
          <select
            value={settings.mobileMenu.animation}
            onChange={(event) =>
              update((next) => {
                next.mobileMenu.animation =
                  event.target.value as ThemeChromeSettings["mobileMenu"]["animation"];
              })
            }
            className="h-8 w-full rounded border border-[#444] bg-[#333] px-2 text-[10px] text-white"
          >
            {mobileMenuAnimationRegistry.list().map((animation) => (
              <option key={animation.id} value={animation.id}>{animation.label}</option>
            ))}
          </select>
        </label>
      </div>

      <div className="grid grid-cols-[1fr_80px] gap-1.5">
        <label>
          <span className="mb-1 block text-[8px] font-semibold uppercase text-[#888]">Menu icon</span>
          <select
            value={icon.kind}
            onChange={(event) =>
              update((next) => {
                next.mobileMenu.icon[activeBreakpoint].kind =
                  event.target.value as typeof icon.kind;
              })
            }
            className="h-8 w-full rounded border border-[#444] bg-[#333] px-2 text-[10px] text-white"
          >
            <option value="minimal-two-line">Two lines</option>
            <option value="three-line">Three lines</option>
            <option value="grid">Grid</option>
            <option value="custom">Custom SVG</option>
          </select>
        </label>
        <label>
          <span className="mb-1 block text-[8px] font-semibold uppercase text-[#888]">Breakpoint</span>
          <Input
            type="number"
            min={320}
            max={1280}
            value={settings.mobileMenu.breakpoint}
            onChange={(event) =>
              update((next) => {
                next.mobileMenu.breakpoint = Math.max(
                  320,
                  Math.min(1280, Number(event.target.value) || 768),
                );
              })
            }
            className="h-8 border-[#444] bg-[#333] px-2 text-[10px] text-white"
          />
        </label>
      </div>

      {icon.kind === "custom" ? (
        <>
          <input
            ref={inputRef}
            type="file"
            accept="image/svg+xml,.svg"
            onChange={(event) => void upload(event)}
            className="hidden"
          />
          <div className="flex gap-1.5">
            <Button
              type="button"
              variant="outline"
              disabled={uploading}
              className="h-8 flex-1 border-[#444] bg-transparent text-[10px] text-white hover:bg-white/10"
              onClick={() => inputRef.current?.click()}
            >
              <ImagePlus size={12} className="mr-1.5" />
              {settings.mobileMenu.customIconAssetId ? "Replace custom SVG" : "Upload custom SVG"}
            </Button>
            {settings.mobileMenu.customIconAssetId ? (
              <Button
                type="button"
                size="icon"
                variant="ghost"
                aria-label="Remove custom menu icon"
                className="h-8 w-8 text-red-300 hover:bg-red-500/10"
                onClick={() =>
                  update((next) => {
                    next.mobileMenu.customIconAssetId = null;
                    next.mobileMenu.icon[activeBreakpoint].kind = "three-line";
                  })
                }
              >
                <Trash2 size={12} />
              </Button>
            ) : null}
          </div>
        </>
      ) : null}

      {error ? (
        <p role="alert" className="rounded border border-red-500/40 bg-red-500/10 px-2 py-1.5 text-[10px] leading-4 text-red-200">
          {error}
        </p>
      ) : null}

      <div className="grid grid-cols-2 gap-1.5">
        {[
          ["Size", "size", 16, 64],
          ["Stroke", "strokeWidth", 1, 6],
          ["Border", "borderWidth", 0, 8],
          ["Radius", "radius", 0, 999],
          ["Padding", "padding", 0, 32],
        ].map(([label, key, min, max]) => (
          <label key={String(key)}>
            <span className="mb-1 block text-[8px] font-semibold uppercase text-[#888]">{label}</span>
            <Input
              type="number"
              min={Number(min)}
              max={Number(max)}
              value={icon[key as "size" | "strokeWidth" | "borderWidth" | "radius" | "padding"]}
              onChange={(event) =>
                update((next) => {
                  next.mobileMenu.icon[activeBreakpoint][key as
                    | "size"
                    | "strokeWidth"
                    | "borderWidth"
                    | "radius"
                    | "padding"] = Math.max(Number(min), Math.min(Number(max), Number(event.target.value) || 0));
                })
              }
              className="h-8 border-[#444] bg-[#333] px-2 text-[10px] text-white"
            />
          </label>
        ))}
      </div>

      <div className="grid grid-cols-3 gap-1.5">
        {[
          ["Icon", "color"],
          ["Background", "background"],
          ["Border", "borderColor"],
        ].map(([label, key]) => (
          <label key={key} className="rounded border border-[#444] bg-[#333] p-1.5">
            <span className="mb-1 block truncate text-[8px] font-semibold uppercase text-[#888]">{label}</span>
            <input
              type="color"
              value={icon[key as "color" | "background" | "borderColor"] === "transparent"
                ? "#000000"
                : icon[key as "color" | "background" | "borderColor"]}
              onChange={(event) =>
                update((next) => {
                  next.mobileMenu.icon[activeBreakpoint][key as "color" | "background" | "borderColor"] =
                    event.target.value;
                })
              }
              className="h-6 w-full cursor-pointer border-0 bg-transparent"
            />
          </label>
        ))}
      </div>
    </section>
  );
};
