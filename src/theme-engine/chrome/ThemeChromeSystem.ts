import { z } from "zod";
import { assetSystem, getAssetSource } from "@/assets/system/AssetSystem";
import type { ImageAssetRecord } from "@/assets/system/types";
import { cloneSceneTree } from "@/engine/scene-graph";
import {
  legacyNavigationTarget,
  menuTargetSchema,
  navigationSystem,
} from "@/content/menus";
import { responsiveSystem } from "@/layout/responsive";
import type { SceneNode, SceneTree } from "@/types";
import {
  DEFAULT_THEME_CHROME_SETTINGS,
  defaultNavigationIcon,
} from "./defaults";
import type {
  ThemeChromeNodeSlot,
  ThemeChromeSettings,
  ThemeChromeBreakpoint,
  ThemeIconConfig,
  ThemeLogoPlacement,
} from "./types";

const iconSchema = z.object({
  library: z.enum(["heroicons", "phosphor", "tabler", "react-icons"]),
  name: z.string().trim().min(1),
  color: z.string().trim().min(1),
  size: z.coerce.number().finite().min(16).max(48),
});

const logoPlacementSchema = z.object({
  width: z.coerce.number().finite().min(1).max(1024),
  minWidth: z.coerce.number().finite().min(1).max(1024),
  maxWidth: z.coerce.number().finite().min(1).max(2048),
  heightMode: z.enum(["auto", "fit-header"]),
  alignment: z.enum(["left", "center", "right"]),
  objectFit: z.literal("contain"),
  headerPosition: z.enum(["theme", "start", "center", "end"]),
  padding: z.coerce.number().finite().min(0).max(128),
  visible: z.boolean(),
}).superRefine((placement, context) => {
  if (placement.minWidth > placement.maxWidth) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Logo minimum width cannot exceed maximum width.",
    });
  }
});

const menuIconStyleSchema = z.object({
  kind: z.enum(["minimal-two-line", "three-line", "grid", "custom"]),
  size: z.coerce.number().finite().min(16).max(64),
  strokeWidth: z.coerce.number().finite().min(1).max(6),
  color: z.string().trim().min(1),
  background: z.string().trim().min(1),
  borderColor: z.string().trim().min(1),
  borderWidth: z.coerce.number().finite().min(0).max(8),
  radius: z.coerce.number().finite().min(0).max(999),
  padding: z.coerce.number().finite().min(0).max(32),
});

const settingsSchema = z.object({
  icons: z.object({
    account: iconSchema,
    cart: iconSchema,
    search: iconSchema,
  }),
  navigationIcons: z.record(iconSchema.nullable()),
  mobileMenu: z.object({
    animation: z.enum(["slideIn", "fadeScale"]),
    presentation: z.enum(["drawer", "dropdown", "fullscreen"]),
    breakpoint: z.coerce.number().finite().min(320).max(1280),
    customIconAssetId: z.string().nullable(),
    icon: z.object({
      desktop: menuIconStyleSchema,
      tablet: menuIconStyleSchema,
      mobile: menuIconStyleSchema,
    }),
  }),
  logo: z.object({
    assetId: z.string().nullable(),
    lightAssetId: z.string().nullable(),
    darkAssetId: z.string().nullable(),
    fallbackAssetId: z.string().nullable(),
    altText: z.string(),
    linkDestination: menuTargetSchema,
    responsiveMode: z.enum(["auto", "independent"]),
    src: z.string().nullable(),
    placement: z.object({
      desktop: logoPlacementSchema,
      tablet: logoPlacementSchema,
      mobile: logoPlacementSchema,
    }),
  }),
});

const recordValue = (value: unknown): Record<string, unknown> | null =>
  value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;

const iconValue = (value: unknown): ThemeIconConfig | null => {
  const parsed = iconSchema.safeParse(value);
  return parsed.success ? parsed.data as ThemeIconConfig : null;
};

export const themeIconConfigForNode = (
  node: SceneNode | undefined,
): ThemeIconConfig | null => iconValue(node?.props.iconConfig);

const targetIdentity = (value: unknown): string | null => {
  if (typeof value === "string") {
    const normalized = value.trim().replace(/^\/+/, "").toLowerCase();
    return normalized || null;
  }
  const target = recordValue(value);
  if (!target) return null;
  const type = typeof target.type === "string" ? target.type.toLowerCase() : "";
  const entityId = typeof target.entityId === "string" ? target.entityId.toLowerCase() : "";
  if (type === "home") return "home";
  if (type === "catalog" || type === "collection" || type === "product") return "products";
  if (type === "page" && entityId) return entityId;
  return entityId || type || null;
};

const dynamicBindingField = (node: SceneNode): string | null => {
  const binding = recordValue(node.extensions?.dynamicBinding);
  return typeof binding?.field === "string" ? binding.field : null;
};

export const themeChromeNodeSlot = (node: SceneNode | undefined): ThemeChromeNodeSlot | null => {
  if (!node) return null;
  const explicit = node.extensions?.chromeSlot;
  if (
    explicit === "account" ||
    explicit === "cart" ||
    explicit === "search" ||
    explicit === "nav-link" ||
    explicit === "mobile-menu-trigger" ||
    explicit === "mobile-menu" ||
    explicit === "logo" ||
    explicit === "logo-fallback"
  ) {
    return explicit;
  }

  const action = node.extensions?.action;
  if (action === "open-account") return "account";
  if (action === "open-cart") return "cart";
  if (action === "open-search") return "search";
  if (action === "toggle-mobile-menu") return "mobile-menu-trigger";
  if (node.extensions?.runtimeVisibility === "mobile-menu") return "mobile-menu";
  if (node.extensions?.blockType === "mobile-menu-trigger") return "mobile-menu-trigger";
  if (node.extensions?.blockType === "navigation-link") return "nav-link";

  const name = node.name.toLowerCase();
  const iconElement = node.type === "button" || node.type === "svg";
  if (iconElement && name.includes("search")) return "search";
  if (iconElement && name.includes("account")) return "account";
  if (
    iconElement &&
    (name === "cart" || name.startsWith("cart ") || name.includes("shopping cart"))
  ) return "cart";
  if (
    (name.includes("logo") || name === "store name") &&
    (dynamicBindingField(node) === "business_name" || node.extensions?.navigationTarget)
  ) {
    return node.type === "image" ? "logo" : "logo-fallback";
  }
  return null;
};

export const themeChromeNavigationId = (node: SceneNode): string => {
  const explicit = node.extensions?.navigationKey;
  if (typeof explicit === "string" && explicit.trim()) return explicit.trim().toLowerCase();
  return targetIdentity(node.extensions?.navigationTarget) ?? node.id;
};

export const themeMobileMenuDomId = (nodeId: string): string =>
  `theme-mobile-menu-${nodeId.replace(/[^a-zA-Z0-9_-]/g, "-")}`;

const setNodeVisibility = (node: SceneNode, visible: boolean): void => {
  node.meta = { ...node.meta, hidden: !visible };
  const responsive = node.layout.responsive;
  if (!responsive) return;
  node.layout = {
    ...node.layout,
    responsive: Object.fromEntries(
      Object.entries(responsive).map(([breakpoint, overrideValue]) => {
        const override = recordValue(overrideValue) ?? {};
        const overrideMeta = recordValue(override.meta) ?? {};
        return [
          breakpoint,
          {
            ...override,
            meta: {
              ...overrideMeta,
              hidden: !visible,
            },
          },
        ];
      }),
    ),
  };
};

const setNodeBreakpointVisibility = (
  node: SceneNode,
  visibility: Record<ThemeChromeBreakpoint, boolean>,
): void => {
  node.meta = { ...node.meta, hidden: !visibility.desktop };
  const responsive = recordValue(node.layout.responsive) ?? {};
  node.layout = {
    ...node.layout,
    responsive: Object.fromEntries(
      chromeBreakpoints.map((breakpoint) => {
        const override = recordValue(responsive[breakpoint]) ?? {};
        return [
          breakpoint,
          {
            ...override,
            meta: {
              ...(recordValue(override.meta) ?? {}),
              hidden: !visibility[breakpoint],
            },
          },
        ];
      }),
    ),
  };
};

const existingNavigationIcons = (
  scene: SceneTree,
): Record<string, ThemeIconConfig | null> => {
  const byId = new Map<string, ThemeIconConfig | null>();
  Object.values(scene.nodes).forEach((node) => {
    if (themeChromeNodeSlot(node) !== "nav-link") return;
    const id = themeChromeNavigationId(node);
    if (byId.has(id)) return;
    byId.set(
      id,
      iconValue(node.props.iconConfig) ?? defaultNavigationIcon(id),
    );
  });
  return Object.fromEntries(byId);
};

const chromeBreakpoints: ThemeChromeBreakpoint[] = [
  "desktop",
  "tablet",
  "mobile",
];

const uploadedLogoNodeForScene = (scene: SceneTree): SceneNode | undefined =>
  Object.values(scene.nodes).find(
    (node) => themeChromeNodeSlot(node) === "logo",
  );

const logoNodeForScene = (scene: SceneTree): SceneNode | undefined =>
  Object.values(scene.nodes).find((node) => themeChromeNodeSlot(node) === "logo-fallback") ??
  uploadedLogoNodeForScene(scene);

const logoPlacementsEqual = (
  left: ThemeLogoPlacement,
  right: ThemeLogoPlacement,
): boolean =>
  left.width === right.width &&
  left.minWidth === right.minWidth &&
  left.maxWidth === right.maxWidth &&
  left.heightMode === right.heightMode &&
  left.alignment === right.alignment &&
  left.objectFit === right.objectFit &&
  left.headerPosition === right.headerPosition &&
  left.padding === right.padding &&
  left.visible === right.visible;

const sceneLogoPlacementDefaults = (
  scene: SceneTree,
): Record<ThemeChromeBreakpoint, ThemeLogoPlacement> => {
  const logo = logoNodeForScene(scene);
  return Object.fromEntries(
    chromeBreakpoints.map((breakpoint) => {
      const fallback = DEFAULT_THEME_CHROME_SETTINGS.logo.placement[breakpoint];
      const resolved = logo
        ? responsiveSystem.resolveNode(logo, breakpoint)
        : undefined;
      const width = Math.max(1, resolved?.transform.width ?? fallback.width);
      return [
        breakpoint,
        {
          ...fallback,
          width,
          minWidth: Math.min(fallback.minWidth, width),
          maxWidth: Math.max(fallback.maxWidth, width),
        },
      ];
    }),
  ) as Record<ThemeChromeBreakpoint, ThemeLogoPlacement>;
};

const normalizeLogoPlacement = (
  value: unknown,
  fallback: ThemeLogoPlacement,
): ThemeLogoPlacement => {
  const candidate = recordValue(value);
  const parsed = logoPlacementSchema.safeParse({
    ...fallback,
    ...(candidate ?? {}),
    objectFit: "contain",
  });
  return parsed.success
    ? parsed.data as ThemeLogoPlacement
    : structuredClone(fallback);
};

const normalizeMenuIconStyle = (
  value: unknown,
  fallback: ThemeChromeSettings["mobileMenu"]["icon"][ThemeChromeBreakpoint],
): ThemeChromeSettings["mobileMenu"]["icon"][ThemeChromeBreakpoint] => {
  const parsed = menuIconStyleSchema.safeParse({
    ...fallback,
    ...(recordValue(value) ?? {}),
  });
  return parsed.success
    ? parsed.data as ThemeChromeSettings["mobileMenu"]["icon"][ThemeChromeBreakpoint]
    : structuredClone(fallback);
};

const solidBackground = (node: SceneNode | undefined): string | null => {
  if (!node) return null;
  const explicit = node.props.background;
  if (typeof explicit === "string") return explicit;
  const fill = node.style.fills[0];
  return fill?.type === "solid" ? fill.color : null;
};

const colorLuminance = (value: string | null): number | null => {
  if (!value) return null;
  const hex = value.trim().match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i)?.[1];
  let channels: number[] | null = null;
  if (hex) {
    const normalized = hex.length === 3
      ? hex.split("").map((part) => `${part}${part}`).join("")
      : hex;
    channels = [0, 2, 4].map((index) => Number.parseInt(normalized.slice(index, index + 2), 16));
  } else {
    const rgb = value.match(/rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)/i);
    if (rgb) channels = [Number(rgb[1]), Number(rgb[2]), Number(rgb[3])];
  }
  if (!channels || channels.some((channel) => !Number.isFinite(channel))) return null;
  const linear = channels.map((channel) => {
    const normalized = Math.max(0, Math.min(255, channel)) / 255;
    return normalized <= 0.04045
      ? normalized / 12.92
      : ((normalized + 0.055) / 1.055) ** 2.4;
  });
  return linear[0] * 0.2126 + linear[1] * 0.7152 + linear[2] * 0.0722;
};

const closestHeader = (
  scene: SceneTree,
  node: SceneNode,
): SceneNode | undefined => {
  let current = node.parentId ? scene.nodes[node.parentId] : undefined;
  while (current) {
    const sectionType =
      current.extensions?.canonicalSectionType ?? current.extensions?.sectionType;
    if (sectionType === "site-header" || sectionType === "header") return current;
    current = current.parentId ? scene.nodes[current.parentId] : undefined;
  }
  return node.parentId ? scene.nodes[node.parentId] : undefined;
};

const logoAssetForBreakpoint = (
  scene: SceneTree,
  node: SceneNode,
  settings: ThemeChromeSettings,
  breakpoint: ThemeChromeBreakpoint,
): ImageAssetRecord | null => {
  const header = closestHeader(scene, node);
  const resolvedHeader = header
    ? responsiveSystem.resolveNode(header, breakpoint)
    : undefined;
  const luminance = colorLuminance(solidBackground(resolvedHeader));
  const variantId =
    luminance !== null && luminance < 0.45
      ? settings.logo.lightAssetId
      : settings.logo.darkAssetId;
  return (
    assetSystem.getImage(scene, variantId) ??
    assetSystem.getImage(scene, settings.logo.assetId) ??
    assetSystem.getImage(scene, settings.logo.fallbackAssetId)
  );
};

const logoTransform = (
  source: SceneNode,
  parent: SceneNode | undefined,
  placement: ThemeLogoPlacement,
  asset: ImageAssetRecord | null,
): SceneNode["transform"] => {
  const requestedWidth = Math.max(
    placement.minWidth,
    Math.min(placement.maxWidth, placement.width),
  );
  const aspectRatio =
    asset?.aspectRatio && Number.isFinite(asset.aspectRatio)
      ? asset.aspectRatio
      : source.transform.width / Math.max(1, source.transform.height);
  const parentHeight = parent?.transform.height ?? Number.POSITIVE_INFINITY;
  const parentWidth = parent?.transform.width ?? Number.POSITIVE_INFINITY;
  const availableHeight = Math.max(1, parentHeight - placement.padding * 2);
  const availableWidth = Math.max(1, parentWidth - placement.padding * 2);
  let width: number;
  let height: number;
  if (placement.heightMode === "fit-header") {
    width = Math.min(
      placement.maxWidth,
      availableWidth,
      availableHeight * aspectRatio,
    );
    height = width / Math.max(0.01, aspectRatio);
  } else {
    width = Math.min(requestedWidth, availableWidth);
    height = Math.min(
      width / Math.max(0.01, aspectRatio),
      availableHeight,
    );
    width = height * aspectRatio;
  }
  let x = source.transform.x;
  let y = source.transform.y;
  if (parent && placement.headerPosition !== "theme") {
    if (placement.headerPosition === "start") x = placement.padding;
    if (placement.headerPosition === "center") x = (parent.transform.width - width) / 2;
    if (placement.headerPosition === "end") {
      x = parent.transform.width - width - placement.padding;
    }
    y = Math.max(placement.padding, (parent.transform.height - height) / 2);
  }
  return {
    ...source.transform,
    x,
    y,
    width: Math.max(1, width),
    height: Math.max(1, height),
  };
};

const normalizeSettings = (
  value: unknown,
  scene: SceneTree,
): ThemeChromeSettings => {
  const candidate = recordValue(value);
  const candidateIcons = recordValue(candidate?.icons);
  const candidateMenu = recordValue(candidate?.mobileMenu);
  const candidateMenuIcon = recordValue(candidateMenu?.icon);
  const candidateLogo = recordValue(candidate?.logo);
  const candidateLogoPlacement = recordValue(candidateLogo?.placement);
  const logoPlacementDefaults = sceneLogoPlacementDefaults(scene);
  const discoveredIcons = existingNavigationIcons(scene);
  const candidateNavigationIcons = recordValue(candidate?.navigationIcons);
  const storedIcons = Object.fromEntries(
    Object.entries(candidateNavigationIcons ?? {})
      .map(([id, value]) => [id, value === null ? null : iconValue(value)])
      .filter((entry): entry is [string, ThemeIconConfig | null] =>
        entry[1] === null || Boolean(entry[1]),
      ),
  );
  const legacyLinks = Array.isArray(candidate?.navLinks)
    ? candidate.navLinks
        .map((entry) => {
          const parsed = z.object({
            id: z.string(),
            icon: iconSchema.nullable().optional(),
          }).safeParse(entry);
          return parsed.success ? parsed.data : null;
        })
        .filter((entry): entry is NonNullable<typeof entry> => Boolean(entry))
    : [];
  const legacyIcons = Object.fromEntries(
    legacyLinks.map((link) => [link.id, link.icon ?? null]),
  );
  const mergedNavigationIcons = {
    ...discoveredIcons,
    ...legacyIcons,
    ...storedIcons,
  };
  const legacyLogoDestination = legacyNavigationTarget(
    candidateLogo?.linkDestination,
  );
  const validatedLogoDestination = legacyLogoDestination
    ? navigationSystem.validateTarget(legacyLogoDestination)
    : null;

  const parsed = settingsSchema.safeParse({
    icons: {
      account: iconValue(candidateIcons?.account) ?? DEFAULT_THEME_CHROME_SETTINGS.icons.account,
      cart: iconValue(candidateIcons?.cart) ?? DEFAULT_THEME_CHROME_SETTINGS.icons.cart,
      search: iconValue(candidateIcons?.search) ?? DEFAULT_THEME_CHROME_SETTINGS.icons.search,
    },
    navigationIcons: mergedNavigationIcons,
    mobileMenu: {
      animation: candidateMenu?.animation ?? DEFAULT_THEME_CHROME_SETTINGS.mobileMenu.animation,
      presentation:
        candidateMenu?.presentation ?? DEFAULT_THEME_CHROME_SETTINGS.mobileMenu.presentation,
      breakpoint: candidateMenu?.breakpoint ?? DEFAULT_THEME_CHROME_SETTINGS.mobileMenu.breakpoint,
      customIconAssetId:
        typeof candidateMenu?.customIconAssetId === "string" &&
        candidateMenu.customIconAssetId.trim()
          ? candidateMenu.customIconAssetId
          : null,
      icon: Object.fromEntries(
        chromeBreakpoints.map((breakpoint) => [
          breakpoint,
          normalizeMenuIconStyle(
            candidateMenuIcon?.[breakpoint],
            DEFAULT_THEME_CHROME_SETTINGS.mobileMenu.icon[breakpoint],
          ),
        ]),
      ),
    },
    logo: {
      assetId:
        typeof candidateLogo?.assetId === "string" && candidateLogo.assetId.trim()
          ? candidateLogo.assetId
          : null,
      lightAssetId:
        typeof candidateLogo?.lightAssetId === "string" && candidateLogo.lightAssetId.trim()
          ? candidateLogo.lightAssetId
          : null,
      darkAssetId:
        typeof candidateLogo?.darkAssetId === "string" && candidateLogo.darkAssetId.trim()
          ? candidateLogo.darkAssetId
          : null,
      fallbackAssetId:
        typeof candidateLogo?.fallbackAssetId === "string" && candidateLogo.fallbackAssetId.trim()
          ? candidateLogo.fallbackAssetId
          : null,
      altText:
        typeof candidateLogo?.altText === "string"
          ? candidateLogo.altText
          : DEFAULT_THEME_CHROME_SETTINGS.logo.altText,
      linkDestination:
        validatedLogoDestination?.valid
          ? validatedLogoDestination.target
          : DEFAULT_THEME_CHROME_SETTINGS.logo.linkDestination,
      responsiveMode:
        candidateLogo?.responsiveMode === "independent"
          ? "independent"
          : DEFAULT_THEME_CHROME_SETTINGS.logo.responsiveMode,
      src:
        typeof candidateLogo?.src === "string" && candidateLogo.src.trim()
          ? candidateLogo.src
          : null,
      placement: Object.fromEntries(
        chromeBreakpoints.map((breakpoint) => [
          breakpoint,
          normalizeLogoPlacement(
            candidateLogoPlacement?.[breakpoint],
            logoPlacementDefaults[breakpoint],
          ),
        ]),
      ),
    },
  });
  if (!parsed.success) {
    return structuredClone(DEFAULT_THEME_CHROME_SETTINGS);
  }
  const settings = parsed.data as ThemeChromeSettings;
  const logo = uploadedLogoNodeForScene(scene);
  if (!logo) return settings;
  chromeBreakpoints.forEach((breakpoint) => {
    if (!responsiveSystem.hasManualTransform(logo, breakpoint)) return;
    const width = Math.max(
      1,
      Math.min(
        1024,
        responsiveSystem.resolveNode(logo, breakpoint).transform.width,
      ),
    );
    const placement = settings.logo.placement[breakpoint];
    placement.width = width;
    placement.minWidth = Math.min(placement.minWidth, width);
    placement.maxWidth = Math.max(placement.maxWidth, width);
  });
  return settings;
};

const uniqueNodeId = (scene: SceneTree, preferred: string): string => {
  if (!scene.nodes[preferred]) return preferred;
  let index = 2;
  while (scene.nodes[`${preferred}-${index}`]) index += 1;
  return `${preferred}-${index}`;
};

const ensureLogoPlaceholder = (scene: SceneTree): void => {
  const nodes = Object.values(scene.nodes);
  const existingLogo = nodes.find((node) => themeChromeNodeSlot(node) === "logo");
  if (existingLogo) return;
  const fallback = nodes.find((node) => themeChromeNodeSlot(node) === "logo-fallback");
  if (!fallback || !fallback.parentId || !scene.nodes[fallback.parentId]) return;
  const id = uniqueNodeId(scene, `${fallback.id}-uploaded-logo`);
  const logo: SceneNode = {
    ...structuredClone(fallback),
    id,
    type: "image",
    name: "Uploaded store logo",
    parentId: fallback.parentId,
    childIds: [],
    props: {
      src: undefined,
      alt: "Store logo",
      objectFit: "contain",
      objectPosition: "50% 50%",
      loading: "eager",
    },
    style: {
      ...structuredClone(fallback.style),
      fills: [],
      strokes: [],
      effects: [],
    },
    meta: {
      ...fallback.meta,
      hidden: true,
    },
    extensions: {
      ...(fallback.extensions ?? {}),
      chromeSlot: "logo",
      autoPositioned: false,
      transformable: true,
      aspectRatioLocked: true,
      aspectRatioRequired: true,
      replaceable: true,
    },
  };
  setNodeVisibility(logo, false);
  scene.nodes[id] = logo;
  const parent = scene.nodes[fallback.parentId];
  const fallbackIndex = parent.childIds.indexOf(fallback.id);
  parent.childIds.splice(fallbackIndex + 1, 0, id);
};

const applySettingsToScene = (
  scene: SceneTree,
  settings: ThemeChromeSettings,
  options: {
    forceLogoPlacement?: ReadonlySet<ThemeChromeBreakpoint>;
    resetLogoPlacement?: ReadonlySet<ThemeChromeBreakpoint>;
  } = {},
): void => {
  const root = scene.rootNodeId ? scene.nodes[scene.rootNodeId] : undefined;
  if (root) {
    root.extensions = {
      ...(root.extensions ?? {}),
      themeChrome: structuredClone(settings),
    };
  }
  const mobileMenuNode = Object.values(scene.nodes).find(
    (node) => themeChromeNodeSlot(node) === "mobile-menu",
  );
  const mobileMenuId = mobileMenuNode
    ? themeMobileMenuDomId(mobileMenuNode.id)
    : undefined;
  const hasLogoReference = Boolean(
    settings.logo.assetId ||
    settings.logo.lightAssetId ||
    settings.logo.darkAssetId ||
    settings.logo.fallbackAssetId ||
    settings.logo.src,
  );

  Object.values(scene.nodes).forEach((node) => {
    const slot = themeChromeNodeSlot(node);
    if (!slot) return;
    node.extensions = { ...(node.extensions ?? {}), chromeSlot: slot };

    if (slot === "nav-link" || slot === "account" || slot === "cart" || slot === "search") {
      node.style = {
        ...node.style,
        effects: node.style.effects.filter((effect) => effect.type !== "shadow"),
      };
      node.props = { ...node.props, interactionShadow: false };
      const responsive = recordValue(node.layout.responsive);
      if (responsive) {
        node.layout = {
          ...node.layout,
          responsive: Object.fromEntries(
            Object.entries(responsive).map(([breakpoint, value]) => {
              const override = recordValue(value) ?? {};
              const style = recordValue(override.style);
              return [
                breakpoint,
                {
                  ...override,
                  ...(style && Array.isArray(style.effects)
                    ? {
                        style: {
                          ...style,
                          effects: style.effects.filter((effect) =>
                            recordValue(effect)?.type !== "shadow"),
                        },
                      }
                    : {}),
                },
              ];
            }),
          ),
        };
      }
    }

    if (slot === "account" || slot === "cart" || slot === "search") {
      const icon = settings.icons[slot];
      node.props = {
        ...node.props,
        iconConfig: structuredClone(icon),
        iconOnly: true,
        color: icon.color,
      };
      return;
    }
    if (slot === "nav-link") {
      const navigationId = themeChromeNavigationId(node);
      const icon = settings.navigationIcons[navigationId] ?? null;
      node.extensions = {
        ...node.extensions,
        navigationKey: navigationId,
      };
      const props = { ...node.props };
      if (icon) props.iconConfig = structuredClone(icon);
      else delete props.iconConfig;
      node.props = props;
      return;
    }
    if (slot === "mobile-menu-trigger") {
      const customIconSource = getAssetSource(assetSystem.getImage(
        scene,
        settings.mobileMenu.customIconAssetId,
      ));
      const existingResponsive = recordValue(node.layout.responsive) ?? {};
      const iconProps = (breakpoint: ThemeChromeBreakpoint) => ({
        menuIconKind: settings.mobileMenu.icon[breakpoint].kind,
        menuIconSize: settings.mobileMenu.icon[breakpoint].size,
        menuIconStrokeWidth: settings.mobileMenu.icon[breakpoint].strokeWidth,
        menuIconColor: settings.mobileMenu.icon[breakpoint].color,
        menuIconBackground: settings.mobileMenu.icon[breakpoint].background,
        menuIconBorderColor: settings.mobileMenu.icon[breakpoint].borderColor,
        menuIconBorderWidth: settings.mobileMenu.icon[breakpoint].borderWidth,
        menuIconRadius: settings.mobileMenu.icon[breakpoint].radius,
        menuIconPadding: settings.mobileMenu.icon[breakpoint].padding,
        menuIconCustomSource: customIconSource,
      });
      node.props = {
        ...node.props,
        mobileMenuAnimation: settings.mobileMenu.animation,
        mobileMenuPresentation: settings.mobileMenu.presentation,
        ariaControls: mobileMenuId,
        ...iconProps("desktop"),
      };
      node.layout = {
        ...node.layout,
        responsive: Object.fromEntries(
          chromeBreakpoints.map((breakpoint) => {
            const override = recordValue(existingResponsive[breakpoint]) ?? {};
            return [
              breakpoint,
              {
                ...override,
                props: {
                  ...(recordValue(override.props) ?? {}),
                  ...iconProps(breakpoint),
                  ariaControls: mobileMenuId,
                },
              },
            ];
          }),
        ),
      };
      return;
    }
    if (slot === "mobile-menu") {
      node.extensions = {
        ...node.extensions,
        runtimeVisibility: "mobile-menu",
      };
      node.props = {
        ...node.props,
        mobileMenuAnimation: settings.mobileMenu.animation,
        mobileMenuPresentation: settings.mobileMenu.presentation,
        ariaLabel: "Store navigation",
        menuDomId: themeMobileMenuDomId(node.id),
      };
      return;
    }
    if (slot === "logo") {
      const fallbackLogo = Object.values(scene.nodes).find(
        (candidate) => themeChromeNodeSlot(candidate) === "logo-fallback",
      );
      const resolvedNodes = Object.fromEntries(
        chromeBreakpoints.map((breakpoint) => [
          breakpoint,
          responsiveSystem.resolveNode(node, breakpoint),
        ]),
      ) as Record<ThemeChromeBreakpoint, SceneNode>;
      const parent = node.parentId ? scene.nodes[node.parentId] : undefined;
      const resolvedParents = Object.fromEntries(
        chromeBreakpoints.map((breakpoint) => [
          breakpoint,
          parent ? responsiveSystem.resolveNode(parent, breakpoint) : undefined,
        ]),
      ) as Record<ThemeChromeBreakpoint, SceneNode | undefined>;
      const assets = Object.fromEntries(
        chromeBreakpoints.map((breakpoint) => [
          breakpoint,
          logoAssetForBreakpoint(scene, node, settings, breakpoint),
        ]),
      ) as Record<ThemeChromeBreakpoint, ImageAssetRecord | null>;
      const sources = Object.fromEntries(
        chromeBreakpoints.map((breakpoint) => [
          breakpoint,
          getAssetSource(assets[breakpoint]) ?? settings.logo.src,
        ]),
      ) as Record<ThemeChromeBreakpoint, string | null>;
      const preserveManualTransform = Object.fromEntries(
        chromeBreakpoints.map((breakpoint) => [
          breakpoint,
          responsiveSystem.hasManualTransform(node, breakpoint) &&
            !options.forceLogoPlacement?.has(breakpoint),
        ]),
      ) as Record<ThemeChromeBreakpoint, boolean>;
      const transforms = Object.fromEntries(
        chromeBreakpoints.map((breakpoint) => {
          if (preserveManualTransform[breakpoint]) {
            return [breakpoint, resolvedNodes[breakpoint].transform];
          }
          const resetSource =
            options.resetLogoPlacement?.has(breakpoint) && fallbackLogo
              ? responsiveSystem.resolveNode(fallbackLogo, breakpoint)
              : resolvedNodes[breakpoint];
          return [
            breakpoint,
            logoTransform(
              resetSource,
              resolvedParents[breakpoint],
              settings.logo.placement[breakpoint],
              assets[breakpoint],
            ),
          ];
        }),
      ) as Record<ThemeChromeBreakpoint, SceneNode["transform"]>;
      const visibility = Object.fromEntries(
        chromeBreakpoints.map((breakpoint) => [
          breakpoint,
          Boolean(sources[breakpoint]) && settings.logo.placement[breakpoint].visible,
        ]),
      ) as Record<ThemeChromeBreakpoint, boolean>;
      const existingResponsive = recordValue(node.layout.responsive) ?? {};
      node.transform = transforms.desktop;
      node.props = {
        ...node.props,
        src: sources.desktop ?? undefined,
        alt: settings.logo.altText,
        objectFit: "contain",
        objectPosition: `${settings.logo.placement.desktop.alignment} center`,
        logoPadding: settings.logo.placement.desktop.padding,
        assetId: assets.desktop?.id,
      };
      node.layout = {
        ...node.layout,
        responsive: Object.fromEntries(
          chromeBreakpoints.map((breakpoint) => {
            const override = recordValue(existingResponsive[breakpoint]) ?? {};
            return [
              breakpoint,
              {
                ...override,
                transform: transforms[breakpoint],
                manualTransform: preserveManualTransform[breakpoint],
                props: {
                  ...(recordValue(override.props) ?? {}),
                  src: sources[breakpoint] ?? undefined,
                  alt: settings.logo.altText,
                  objectFit: "contain",
                  objectPosition: `${settings.logo.placement[breakpoint].alignment} center`,
                  logoPadding: settings.logo.placement[breakpoint].padding,
                  assetId: assets[breakpoint]?.id,
                },
                meta: {
                  ...(recordValue(override.meta) ?? {}),
                  hidden: !visibility[breakpoint],
                },
              },
            ];
          }),
        ),
      };
      node.extensions = {
        ...node.extensions,
        autoPositioned: false,
        transformable: true,
        responsiveTransformPolicy:
          settings.logo.responsiveMode === "auto"
            ? "linked-anchor"
            : "independent",
        aspectRatioLocked: true,
        aspectRatioRequired: true,
        aspectRatio:
          assets.desktop?.aspectRatio ??
          Number(node.extensions?.aspectRatio ?? 1),
        navigationTarget: settings.logo.linkDestination,
      };
      setNodeBreakpointVisibility(node, visibility);
      return;
    }
    if (slot === "logo-fallback") {
      const visibility = Object.fromEntries(
        chromeBreakpoints.map((breakpoint) => [
          breakpoint,
          !hasLogoReference || !settings.logo.placement[breakpoint].visible,
        ]),
      ) as Record<ThemeChromeBreakpoint, boolean>;
      setNodeBreakpointVisibility(node, visibility);
    }
  });
};

export class ThemeChromeSystem {
  getSettings(scene: SceneTree): ThemeChromeSettings {
    const root = scene.rootNodeId ? scene.nodes[scene.rootNodeId] : undefined;
    return normalizeSettings(root?.extensions?.themeChrome, scene);
  }

  ensureScene(source: SceneTree): SceneTree {
    const scene = navigationSystem.ensureScene(cloneSceneTree(source));
    Object.values(scene.nodes).forEach((node) => {
      const slot = themeChromeNodeSlot(node);
      if (slot) node.extensions = { ...(node.extensions ?? {}), chromeSlot: slot };
    });
    ensureLogoPlaceholder(scene);
    const settings = this.getSettings(scene);
    applySettingsToScene(scene, settings);
    return scene;
  }

  applySettings(source: SceneTree, value: ThemeChromeSettings): SceneTree {
    const currentSettings = this.getSettings(source);
    const forceLogoPlacement = new Set<ThemeChromeBreakpoint>(
      chromeBreakpoints.filter(
        (breakpoint) =>
          !logoPlacementsEqual(
            currentSettings.logo.placement[breakpoint],
            value.logo.placement[breakpoint],
          ),
      ),
    );
    if (currentSettings.logo.responsiveMode !== value.logo.responsiveMode) {
      chromeBreakpoints.forEach((breakpoint) => forceLogoPlacement.add(breakpoint));
    }
    if (
      currentSettings.logo.assetId !== value.logo.assetId ||
      currentSettings.logo.lightAssetId !== value.logo.lightAssetId ||
      currentSettings.logo.darkAssetId !== value.logo.darkAssetId ||
      currentSettings.logo.fallbackAssetId !== value.logo.fallbackAssetId ||
      currentSettings.logo.src !== value.logo.src
    ) {
      chromeBreakpoints.forEach((breakpoint) =>
        forceLogoPlacement.add(breakpoint),
      );
    }
    const scene = this.ensureScene(source);
    const parsed = settingsSchema.safeParse(value);
    if (!parsed.success) {
      throw new Error(
        parsed.error.issues[0]?.message ??
          "Theme chrome settings are invalid.",
      );
    }
    const destinationValidation = navigationSystem.validateTarget(
      value.logo.linkDestination,
    );
    if (!destinationValidation.valid) {
      throw new Error(
        "message" in destinationValidation
          ? destinationValidation.message
          : "The logo destination is invalid.",
      );
    }
    const settings = normalizeSettings(value, scene);
    applySettingsToScene(scene, settings, { forceLogoPlacement });
    return scene;
  }

  resetLogoPlacement(
    source: SceneTree,
    breakpoint: ThemeChromeBreakpoint,
  ): SceneTree {
    const scene = this.ensureScene(source);
    const settings = this.getSettings(scene);
    settings.logo.placement[breakpoint] =
      this.getLogoPlacementDefault(scene, breakpoint);
    applySettingsToScene(scene, settings, {
      forceLogoPlacement: new Set([breakpoint]),
      resetLogoPlacement: new Set([breakpoint]),
    });
    return scene;
  }

  getLogoPlacementDefault(
    scene: SceneTree,
    breakpoint: ThemeChromeBreakpoint,
  ): ThemeLogoPlacement {
    return structuredClone(sceneLogoPlacementDefaults(scene)[breakpoint]);
  }
}

export const themeChromeSystem = new ThemeChromeSystem();

export const themeLogoPresentationForScene = (
  scene: SceneTree,
  breakpoint: ThemeChromeBreakpoint = "desktop",
): {
  src: string | null;
  alt: string;
  width: number;
  height: number;
  objectPosition: string;
  padding: number;
  visible: boolean;
} => {
  const logo = Object.values(scene.nodes).find(
    (node) => themeChromeNodeSlot(node) === "logo",
  );
  if (!logo) {
    return {
      src: null,
      alt: "Store logo",
      width: 0,
      height: 0,
      objectPosition: "left center",
      padding: 0,
      visible: false,
    };
  }
  const settings = themeChromeSystem.getSettings(scene);
  const resolved = responsiveSystem.resolveNode(logo, breakpoint);
  const parent = logo.parentId ? scene.nodes[logo.parentId] : undefined;
  const resolvedParent = parent
    ? responsiveSystem.resolveNode(parent, breakpoint)
    : undefined;
  const asset = logoAssetForBreakpoint(
    scene,
    logo,
    settings,
    breakpoint,
  );
  const source = getAssetSource(asset) ?? settings.logo.src;
  const transform = responsiveSystem.hasManualTransform(logo, breakpoint)
    ? resolved.transform
    : logoTransform(
        resolved,
        resolvedParent,
        settings.logo.placement[breakpoint],
        asset,
      );
  return {
    src: source,
    alt: settings.logo.altText || String(resolved.props.alt ?? "Store logo"),
    width: transform.width,
    height: transform.height,
    objectPosition: `${settings.logo.placement[breakpoint].alignment} center`,
    padding: settings.logo.placement[breakpoint].padding,
    visible:
      Boolean(source) &&
      settings.logo.placement[breakpoint].visible,
  };
};

export const themeMenuIconPresentationForScene = (
  scene: SceneTree,
  breakpoint: ThemeChromeBreakpoint = "mobile",
): {
  config: ThemeChromeSettings["mobileMenu"]["icon"][ThemeChromeBreakpoint];
  customSource: string | null;
} => {
  const settings = themeChromeSystem.getSettings(scene);
  return {
    config: structuredClone(settings.mobileMenu.icon[breakpoint]),
    customSource: getAssetSource(
      assetSystem.getImage(scene, settings.mobileMenu.customIconAssetId),
    ),
  };
};
