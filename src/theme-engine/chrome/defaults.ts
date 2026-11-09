import type {
  ThemeChromeIconSlot,
  ThemeChromeSettings,
  ThemeIconConfig,
} from "./types";

export const DEFAULT_THEME_ICONS: Record<ThemeChromeIconSlot, ThemeIconConfig> = {
  account: {
    library: "heroicons",
    name: "UserIcon",
    color: "#111111",
    size: 24,
  },
  cart: {
    library: "heroicons",
    name: "ShoppingCartIcon",
    color: "#111111",
    size: 24,
  },
  search: {
    library: "heroicons",
    name: "MagnifyingGlassIcon",
    color: "#111111",
    size: 24,
  },
};

const navigationIconNames: Record<string, string> = {
  home: "HomeIcon",
  products: "ShoppingBagIcon",
  catalog: "ShoppingBagIcon",
  shop: "ShoppingBagIcon",
  about: "InformationCircleIcon",
  contact: "EnvelopeIcon",
};

export const defaultNavigationIcon = (id: string): ThemeIconConfig | null => {
  const normalized = id.trim().toLowerCase();
  const name = navigationIconNames[normalized];
  return name
    ? {
        library: "heroicons",
        name,
        color: "#111111",
        size: 18,
      }
    : null;
};

export const DEFAULT_THEME_CHROME_SETTINGS: ThemeChromeSettings = {
  icons: structuredClone(DEFAULT_THEME_ICONS),
  navigationIcons: {},
  mobileMenu: {
    animation: "slideIn",
    presentation: "drawer",
    breakpoint: 768,
    customIconAssetId: null,
    icon: {
      desktop: {
        kind: "three-line",
        size: 24,
        strokeWidth: 2,
        color: "#111111",
        background: "transparent",
        borderColor: "transparent",
        borderWidth: 0,
        radius: 999,
        padding: 6,
      },
      tablet: {
        kind: "three-line",
        size: 24,
        strokeWidth: 2,
        color: "#111111",
        background: "transparent",
        borderColor: "transparent",
        borderWidth: 0,
        radius: 999,
        padding: 6,
      },
      mobile: {
        kind: "three-line",
        size: 22,
        strokeWidth: 2,
        color: "#111111",
        background: "transparent",
        borderColor: "transparent",
        borderWidth: 0,
        radius: 999,
        padding: 5,
      },
    },
  },
  logo: {
    assetId: null,
    lightAssetId: null,
    darkAssetId: null,
    fallbackAssetId: null,
    altText: "Store logo",
    linkDestination: { type: "route", routeKey: "home" },
    responsiveMode: "auto",
    src: null,
    placement: {
      desktop: {
        width: 160,
        minWidth: 40,
        maxWidth: 320,
        heightMode: "auto",
        alignment: "left",
        objectFit: "contain",
        headerPosition: "theme",
        padding: 0,
        visible: true,
      },
      tablet: {
        width: 140,
        minWidth: 36,
        maxWidth: 260,
        heightMode: "auto",
        alignment: "left",
        objectFit: "contain",
        headerPosition: "theme",
        padding: 0,
        visible: true,
      },
      mobile: {
        width: 112,
        minWidth: 32,
        maxWidth: 180,
        heightMode: "auto",
        alignment: "left",
        objectFit: "contain",
        headerPosition: "theme",
        padding: 0,
        visible: true,
      },
    },
  },
};
