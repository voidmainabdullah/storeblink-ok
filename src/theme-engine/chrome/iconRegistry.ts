import type { ComponentType, SVGProps } from "react";
import type { ThemeIconLibrary } from "./types";

export type ResolvedThemeIcon = ComponentType<
  SVGProps<SVGSVGElement> & { size?: number | string; color?: string; weight?: string }
>;

type IconModule = Record<string, unknown>;

const moduleLoaders: Record<ThemeIconLibrary, () => Promise<IconModule>> = {
  heroicons: async () => (await import("./icons/heroicons")).heroicons,
  phosphor: async () => (await import("./icons/phosphor")).phosphorIcons,
  tabler: async () => (await import("./icons/tabler")).tablerIcons,
  "react-icons": async () => (await import("./icons/reactIconsFeather")).reactIconsFeather,
};

const reactIconCatalog = [
  "FaBagShopping",
  "FaCartShopping",
  "FaCircleInfo",
  "FaHouse",
  "FaMagnifyingGlass",
  "FaRegEnvelope",
  "FaRegHeart",
  "FaRegUser",
  "FaXmark",
  "FiArrowLeft",
  "FiArrowRight",
  "FiBell",
  "FiCamera",
  "FiCheck",
  "FiChevronDown",
  "FiEdit3",
  "FiEye",
  "FiGlobe",
  "FiHeart",
  "FiHome",
  "FiImage",
  "FiInfo",
  "FiLock",
  "FiMail",
  "FiMapPin",
  "FiMenu",
  "FiMinus",
  "FiPause",
  "FiPhone",
  "FiPlay",
  "FiPlus",
  "FiSearch",
  "FiSettings",
  "FiShare2",
  "FiShoppingBag",
  "FiShoppingCart",
  "FiSmile",
  "FiStar",
  "FiTrash2",
  "FiUser",
  "FiX",
  "FiZap",
  "MdAccountCircle",
  "MdClose",
  "MdHome",
  "MdInfoOutline",
  "MdMailOutline",
  "MdMenu",
  "MdSearch",
  "MdShoppingBag",
  "MdShoppingCart",
] as const;

const moduleCache = new Map<ThemeIconLibrary, Promise<IconModule>>();
const componentCache = new Map<string, ResolvedThemeIcon | null>();

const loadModule = (library: ThemeIconLibrary): Promise<IconModule> => {
  const cached = moduleCache.get(library);
  if (cached) return cached;
  const pending = moduleLoaders[library]();
  moduleCache.set(library, pending);
  return pending;
};

const aliases: Partial<Record<ThemeIconLibrary, Record<string, string>>> = {
  tabler: {
    home: "IconHome",
    user: "IconUser",
    cart: "IconShoppingCart",
    search: "IconSearch",
  },
};

const componentName = (library: ThemeIconLibrary, name: string): string =>
  aliases[library]?.[name.toLowerCase()] ?? name;

const loadReactIconModule = async (name: string): Promise<IconModule> => {
  if (name.startsWith("Fa")) {
    return (await import("./icons/reactIconsFontAwesome")).reactIconsFontAwesome;
  }
  if (name.startsWith("Md")) {
    return (await import("./icons/reactIconsMaterial")).reactIconsMaterial;
  }
  return loadModule("react-icons");
};

export const resolveThemeIcon = async (
  library: ThemeIconLibrary,
  name: string,
): Promise<ResolvedThemeIcon | null> => {
  const key = `${library}:${name}`;
  if (componentCache.has(key)) return componentCache.get(key) ?? null;
  const module =
    library === "react-icons"
      ? await loadReactIconModule(name)
      : await loadModule(library);
  const candidate = module[componentName(library, name)];
  const component =
    typeof candidate === "function" ||
    (candidate && typeof candidate === "object")
      ? candidate as ResolvedThemeIcon
      : null;
  componentCache.set(key, component);
  return component;
};

export const loadThemeIconCatalog = async (
  library: ThemeIconLibrary,
): Promise<string[]> => {
  if (library === "react-icons") return [...reactIconCatalog];
  const module = await loadModule(library);
  return Object.keys(module)
    .sort((left, right) => left.localeCompare(right));
};
