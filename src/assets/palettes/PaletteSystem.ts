import { usePaletteStore } from "@/stores/palette.store";

const RECENT_COLOR_KEY = "storeblink.editor.recent-colors";
const MAX_RECENT_COLORS = 12;

export const normalizePaletteHex = (value: string): string | null => {
  const raw = value.trim();
  if (/^#[0-9a-f]{6}$/i.test(raw)) return raw.toUpperCase();
  if (/^#[0-9a-f]{3}$/i.test(raw)) {
    return `#${raw[1]}${raw[1]}${raw[2]}${raw[2]}${raw[3]}${raw[3]}`.toUpperCase();
  }
  return null;
};

const normalizeList = (colors: string[]): string[] =>
  Array.from(new Set(colors.map(normalizePaletteHex).filter((color): color is string => Boolean(color))));

export class PaletteSystem {
  private hydrated = false;

  hydrate(): void {
    if (this.hydrated || typeof window === "undefined") return;
    this.hydrated = true;
    try {
      const stored = JSON.parse(window.localStorage.getItem(RECENT_COLOR_KEY) ?? "[]");
      if (Array.isArray(stored)) {
        usePaletteStore.getState().setRecentColorsFromPaletteSystem(normalizeList(stored).slice(0, MAX_RECENT_COLORS));
      }
    } catch {
      usePaletteStore.getState().setRecentColorsFromPaletteSystem([]);
    }
  }

  recordColor(color: string): void {
    const normalized = normalizePaletteHex(color);
    if (!normalized) return;
    const current = usePaletteStore.getState().recentColors;
    const recentColors = [normalized, ...current.filter((candidate) => candidate !== normalized)].slice(0, MAX_RECENT_COLORS);
    usePaletteStore.getState().setRecentColorsFromPaletteSystem(recentColors);
    if (typeof window !== "undefined") {
      try {
        window.localStorage.setItem(RECENT_COLOR_KEY, JSON.stringify(recentColors));
      } catch {
        // The in-memory palette remains usable when browser storage is blocked.
      }
    }
  }

  setBrandColors(colors: string[]): void {
    usePaletteStore.getState().setBrandColorsFromPaletteSystem(normalizeList(colors));
  }
}

export const paletteSystem = new PaletteSystem();
