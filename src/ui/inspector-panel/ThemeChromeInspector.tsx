import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  themeChromeNavigationId,
  themeChromeNodeSlot,
  type ThemeChromeIconSlot,
  type ThemeChromeBreakpoint,
  type ThemeChromeSettings,
  type ThemeIconConfig,
  type ThemeLogoAssetSlot,
} from "@/theme-engine/chrome";
import type { SceneNode } from "@/types";
import { ThemeIconPicker } from "./ThemeIconPicker";
import { ThemeLogoInspector } from "./ThemeLogoInspector";
import { ThemeMobileMenuInspector } from "./ThemeMobileMenuInspector";
import type {
  StructuredNavigationOption,
  StructuredProductOption,
} from "./StructuredInspectorFields";

export type ThemeChromeInspectorProps = {
  node?: SceneNode | null;
  settings: ThemeChromeSettings;
  activeBreakpoint: ThemeChromeBreakpoint;
  brandColors?: string[];
  onChange: (settings: ThemeChromeSettings) => void;
  onUploadLogo: (file: File, slot: ThemeLogoAssetSlot) => Promise<void>;
  onResetLogoPlacement: () => void;
  onUploadMenuIcon: (file: File) => Promise<void>;
  products?: StructuredProductOption[];
  collections?: StructuredNavigationOption[];
  pages?: StructuredNavigationOption[];
  sections?: StructuredNavigationOption[];
  contentOnly?: boolean;
};

const cloneSettings = (settings: ThemeChromeSettings): ThemeChromeSettings =>
  structuredClone(settings);

export const ThemeChromeInspector = ({
  node,
  settings,
  activeBreakpoint,
  brandColors = [],
  onChange,
  onUploadLogo,
  onResetLogoPlacement,
  onUploadMenuIcon,
  products = [],
  collections = [],
  pages = [],
  sections = [],
  contentOnly = false,
}: ThemeChromeInspectorProps) => {
  const slot = themeChromeNodeSlot(node ?? undefined);

  const setSlotIcon = (
    iconSlot: ThemeChromeIconSlot,
    icon: ThemeIconConfig,
  ) => {
    const next = cloneSettings(settings);
    next.icons[iconSlot] = icon;
    onChange(next);
  };

  const setNavigationIcon = (icon: ThemeIconConfig | null) => {
    if (!node) return;
    const navigationId = themeChromeNavigationId(node);
    const next = cloneSettings(settings);
    next.navigationIcons[navigationId] = icon;
    onChange(next);
  };

  const logoControls = (
    <ThemeLogoInspector
      settings={settings}
      activeBreakpoint={activeBreakpoint}
      onChange={onChange}
      onUpload={onUploadLogo}
      onResetPlacement={onResetLogoPlacement}
      products={products}
      collections={collections}
      pages={pages}
      sections={sections}
      replaceOnly={contentOnly}
    />
  );

  if (contentOnly) {
    if (slot === "logo" || slot === "logo-fallback" || !node) return logoControls;
    return null;
  }

  if (slot === "account" || slot === "cart" || slot === "search") {
    return (
      <section className="space-y-2">
        <div className="text-[11px] font-bold uppercase text-[#b8b8b8]">Theme icon</div>
        <ThemeIconPicker
          label={`${slot} icon`}
          value={settings.icons[slot]}
          brandColors={brandColors}
          onChange={(icon) => setSlotIcon(slot, icon)}
        />
      </section>
    );
  }

  if (slot === "nav-link" && node) {
    const navigationId = themeChromeNavigationId(node);
    const icon = settings.navigationIcons[navigationId] ?? null;
    const fallback = settings.icons.search;
    return (
      <section className="space-y-2">
        <div className="text-[11px] font-bold uppercase text-[#b8b8b8]">Navigation icon</div>
        <ThemeIconPicker
          label={`${String(node.props.label ?? node.name)} icon`}
          value={icon ?? fallback}
          brandColors={brandColors}
          onChange={setNavigationIcon}
        />
        {icon ? (
          <Button
            type="button"
            variant="outline"
            className="h-8 w-full border-[#444] bg-transparent text-xs text-white hover:bg-white/10"
            onClick={() => setNavigationIcon(null)}
          >
            <Trash2 size={13} className="mr-2" />
            Remove icon
          </Button>
        ) : null}
      </section>
    );
  }

  if (slot === "logo" || slot === "logo-fallback") return logoControls;

  if (node) return null;

  return (
    <section className="space-y-3">
      <div className="text-[11px] font-bold uppercase text-[#b8b8b8]">Theme chrome</div>
      {(["account", "cart", "search"] as ThemeChromeIconSlot[]).map((iconSlot) => (
        <ThemeIconPicker
          key={iconSlot}
          label={`${iconSlot} icon`}
          value={settings.icons[iconSlot]}
          brandColors={brandColors}
          onChange={(icon) => setSlotIcon(iconSlot, icon)}
        />
      ))}

      <ThemeMobileMenuInspector
        settings={settings}
        activeBreakpoint={activeBreakpoint}
        onChange={onChange}
        onUploadCustomIcon={onUploadMenuIcon}
      />

      {logoControls}
    </section>
  );
};
