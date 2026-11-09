export type ThemeTypographyRole = "heading" | "body" | "accent" | "ui";

export type ThemeFontDefinition = Readonly<{
  id: string;
  label: string;
  family: string;
  stack: string;
  googleFamily?: string;
}>;

export type ThemeFontPairing = Readonly<{
  id: string;
  label: string;
  description: string;
  headingFontId: string;
  bodyFontId: string;
  accentFontId: string;
  uiFontId: string;
}>;

export type ThemeBrandingSettings = {
  version: 1;
  enabled: boolean;
  pairingId: string;
  headingFontId: string;
  bodyFontId: string;
  accentFontId: string;
  uiFontId: string;
};
