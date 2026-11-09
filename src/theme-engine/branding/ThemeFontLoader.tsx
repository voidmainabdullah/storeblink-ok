import { useEffect } from "react";
import { themeFontById } from "./fontCatalog";
import type { ThemeBrandingSettings } from "./types";

const LINK_ID = "storeblink-theme-brand-fonts";

const stylesheetFor = (settings: ThemeBrandingSettings): string | null => {
  if (!settings.enabled) return null;
  const families = Array.from(new Set([
    settings.headingFontId,
    settings.bodyFontId,
    settings.accentFontId,
    settings.uiFontId,
  ].map((id) => themeFontById(id).googleFamily).filter((family): family is string => Boolean(family))));
  return families.length
    ? `https://fonts.googleapis.com/css2?${families.map((family) => `family=${family}`).join("&")}&display=swap`
    : null;
};

export const ThemeFontLoader = ({ settings }: { settings: ThemeBrandingSettings | null }) => {
  useEffect(() => {
    if (!settings) return;
    const href = stylesheetFor(settings);
    const existing = document.getElementById(LINK_ID) as HTMLLinkElement | null;
    if (!href) {
      existing?.remove();
      return;
    }
    if (existing?.href === href) return;
    const link = existing ?? document.createElement("link");
    link.id = LINK_ID;
    link.rel = "stylesheet";
    link.href = href;
    if (!existing) document.head.appendChild(link);
  }, [settings]);
  return null;
};
