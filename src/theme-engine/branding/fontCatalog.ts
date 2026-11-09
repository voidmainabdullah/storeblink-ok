import type { ThemeFontDefinition, ThemeFontPairing } from "./types";

export const THEME_FONT_CATALOG: readonly ThemeFontDefinition[] = [
  {
    id: "inter",
    label: "Inter",
    family: "Inter",
    stack: "Inter, ui-sans-serif, system-ui, sans-serif",
    googleFamily: "Inter:wght@400;500;600;700;800",
  },
  {
    id: "dm-sans",
    label: "DM Sans",
    family: "DM Sans",
    stack: "'DM Sans', ui-sans-serif, system-ui, sans-serif",
    googleFamily: "DM+Sans:wght@400;500;600;700;800",
  },
  {
    id: "manrope",
    label: "Manrope",
    family: "Manrope",
    stack: "Manrope, ui-sans-serif, system-ui, sans-serif",
    googleFamily: "Manrope:wght@400;500;600;700;800",
  },
  {
    id: "space-grotesk",
    label: "Space Grotesk",
    family: "Space Grotesk",
    stack: "'Space Grotesk', ui-sans-serif, system-ui, sans-serif",
    googleFamily: "Space+Grotesk:wght@400;500;600;700",
  },
  {
    id: "montserrat",
    label: "Montserrat",
    family: "Montserrat",
    stack: "Montserrat, ui-sans-serif, system-ui, sans-serif",
    googleFamily: "Montserrat:wght@400;500;600;700;800",
  },
  {
    id: "poppins",
    label: "Poppins",
    family: "Poppins",
    stack: "Poppins, ui-sans-serif, system-ui, sans-serif",
    googleFamily: "Poppins:wght@400;500;600;700;800",
  },
  {
    id: "playfair-display",
    label: "Playfair Display",
    family: "Playfair Display",
    stack: "'Playfair Display', Georgia, serif",
    googleFamily: "Playfair+Display:wght@400;500;600;700;800",
  },
  {
    id: "cormorant-garamond",
    label: "Cormorant Garamond",
    family: "Cormorant Garamond",
    stack: "'Cormorant Garamond', Georgia, serif",
    googleFamily: "Cormorant+Garamond:wght@400;500;600;700",
  },
  {
    id: "lora",
    label: "Lora",
    family: "Lora",
    stack: "Lora, Georgia, serif",
    googleFamily: "Lora:ital,wght@0,400;0,500;0,600;0,700;1,400;1,500",
  },
  {
    id: "libre-baskerville",
    label: "Libre Baskerville",
    family: "Libre Baskerville",
    stack: "'Libre Baskerville', Georgia, serif",
    googleFamily: "Libre+Baskerville:ital,wght@0,400;0,700;1,400",
  },
  {
    id: "arial",
    label: "Arial",
    family: "Arial",
    stack: "Arial, Helvetica, ui-sans-serif, system-ui, sans-serif",
  },
  {
    id: "georgia",
    label: "Georgia",
    family: "Georgia",
    stack: "Georgia, 'Times New Roman', serif",
  },
] as const;

export const THEME_FONT_PAIRINGS: readonly ThemeFontPairing[] = [
  {
    id: "modern",
    label: "Modern",
    description: "Crisp display type with a neutral, highly readable body.",
    headingFontId: "space-grotesk",
    bodyFontId: "inter",
    accentFontId: "lora",
    uiFontId: "inter",
  },
  {
    id: "editorial",
    label: "Editorial",
    description: "Expressive serif headings balanced by a quiet sans-serif body.",
    headingFontId: "playfair-display",
    bodyFontId: "dm-sans",
    accentFontId: "lora",
    uiFontId: "dm-sans",
  },
  {
    id: "premium",
    label: "Premium",
    description: "Refined high-contrast typography for luxury-led storefronts.",
    headingFontId: "cormorant-garamond",
    bodyFontId: "manrope",
    accentFontId: "libre-baskerville",
    uiFontId: "manrope",
  },
  {
    id: "geometric",
    label: "Geometric",
    description: "Confident geometric headings with a restrained commerce UI.",
    headingFontId: "montserrat",
    bodyFontId: "inter",
    accentFontId: "montserrat",
    uiFontId: "inter",
  },
  {
    id: "friendly",
    label: "Friendly",
    description: "Soft rounded headings and relaxed body typography.",
    headingFontId: "poppins",
    bodyFontId: "dm-sans",
    accentFontId: "lora",
    uiFontId: "dm-sans",
  },
  {
    id: "system",
    label: "System",
    description: "Fast, dependency-free typography using platform fonts.",
    headingFontId: "arial",
    bodyFontId: "arial",
    accentFontId: "georgia",
    uiFontId: "arial",
  },
] as const;

export const themeFontById = (id: string): ThemeFontDefinition =>
  THEME_FONT_CATALOG.find((font) => font.id === id) ?? THEME_FONT_CATALOG[0];

export const themeFontIdForFamily = (value: unknown, fallback = "inter"): string => {
  const family = String(value ?? "")
    .replace(/["']/g, "")
    .split(",")[0]
    .trim()
    .toLowerCase();
  return THEME_FONT_CATALOG.find((font) => font.family.toLowerCase() === family)?.id ?? fallback;
};

export const themeFontPairingById = (id: string): ThemeFontPairing =>
  THEME_FONT_PAIRINGS.find((pairing) => pairing.id === id) ?? THEME_FONT_PAIRINGS[0];
