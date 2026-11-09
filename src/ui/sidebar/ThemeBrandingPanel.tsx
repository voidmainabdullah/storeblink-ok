import {
  THEME_FONT_CATALOG,
  THEME_FONT_PAIRINGS,
  themeBrandingSystem,
  type ThemeBrandingSettings,
} from "@/theme-engine/branding";

export type ThemeBrandingPanelProps = {
  settings: ThemeBrandingSettings;
  onChange: (settings: ThemeBrandingSettings) => void;
};

const selectClass =
  "h-9 w-full rounded-md border border-[#4b4b4b] bg-[#242424] px-3 text-xs text-white outline-none transition-colors focus:border-[#3b9cff]";

export const ThemeBrandingPanel = ({ settings, onChange }: ThemeBrandingPanelProps) => {
  const updateFont = (
    key: "headingFontId" | "bodyFontId" | "accentFontId" | "uiFontId",
    fontId: string,
  ) => {
    onChange({ ...settings, enabled: true, pairingId: "custom", [key]: fontId });
  };

  return (
    <section className="space-y-4 border-b border-[#444] pb-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="text-xs font-semibold text-white">Brand typography</div>
          <p className="mt-1 text-[11px] leading-4 text-[#a8a8a8]">One readable type system across your store.</p>
        </div>
        <label className="inline-flex min-h-9 items-center gap-2 text-xs text-[#d8d8d8]">
          <span>{settings.enabled ? "On" : "Off"}</span>
          <input
            type="checkbox"
            checked={settings.enabled}
            onChange={(event) => onChange({ ...settings, enabled: event.target.checked })}
          />
        </label>
      </div>

      <label className="block">
        <span className="mb-1.5 block text-[11px] font-medium text-[#b8b8b8]">Font pairing</span>
        <select
          value={settings.pairingId}
          className={selectClass}
          onChange={(event) =>
            onChange(themeBrandingSystem.applyPairing(settings, event.target.value))
          }
        >
          {settings.pairingId === "custom" ? <option value="custom">Custom pairing</option> : null}
          {THEME_FONT_PAIRINGS.map((pairing) => (
            <option key={pairing.id} value={pairing.id}>{pairing.label}</option>
          ))}
        </select>
      </label>

      <div className="grid grid-cols-2 gap-2">
        {([
          ["Headings", "headingFontId"],
          ["Paragraphs", "bodyFontId"],
          ["Accents", "accentFontId"],
          ["Navigation and UI", "uiFontId"],
        ] as const).map(([label, key]) => (
          <label key={key} className="block min-w-0">
            <span className="mb-1.5 block truncate text-[11px] font-medium text-[#b8b8b8]">{label}</span>
            <select
              value={settings[key]}
              className={selectClass}
              onChange={(event) => updateFont(key, event.target.value)}
            >
              {THEME_FONT_CATALOG.map((font) => (
                <option key={font.id} value={font.id}>{font.label}</option>
              ))}
            </select>
          </label>
        ))}
      </div>

      <div className="overflow-hidden rounded-md border border-[#4b4b4b] bg-[#f7f7f5] p-3 text-[#161616]">
        <div
          className="truncate text-lg font-semibold"
          style={{ fontFamily: THEME_FONT_CATALOG.find((font) => font.id === settings.headingFontId)?.stack }}
        >
          Store heading
        </div>
        <p
          className="mt-1 text-xs leading-5 text-[#5f5f5f]"
          style={{ fontFamily: THEME_FONT_CATALOG.find((font) => font.id === settings.bodyFontId)?.stack }}
        >
          Product stories and descriptions stay readable.
        </p>
      </div>
    </section>
  );
};
