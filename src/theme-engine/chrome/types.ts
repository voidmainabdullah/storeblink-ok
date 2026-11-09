import type { MenuTarget } from "@/content/menus";

export type ThemeIconLibrary =
  | "heroicons"
  | "phosphor"
  | "tabler"
  | "react-icons";

export type ThemeIconConfig = {
  library: ThemeIconLibrary;
  name: string;
  color: string;
  size: number;
};

export type ThemeChromeIconSlot = "account" | "cart" | "search";

export type MobileMenuAnimation = "slideIn" | "fadeScale";
export type MobileMenuPresentation = "drawer" | "dropdown" | "fullscreen";
export type ThemeMenuIconKind =
  | "minimal-two-line"
  | "three-line"
  | "grid"
  | "custom";
export type ThemeChromeBreakpoint = "desktop" | "tablet" | "mobile";
export type ThemeLogoAlignment = "left" | "center" | "right";
export type ThemeLogoHeaderPosition = "theme" | "start" | "center" | "end";
export type ThemeLogoHeightMode = "auto" | "fit-header";
export type ThemeLogoResponsiveMode = "auto" | "independent";

export type ThemeLogoPlacement = {
  width: number;
  minWidth: number;
  maxWidth: number;
  heightMode: ThemeLogoHeightMode;
  alignment: ThemeLogoAlignment;
  objectFit: "contain";
  headerPosition: ThemeLogoHeaderPosition;
  padding: number;
  visible: boolean;
};

export type ThemeLogoAssetSlot = "primary" | "light" | "dark" | "fallback";

export type ThemeLogoSettings = {
  assetId: string | null;
  lightAssetId: string | null;
  darkAssetId: string | null;
  fallbackAssetId: string | null;
  altText: string;
  linkDestination: MenuTarget;
  responsiveMode: ThemeLogoResponsiveMode;
  placement: Record<ThemeChromeBreakpoint, ThemeLogoPlacement>;
  /**
   * Read-only compatibility source for scenes saved before the Asset System.
   * New uploads always persist an asset ID instead.
   */
  src: string | null;
};

export type ThemeMenuIconStyle = {
  kind: ThemeMenuIconKind;
  size: number;
  strokeWidth: number;
  color: string;
  background: string;
  borderColor: string;
  borderWidth: number;
  radius: number;
  padding: number;
};

export type ThemeChromeSettings = {
  icons: Record<ThemeChromeIconSlot, ThemeIconConfig>;
  navigationIcons: Record<string, ThemeIconConfig | null>;
  mobileMenu: {
    animation: MobileMenuAnimation;
    presentation: MobileMenuPresentation;
    breakpoint: number;
    customIconAssetId: string | null;
    icon: Record<ThemeChromeBreakpoint, ThemeMenuIconStyle>;
  };
  logo: ThemeLogoSettings;
};

export type ThemeChromeNodeSlot =
  | ThemeChromeIconSlot
  | "nav-link"
  | "mobile-menu-trigger"
  | "mobile-menu"
  | "logo"
  | "logo-fallback";
