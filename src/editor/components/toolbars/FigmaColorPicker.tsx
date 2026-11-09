import { useEffect, useMemo, useState } from "react";
import { Pipette, X } from "lucide-react";
import { normalizePaletteHex, paletteSystem } from "@/assets/palettes";
import { usePaletteStore } from "@/stores/palette.store";

const DEFAULT_SWATCHES = [
  "#171A1F",
  "#FFFFFF",
  "#F3F4F6",
  "#6B7280",
  "#111827",
  "#0178ff",
  "#18A058",
  "#F59E0B",
  "#EF4444",
  "#8B5CF6",
  "#06B6D4",
  "#EC4899",
  "#F97316",
  "#84CC16",
  "#0F172A",
  "#E5E7EB",
  "#000000",
  "#FAFAFA",
];

type RgbColor = { r: number; g: number; b: number };

type EyeDropperResult = { sRGBHex: string };
type EyeDropperInstance = { open: () => Promise<EyeDropperResult> };
type EyeDropperConstructor = new () => EyeDropperInstance;

const normalizeHex = (value?: string) => normalizePaletteHex(value ?? "") ?? "#171A1F";
const clampChannel = (value: number) => Math.max(0, Math.min(255, Math.round(Number.isFinite(value) ? value : 0)));

const hexToRgb = (hex: string): RgbColor => {
  const normalized = normalizeHex(hex).slice(1);
  return {
    r: Number.parseInt(normalized.slice(0, 2), 16),
    g: Number.parseInt(normalized.slice(2, 4), 16),
    b: Number.parseInt(normalized.slice(4, 6), 16),
  };
};

const rgbToHex = ({ r, g, b }: RgbColor): string =>
  `#${[r, g, b].map((channel) => clampChannel(channel).toString(16).padStart(2, "0")).join("")}`.toUpperCase();

const ColorSection = ({ title, colors, active, onSelect }: {
  title: string;
  colors: string[];
  active: string;
  onSelect: (color: string) => void;
}) => {
  if (!colors.length) return null;
  return (
    <section>
      <div className="mb-1.5 text-[10px] font-semibold text-[#b8b8b8]">{title}</div>
      <div className="grid grid-cols-9 gap-1.5">
        {colors.map((color) => (
          <button
            type="button"
            key={color}
            onClick={() => onSelect(color)}
            className={`h-5 w-5 rounded border ${normalizeHex(color) === active ? "border-[#0178ff] ring-1 ring-[#0178ff]" : "border-[#565656]"}`}
            style={{ background: color }}
            aria-label={`Set color ${color}`}
          />
        ))}
      </div>
    </section>
  );
};

export type FigmaColorPickerProps = {
  value?: string;
  label: string;
  onChange: (value: string) => void;
  align?: "left" | "right";
  opacity?: number;
  onOpacityChange?: (opacity: number) => void;
  brandColors?: string[];
};

export const FigmaColorPicker = ({
  value,
  label,
  onChange,
  align = "right",
  opacity,
  onOpacityChange,
  brandColors = [],
}: FigmaColorPickerProps) => {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(normalizeHex(value));
  const [format, setFormat] = useState<"hex" | "rgb">("hex");
  const [localOpacity, setLocalOpacity] = useState(opacity ?? 100);
  const recentColors = usePaletteStore((state) => state.recentColors);
  const storedBrandColors = usePaletteStore((state) => state.brandColors);
  const hex = normalizeHex(value ?? draft);
  const rgb = hexToRgb(hex);
  const resolvedOpacity = opacity ?? localOpacity;

  useEffect(() => {
    paletteSystem.hydrate();
  }, []);

  useEffect(() => {
    if (brandColors.length) paletteSystem.setBrandColors(brandColors);
  }, [brandColors]);

  useEffect(() => {
    setDraft(hex);
  }, [hex]);

  const palette = useMemo(
    () => Array.from(new Set([hex, ...DEFAULT_SWATCHES])).slice(0, 27),
    [hex],
  );

  const commit = (next: string) => {
    const normalized = normalizeHex(next);
    setDraft(normalized);
    paletteSystem.recordColor(normalized);
    onChange(normalized);
  };

  const commitOpacity = (next: number) => {
    const normalized = Math.max(0, Math.min(100, Math.round(next)));
    setLocalOpacity(normalized);
    onOpacityChange?.(normalized);
  };

  const updateRgbChannel = (channel: keyof RgbColor, value: number) => {
    commit(rgbToHex({ ...rgb, [channel]: clampChannel(value) }));
  };

  const pickFromScreen = async () => {
    if (typeof window === "undefined") return;
    const EyeDropper = (window as typeof window & { EyeDropper?: EyeDropperConstructor }).EyeDropper;
    if (!EyeDropper) return;
    try {
      const result = await new EyeDropper().open();
      commit(result.sRGBHex);
    } catch {
      // The browser rejects when the user cancels the eyedropper.
    }
  };

  const eyedropperSupported =
    typeof window !== "undefined" &&
    Boolean((window as typeof window & { EyeDropper?: EyeDropperConstructor }).EyeDropper);

  return (
    <div className="relative">
      <button
        type="button"
        aria-label={label}
        title={label}
        onClick={() => setOpen((current) => !current)}
        className="grid h-7 w-7 place-items-center rounded hover:bg-muted"
      >
        <span className="h-4 w-4 rounded border border-white/70 shadow-sm" style={{ background: hex, opacity: resolvedOpacity / 100 }} />
      </button>
      {open && (
        <div
          className={`absolute top-full z-[80] mt-2 w-[286px] rounded-md border border-[#454545] bg-[#2c2c2c] p-3 text-white shadow-2xl ${align === "right" ? "right-0" : "left-0"}`}
          onMouseDown={(event) => event.stopPropagation()}
        >
          <div className="mb-3 flex items-center justify-between">
            <div>
              <div className="text-[12px] font-semibold">{label}</div>
              <div className="text-[10px] text-[#9a9a9a]">Color and opacity</div>
            </div>
            <button type="button" onClick={() => setOpen(false)} className="grid h-7 w-7 place-items-center rounded text-[#b8b8b8] hover:bg-white/10 hover:text-white">
              <X size={14} />
            </button>
          </div>

          <label className="relative block h-[150px] overflow-hidden rounded border border-[#444]">
            <span
              className="absolute inset-0"
              style={{
                background: `linear-gradient(to top, #000 0%, transparent 70%), linear-gradient(to right, #fff 0%, ${hex} 100%)`,
              }}
            />
            <input
              type="color"
              value={hex}
              onChange={(event) => commit(event.target.value)}
              className="absolute inset-0 h-full w-full cursor-crosshair opacity-0"
              aria-label={`${label} visual picker`}
            />
          </label>

          <div className="mt-3 flex items-center gap-2">
            <button
              type="button"
              onClick={pickFromScreen}
              disabled={!eyedropperSupported}
              className="grid h-8 w-8 place-items-center rounded border border-[#4a4a4a] text-[#d8d8d8] hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-35"
              title={eyedropperSupported ? "Pick color from screen" : "Eyedropper is not supported by this browser"}
            >
              <Pipette size={14} />
            </button>
            <input
              type="color"
              value={hex}
              onChange={(event) => commit(event.target.value)}
              className="h-8 flex-1 cursor-pointer rounded border border-[#4a4a4a] bg-[#333] p-1"
              aria-label={`${label} hue`}
            />
            <span className="h-8 w-8 rounded border border-white/40" style={{ background: hex, opacity: resolvedOpacity / 100 }} />
          </div>

          <div className="mt-3 flex rounded bg-[#202020] p-1">
            {(["hex", "rgb"] as const).map((mode) => (
              <button
                key={mode}
                type="button"
                onClick={() => setFormat(mode)}
                className={`h-7 flex-1 rounded text-[10px] font-bold uppercase ${format === mode ? "bg-[#444] text-white" : "text-[#a8a8a8] hover:text-white"}`}
              >
                {mode}
              </button>
            ))}
          </div>

          {format === "hex" ? (
            <label className="mt-2 block">
              <span className="mb-1 block text-[9px] font-semibold uppercase text-[#9a9a9a]">Hex</span>
              <input
                value={draft.replace("#", "")}
                onChange={(event) => {
                  const next = event.target.value.replace(/[^0-9a-f]/gi, "").slice(0, 6);
                  setDraft(`#${next}`);
                  if (next.length === 6) commit(`#${next}`);
                }}
                onBlur={() => setDraft(hex)}
                className="h-8 w-full rounded border border-[#4a4a4a] bg-[#333] px-2 text-[11px] font-semibold uppercase outline-none focus:border-[#0178ff]"
              />
            </label>
          ) : (
            <div className="mt-2 grid grid-cols-3 gap-2">
              {(["r", "g", "b"] as const).map((channel) => (
                <label key={channel}>
                  <span className="mb-1 block text-[9px] font-semibold uppercase text-[#9a9a9a]">{channel}</span>
                  <input
                    type="number"
                    min={0}
                    max={255}
                    value={rgb[channel]}
                    onChange={(event) => updateRgbChannel(channel, Number(event.target.value))}
                    className="h-8 w-full rounded border border-[#4a4a4a] bg-[#333] px-2 text-[11px] font-semibold outline-none focus:border-[#0178ff]"
                  />
                </label>
              ))}
            </div>
          )}

          <div className="mt-3">
            <div className="mb-1 flex items-center justify-between text-[10px] text-[#b8b8b8]">
              <span>Opacity</span>
              <span className="tabular-nums">{resolvedOpacity}%</span>
            </div>
            <input
              type="range"
              min={0}
              max={100}
              value={resolvedOpacity}
              onChange={(event) => commitOpacity(Number(event.target.value))}
              className="h-1.5 w-full cursor-pointer accent-[#0178ff]"
              aria-label={`${label} opacity`}
            />
          </div>

          <div className="mt-4 space-y-3 border-t border-[#454545] pt-3">
            <ColorSection title="Recent colors" colors={recentColors} active={hex} onSelect={commit} />
            <ColorSection title="Brand colors" colors={storedBrandColors} active={hex} onSelect={commit} />
            <ColorSection title="Color palette" colors={palette} active={hex} onSelect={commit} />
          </div>
        </div>
      )}
    </div>
  );
};
