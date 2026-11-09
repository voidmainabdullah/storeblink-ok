import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type MouseEvent,
  type ReactNode,
} from "react";
import { Link, NavLink, useNavigate, useParams, useSearchParams } from "react-router-dom";
import {
  AlertCircle,
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  Search,
  SlidersHorizontal,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ProductCard } from "@/components/store/ProductCard";
import type { StoreTemplate } from "@/components/store/templates";
import { useCart } from "@/core/cart";
import { useWishlist } from "@/hooks/useWishlist";
import { useToast } from "@/hooks/use-toast";
import { buildStoreSceneTree, getRequiredEngineScene, type StoreSceneItem, type StoreSceneProfile } from "@/editor/engine/storeSceneAdapter";
import { reconcileEngineTemplateScene } from "@/editor/engine/engineTemplates";
import {
  getStorefrontPageBySlug,
  getStorefrontPageDocument,
} from "@/document/pages";
import {
  navigationSystem,
  resolveMenuTarget,
  type StorefrontLinkContext,
} from "@/content/menus";
import { resolveTheme, type StoreTheme } from "@/lib/storeTheme";
import { ensureBuiltInRenderers } from "@/rendering/registry";
import { responsiveSystem } from "@/layout/responsive";
import { layoutEngine } from "@/layout/engine";
import { structuredLayoutSystem } from "@/layout/structured";
import {
  resolveSceneNavigation,
  resolveSceneNodeRoute,
  type NavigationViewItem,
} from "@/core/navigation";
import type { ResponsiveBreakpoint } from "@/stores/responsive.store";
import type { SceneNode, SceneTree } from "@/types";
import {
  storefrontDataResolver,
  type CatalogPage,
  type CatalogSort,
  type StorefrontProduct,
  type StorefrontProfile,
  type StorefrontCollection,
} from "@/storefront/data-resolvers";
import {
  StorefrontRuntime,
  ThemeRuntimeProvider,
  themeIdForScene,
  useThemeRuntime,
} from "@/theme-engine/runtime";
import { themeBrandingSystem } from "@/theme-engine/branding";
import { StorefrontHead } from "@/storefront/seo/StorefrontHead";
import { storefrontActionSystem } from "@/storefront/interactions";
import { StorefrontCartDrawer } from "@/storefront/checkout";
import {
  CUSTOM_CODE_STOREFRONT_ACTION_EVENT,
  type CustomCodeStorefrontActionDetail,
} from "@/extension/custom-code";
import { NoirChronoStorefrontStyles } from "@/themes/noir-chrono/runtime";
import {
  ThemeIcon,
  ThemeMenuMorphIcon,
  ThemeMobileMenuProvider,
  ThemeMobileMenuStyles,
  themeChromeSystem,
  themeChromeNavigationId,
  themeChromeNodeSlot,
  themeLogoPresentationForScene,
  themeMenuIconPresentationForScene,
  useThemeMobileMenu,
} from "@/theme-engine/chrome";
import {
  ThemeCommerceMenu,
  themeFunctionalitySystem,
  type ThemeCommerceMenuMode,
} from "@/theme-engine/functionality";
import {
  AdaptiveStorefrontRuntime,
  AdaptiveRuntimeErrorBoundary,
  runtimeArtifactResolver,
  type AdaptiveRuntimeAssignment,
  type StorefrontRuntimeAssignment,
} from "@/adaptive-commerce/runtime";
import type { RuntimeArtifact, StorefrontResourceType } from "@/adaptive-commerce/contracts";
import { createStorefrontRumReporter } from "@/adaptive-commerce/rollout";

ensureBuiltInRenderers();

export type StoreRoutePage =
  | "home"
  | "products"
  | "collection"
  | "about"
  | "contact"
  | "custom"
  | "blog"
  | "cart"
  | "search"
  | "404";

type PublicStoreProfile = StorefrontProfile;
type PublicStoreItem = StorefrontProduct;

export type StorePreviewSnapshot = Readonly<{
  profile: Readonly<{
    id: string;
    business_name: string | null;
    store_slug: string | null;
    store_tagline?: string | null;
    store_about?: string | null;
    store_color?: string | null;
    store_banner_url?: string | null;
    theme: unknown;
    theme_draft?: unknown;
    theme_published?: unknown;
    theme_revision?: number;
  }>;
  items: readonly StoreSceneItem[];
}>;

export type StorePreviewSource = Readonly<{
  storeId: string;
  load: () => Promise<StorePreviewSnapshot>;
}>;

type LoadState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | {
      status: "ready";
      runtime: "legacy";
      profile: PublicStoreProfile;
      scene: SceneTree;
      products: PublicStoreItem[];
      linkContext: StorefrontLinkContext;
      runtimeAssignment: StorefrontRuntimeAssignment;
    }
  | {
      status: "ready";
      runtime: "adaptive";
      profile: PublicStoreProfile;
      products: PublicStoreItem[];
      collections: StorefrontCollection[];
      runtimeAssignment: AdaptiveRuntimeAssignment<RuntimeArtifact>;
    };

type StoreProps = {
  page?: StoreRoutePage;
  slugOverride?: string;
  customDomain?: boolean;
  /** Injected only by the authenticated dashboard preview route. */
  previewSource?: StorePreviewSource;
  pageSlugOverride?: string;
  collectionHandleOverride?: string;
};

const collectionLinksFor = (
  products: readonly PublicStoreItem[],
  collections: readonly StorefrontCollection[],
) => {
  const links = new Map<string, { id: string; handle: string; route: string; status: "published" }>();
  for (const category of new Set(products
    .map((product) => product.category?.trim())
    .filter((value): value is string => Boolean(value)))) {
    links.set(category, {
      id: category,
      handle: category,
      route: `/products?category=${encodeURIComponent(category)}`,
      status: "published",
    });
  }
  for (const collection of collections) {
    const link = {
      id: collection.id,
      handle: collection.handle,
      route: `/collections/${encodeURIComponent(collection.handle)}`,
      status: "published" as const,
    };
    links.set(collection.id, link);
    links.set(collection.handle, link);
  }
  return links;
};

const hydratePublicScene = async (
  profile: PublicStoreProfile,
  scene: SceneTree,
  products: PublicStoreItem[],
): Promise<SceneTree> => {
  let hydrated = scene;
  const themeId = themeIdForScene(scene);
  try {
    hydrated = await reconcileEngineTemplateScene(
      scene,
      profile as StoreSceneProfile,
      products as StoreSceneItem[],
    );
  } catch (error) {
    console.error(`Unable to reconcile storefront data for theme ${themeId}.`, error);
  }
  const responsiveScene = responsiveSystem.ensureSceneOverrides(
    themeFunctionalitySystem.ensureScene(themeChromeSystem.ensureScene(hydrated)),
  );
  return structuredLayoutSystem.isStructuredScene(responsiveScene)
    ? structuredLayoutSystem.reflowScene(responsiveScene)
    : responsiveScene;
};

const publicSceneBackground = (scene: SceneTree): string => {
  const root = scene.rootNodeId ? scene.nodes[scene.rootNodeId] : undefined;
  const fill = root?.style.fills[0];
  if (fill?.type === "solid") return fill.color;
  if (fill?.type === "gradient") return fill.value;
  return "#ffffff";
};

const productIdForNode = (node: SceneNode | undefined): string | null => {
  const explicit = node?.extensions?.productId;
  if (typeof explicit === "string" || typeof explicit === "number") return String(explicit);
  if (node?.id.startsWith("product-card-")) return node.id.slice("product-card-".length);
  return null;
};

export const routeForNode = resolveSceneNodeRoute;

const resolveStorefrontTheme = (profile: PublicStoreProfile, scene: SceneTree): StoreTheme => {
  const theme = resolveTheme(profile.theme, profile.store_color ?? undefined);
  if (profile.store_color) return { ...theme, accent: profile.store_color };
  const buttonBackground = Object.values(scene.nodes).find((node) => typeof node.props.background === "string")?.props.background;
  if (typeof buttonBackground === "string" && buttonBackground !== "#ffffff" && buttonBackground !== "transparent") {
    return { ...theme, accent: buttonBackground };
  }
  return theme;
};

const navigationIdentityForHref = (href: string): string => {
  const segment = href.split("?")[0].split("/").filter(Boolean).at(-1)?.toLowerCase();
  return segment && segment !== "home" ? segment : "home";
};

const storefrontPath = (
  slug: string,
  path = "",
  customDomain = false,
): string => {
  const suffix = path ? `/${path.replace(/^\/+/, "")}` : "";
  return customDomain ? suffix || "/" : `/store/${slug}${suffix}`;
};

const resourceTypeForStorePage = (page: StoreRoutePage): StorefrontResourceType => {
  switch (page) {
    case "home": return "home";
    case "products":
    case "collection": return "collection";
    case "blog": return "blog";
    case "cart": return "cart";
    case "search": return "search";
    case "404": return "404";
    case "about":
    case "contact":
    case "custom": return "page";
  }
};

const adaptiveNavigationFor = (
  slug: string,
  customDomain: boolean,
) => [
  { id: "home", label: "Home", href: storefrontPath(slug, "", customDomain) },
  { id: "products", label: "Products", href: storefrontPath(slug, "products", customDomain) },
  { id: "about", label: "About", href: storefrontPath(slug, "about", customDomain) },
  { id: "contact", label: "Contact", href: storefrontPath(slug, "contact", customDomain) },
];

const remapStorefrontPath = (
  href: string,
  slug: string,
  customDomain: boolean,
): string => {
  if (!customDomain || /^https?:\/\//i.test(href)) return href;
  const prefix = `/store/${slug}`;
  if (href === prefix) return "/";
  if (href.startsWith(`${prefix}/`) || href.startsWith(`${prefix}?`)) {
    return href.slice(prefix.length) || "/";
  }
  return href;
};

const PublicNav = ({
  slug,
  profile,
  theme,
  cartCount,
  scene,
  linkContext,
  customDomain,
}: {
  slug: string;
  profile: PublicStoreProfile;
  theme: StoreTheme;
  cartCount: number;
  scene: SceneTree;
  linkContext: StorefrontLinkContext;
  customDomain: boolean;
}) => {
  const headerRef = useRef<HTMLElement>(null);
  const mobileMenu = useThemeMobileMenu(headerRef);
  const closeMobileMenu = mobileMenu.close;
  const [headerWidth, setHeaderWidth] = useState(0);
  const [chromeBreakpoint, setChromeBreakpoint] =
    useState<ResponsiveBreakpoint>("desktop");
  const chrome = useMemo(() => themeChromeSystem.getSettings(scene), [scene]);
  const logoPresentations = useMemo(
    () => ({
      desktop: themeLogoPresentationForScene(scene, "desktop"),
      tablet: themeLogoPresentationForScene(scene, "tablet"),
      mobile: themeLogoPresentationForScene(scene, "mobile"),
    }),
    [scene],
  );
  const menuIconPresentation = useMemo(
    () => themeMenuIconPresentationForScene(scene, chromeBreakpoint),
    [chromeBreakpoint, scene],
  );
  const logoLink = useMemo(
    () => resolveMenuTarget(chrome.logo.linkDestination, linkContext),
    [chrome.logo.linkDestination, linkContext],
  );
  const navigationLinks = useMemo(
    () =>
      resolveSceneNavigation(slug, scene, {
        pages: linkContext.pages,
        products: linkContext.products,
        collections: linkContext.collections,
      }, chromeBreakpoint).map((link) =>
        link.external
          ? link
          : { ...link, href: remapStorefrontPath(link.href, slug, customDomain) },
      ),
    [chromeBreakpoint, customDomain, linkContext, scene, slug],
  );
  const homePath = storefrontPath(slug, "", customDomain);
  const productsPath = storefrontPath(slug, "products", customDomain);
  const resolvedLogoHref = remapStorefrontPath(
    logoLink.href ?? homePath,
    slug,
    customDomain,
  );
  const navIcon = (link: NavigationViewItem) =>
    chrome.navigationIcons[link.id] ??
    chrome.navigationIcons[navigationIdentityForHref(link.href)] ??
    null;
  const navClass = ({ isActive }: { isActive: boolean }) =>
    `flex items-center gap-2 rounded-full px-3 py-1.5 text-sm transition-colors ${
      isActive ? "bg-black text-white" : "text-neutral-600 hover:bg-neutral-100 hover:text-neutral-950"
    }`;

  useLayoutEffect(() => {
    const header = headerRef.current;
    if (!header) return;
    const measure = () => {
      const width = header.clientWidth || window.innerWidth;
      setHeaderWidth(width);
      setChromeBreakpoint(responsiveSystem.breakpointForWidth(width));
    };
    measure();
    if (typeof ResizeObserver === "undefined") {
      window.addEventListener("resize", measure);
      return () => window.removeEventListener("resize", measure);
    }
    const observer = new ResizeObserver(measure);
    observer.observe(header);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (headerWidth > chrome.mobileMenu.breakpoint) closeMobileMenu();
  }, [chrome.mobileMenu.breakpoint, closeMobileMenu, headerWidth]);

  const logoContent = logoPresentations.desktop.src ? (
    <picture>
      {logoPresentations.mobile.src ? (
        <source media="(max-width: 639px)" srcSet={logoPresentations.mobile.src} />
      ) : null}
      {logoPresentations.tablet.src ? (
        <source media="(max-width: 1023px)" srcSet={logoPresentations.tablet.src} />
      ) : null}
      <img
        data-public-theme-logo
        src={logoPresentations.desktop.src}
        alt={logoPresentations.desktop.alt || profile.business_name || "Store"}
        className="block h-auto max-w-full object-contain"
        style={{
          "--logo-desktop-width": `${logoPresentations.desktop.width}px`,
          "--logo-tablet-width": `${logoPresentations.tablet.width}px`,
          "--logo-mobile-width": `${logoPresentations.mobile.width}px`,
          "--logo-desktop-padding": `${logoPresentations.desktop.padding}px`,
          "--logo-tablet-padding": `${logoPresentations.tablet.padding}px`,
          "--logo-mobile-padding": `${logoPresentations.mobile.padding}px`,
          "--logo-desktop-position": logoPresentations.desktop.objectPosition,
          "--logo-tablet-position": logoPresentations.tablet.objectPosition,
          "--logo-mobile-position": logoPresentations.mobile.objectPosition,
        } as CSSProperties}
      />
    </picture>
  ) : (
    <>
      <div
        className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-sm font-black text-white"
        style={{ backgroundColor: theme.accent }}
      >
        {(profile.business_name ?? "S").charAt(0).toUpperCase()}
      </div>
      <span data-public-brand-name className="truncate text-base font-bold tracking-tight text-neutral-950">
        {profile.business_name || "Store"}
      </span>
    </>
  );

  return (
    <header
      ref={headerRef}
      data-storefront-chrome="header"
      data-theme-menu-root
      data-theme-menu-open={mobileMenu.open}
      className="sticky top-0 z-40 border-b border-black/10 bg-white/90 backdrop-blur"
    >
      <ThemeMobileMenuStyles settings={chrome} />
      <style>{`
        [data-public-theme-logo]{
          width:min(var(--logo-desktop-width),35vw);
          max-height:52px;
          padding:var(--logo-desktop-padding);
          object-position:var(--logo-desktop-position);
        }
        @media(max-width:1023px){
          [data-public-theme-logo]{
            width:min(var(--logo-tablet-width),35vw);
            padding:var(--logo-tablet-padding);
            object-position:var(--logo-tablet-position);
          }
        }
        @media(max-width:639px){
          [data-public-theme-logo]{
            width:min(var(--logo-mobile-width),38vw);
            max-height:42px;
            padding:var(--logo-mobile-padding);
            object-position:var(--logo-mobile-position);
          }
        }
      `}</style>
      <div className="relative z-20 mx-auto flex h-16 w-full max-w-7xl items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
        {logoLink.external ? (
          <a
            href={resolvedLogoHref}
            target={logoLink.target}
            rel={logoLink.rel}
            className="flex min-w-0 items-center gap-2"
          >
            {logoContent}
          </a>
        ) : (
          <Link
            to={resolvedLogoHref}
            className="flex min-w-0 items-center gap-2"
          >
            {logoContent}
          </Link>
        )}

        <nav
          data-theme-primary-nav
          className="flex items-center gap-1 rounded-full border border-black/10 bg-white p-1"
        >
          {navigationLinks.map((link: NavigationViewItem) => {
            const icon = navIcon(link);
            const content = (
              <>
                {icon ? <ThemeIcon config={icon} /> : null}
                <span>{link.label}</span>
              </>
            );
            return link.external ? (
              <a key={link.id} href={link.href} target={link.target} rel={link.rel ?? "noopener noreferrer"} className={navClass({ isActive: false })}>
                {content}
              </a>
            ) : (
              <NavLink
                key={link.id}
                end={link.href === homePath || link.href === storefrontPath(slug, "home", customDomain)}
                to={link.href}
                className={navClass}
              >
                {content}
              </NavLink>
            );
          })}
        </nav>

        <div className="flex items-center gap-2">
          <Link
            to={productsPath}
            className="hidden rounded-full border border-black/10 p-2 hover:bg-neutral-100 sm:inline-flex"
            aria-label="Search products"
          >
            <ThemeIcon config={chrome.icons.search} />
          </Link>
          <Link
            to={`/auth?returnTo=${encodeURIComponent(homePath)}`}
            className="rounded-full border border-black/10 p-2 hover:bg-neutral-100"
            aria-label="Customer account"
          >
            <ThemeIcon config={chrome.icons.account} />
          </Link>
          <Link to={`${homePath}?cart=1`} className="relative rounded-full border border-black/10 p-2 hover:bg-neutral-100" aria-label="Cart">
            <ThemeIcon config={chrome.icons.cart} />
            {cartCount > 0 ? (
              <span className="absolute -right-1 -top-1 grid min-h-5 min-w-5 place-items-center rounded-full px-1 text-[10px] font-bold text-white" style={{ backgroundColor: theme.accent }}>
                {cartCount}
              </span>
            ) : null}
          </Link>
          <button
            type="button"
            data-theme-menu-trigger-shell
            data-theme-chrome-slot="mobile-menu-trigger"
            className="hidden items-center justify-center hover:brightness-95"
            aria-label={mobileMenu.open ? "Close navigation" : "Open navigation"}
            aria-expanded={mobileMenu.open}
            aria-controls="public-mobile-navigation"
            onClick={mobileMenu.toggle}
            style={{
              color: menuIconPresentation.config.color,
              background: menuIconPresentation.config.background,
              border: `${menuIconPresentation.config.borderWidth}px solid ${menuIconPresentation.config.borderColor}`,
              borderRadius: menuIconPresentation.config.radius,
              padding: menuIconPresentation.config.padding,
            }}
          >
            <ThemeMenuMorphIcon
              config={menuIconPresentation.config}
              customSource={menuIconPresentation.customSource}
            />
          </button>
        </div>
      </div>
      <nav
        id="public-mobile-navigation"
        data-theme-secondary-mobile-menu
        data-theme-chrome-slot="mobile-menu"
        data-mobile-menu-presentation={chrome.mobileMenu.presentation}
        aria-label="Store navigation"
        tabIndex={-1}
        className="relative z-20 grid gap-1 border-t border-black/10 bg-white p-3"
      >
          {navigationLinks.map((link: NavigationViewItem) => {
            const className = (isActive: boolean) =>
              `min-h-11 rounded-lg px-3 py-3 text-sm font-medium ${
                isActive
                  ? "bg-black text-white"
                  : "bg-neutral-100 text-neutral-700"
              }`;
            const icon = navIcon(link);
            const content = (
              <span className="flex items-center gap-2">
                {icon ? <ThemeIcon config={icon} /> : null}
                <span>{link.label}</span>
              </span>
            );
            return link.external ? (
              <a key={link.id} href={link.href} target={link.target} rel={link.rel ?? "noopener noreferrer"} className={className(false)}>{content}</a>
            ) : (
              <NavLink
                key={link.id}
                end={link.href === homePath || link.href === storefrontPath(slug, "home", customDomain)}
                to={link.href}
                className={({ isActive }) => className(isActive)}
                onClick={mobileMenu.close}
              >
                {content}
              </NavLink>
            );
          })}
      </nav>
    </header>
  );
};

const PublicFooter = ({
  slug,
  profile,
  theme,
  scene,
  linkContext,
  customDomain,
}: {
  slug: string;
  profile: PublicStoreProfile;
  theme: StoreTheme;
  scene: SceneTree;
  linkContext: StorefrontLinkContext;
  customDomain: boolean;
}) => {
  const footerRef = useRef<HTMLElement>(null);
  const [footerBreakpoint, setFooterBreakpoint] =
    useState<ResponsiveBreakpoint>("desktop");
  useLayoutEffect(() => {
    const footer = footerRef.current;
    if (!footer) return;
    const measure = () =>
      setFooterBreakpoint(
        responsiveSystem.breakpointForWidth(
          footer.clientWidth || window.innerWidth,
        ),
      );
    measure();
    if (typeof ResizeObserver === "undefined") {
      window.addEventListener("resize", measure);
      return () => window.removeEventListener("resize", measure);
    }
    const observer = new ResizeObserver(measure);
    observer.observe(footer);
    return () => observer.disconnect();
  }, []);
  const links = resolveSceneNavigation(
    slug,
    scene,
    {
      pages: linkContext.pages,
      products: linkContext.products,
      collections: linkContext.collections,
    },
    footerBreakpoint,
  ).map((link) =>
    link.external
      ? link
      : { ...link, href: remapStorefrontPath(link.href, slug, customDomain) },
  );
  return (
  <footer ref={footerRef} data-storefront-chrome="footer" className="border-t border-black/10 bg-white">
    <div className="mx-auto grid w-full max-w-7xl gap-8 px-4 py-10 sm:px-6 md:grid-cols-[1.5fr_1fr_1fr] lg:px-8">
      <div>
        <div className="text-xl font-bold tracking-tight text-neutral-950">{profile.business_name || "Store"}</div>
        <p className="mt-3 max-w-md text-sm leading-6 text-neutral-600">
          {profile.store_tagline || profile.store_about || "A curated storefront built for simple shopping."}
        </p>
      </div>
      <div>
        <div className="text-sm font-semibold text-neutral-950">Shop</div>
        <div className="mt-3 grid gap-2 text-sm text-neutral-600">
          {links.map((link) =>
            link.external ? (
              <a key={link.id} href={link.href} target={link.target} rel={link.rel ?? "noopener noreferrer"}>
                {link.label}
              </a>
            ) : (
              <Link key={link.id} to={link.href}>{link.label}</Link>
            ),
          )}
        </div>
      </div>
      <div>
        <div className="text-sm font-semibold text-neutral-950">Theme</div>
        <div className="mt-3 flex items-center gap-2 text-sm text-neutral-600">
          <span className="h-4 w-4 rounded-full" style={{ backgroundColor: theme.accent }} />
          Brand color applied
        </div>
      </div>
    </div>
  </footer>
  );
};

const StoreSceneSurface = ({
  scene,
  slug,
  profile,
  products,
  linkContext,
  customDomain,
}: {
  scene: SceneTree;
  slug: string;
  profile: PublicStoreProfile;
  products: PublicStoreItem[];
  linkContext: StorefrontLinkContext;
  customDomain: boolean;
}) => {
  const navigate = useNavigate();
  const cart = useCart(slug);
  const wishlist = useWishlist(slug);
  const { toast } = useToast();
  const wrapperRef = useRef<HTMLDivElement>(null);
  const nodeStepIndexRef = useRef(new Map<string, number>());
  const [viewportWidth, setViewportWidth] = useState(0);
  const [commerceMenu, setCommerceMenu] = useState<ThemeCommerceMenuMode | null>(null);
  const mobileMenu = useThemeMobileMenu(wrapperRef);
  const closeMobileMenu = mobileMenu.close;
  const rootNodeId = scene.rootNodeId;
  const chrome = useMemo(() => themeChromeSystem.getSettings(scene), [scene]);
  const functionality = useMemo(
    () => themeFunctionalitySystem.getSettings(scene),
    [scene],
  );
  const storefrontTheme = useMemo(
    () => resolveStorefrontTheme(profile, scene),
    [profile, scene],
  );
  const sourceRoot = rootNodeId ? scene.nodes[rootNodeId] : undefined;
  const layoutResult = useMemo(
    () => layoutEngine.resolveSceneForViewport(
      scene,
      viewportWidth || sourceRoot?.transform.width || 1200,
    ),
    [scene, sourceRoot?.transform.width, viewportWidth],
  );
  const renderedScene = layoutResult.scene;
  const breakpoint = layoutResult.breakpoint;
  const nodes = renderedScene.nodes;
  const root = rootNodeId ? nodes[rootNodeId] : undefined;
  const sceneWidth = root?.transform.width ?? 1200;
  const sceneHeight = root?.transform.height ?? 1600;

  useEffect(() => {
    const onCustomCodeAction = (event: Event) => {
      const detail = (event as CustomEvent<CustomCodeStorefrontActionDetail>).detail;
      if (!detail || !nodes[detail.nodeId]) return;
      if (detail.action === "open-cart") {
        navigate(`${storefrontPath(slug, "", customDomain)}?cart=1`);
        return;
      }
      const productId = detail.productId?.trim();
      const product = productId
        ? products.find((candidate) => String(candidate.id) === productId)
        : undefined;
      if (!product) {
        toast({ title: "Product is unavailable" });
        return;
      }
      if (detail.action === "add-to-cart") {
        cart.add(String(product.id), detail.quantity ?? 1);
        toast({ title: "Added to cart" });
        return;
      }
      navigate(storefrontPath(slug, `product/${product.id}`, customDomain));
    };
    window.addEventListener(CUSTOM_CODE_STOREFRONT_ACTION_EVENT, onCustomCodeAction);
    return () => window.removeEventListener(CUSTOM_CODE_STOREFRONT_ACTION_EVENT, onCustomCodeAction);
  }, [cart, customDomain, navigate, nodes, products, slug, toast]);

  useLayoutEffect(() => {
    const resize = () => {
      const available = wrapperRef.current?.clientWidth ?? sceneWidth;
      setViewportWidth(available);
    };
    resize();
    if (typeof ResizeObserver === "undefined" || !wrapperRef.current) {
      window.addEventListener("resize", resize);
      return () => window.removeEventListener("resize", resize);
    }
    const observer = new ResizeObserver(resize);
    observer.observe(wrapperRef.current);
    return () => observer.disconnect();
  }, [sceneWidth]);

  useEffect(() => {
    if (viewportWidth > chrome.mobileMenu.breakpoint) closeMobileMenu();
  }, [chrome.mobileMenu.breakpoint, closeMobileMenu, viewportWidth]);

  const mobileMenuEligible =
    viewportWidth > 0 && viewportWidth <= chrome.mobileMenu.breakpoint;
  const mobileMenuPanel = useMemo(
    () => Object.values(nodes).find((node) => themeChromeNodeSlot(node) === "mobile-menu"),
    [nodes],
  );
  const navigationVisibility = useMemo(
    () =>
      new Map(
        navigationSystem.resolve(scene, linkContext).map(({ item, link }) => [
          item.id,
          item.isVisible &&
            item.visibility[breakpoint] &&
            !link.hidden &&
            Boolean(link.href),
        ]),
      ),
    [breakpoint, linkContext, scene],
  );
  const chromeVisibilityOverrides = useMemo(() => {
    const overrides: Record<string, boolean> = {};
    const isInsideMobileMenu = (node: SceneNode) => {
      let parent = node.parentId ? nodes[node.parentId] : undefined;
      while (parent) {
        if (themeChromeNodeSlot(parent) === "mobile-menu") return true;
        parent = parent.parentId ? nodes[parent.parentId] : undefined;
      }
      return false;
    };
    Object.values(nodes).forEach((node) => {
      const slot = themeChromeNodeSlot(node);
      if (slot === "mobile-menu-trigger") overrides[node.id] = mobileMenuEligible;
      if (slot === "mobile-menu") overrides[node.id] = mobileMenuEligible;
      if (
        slot === "nav-link"
      ) {
        const navigationAllowed =
          navigationVisibility.get(themeChromeNavigationId(node)) ?? false;
        const allowedAtBreakpoint = !responsiveSystem.resolveNode(
          node,
          breakpoint,
        ).meta.hidden;
        overrides[node.id] =
          navigationAllowed &&
          allowedAtBreakpoint &&
          (isInsideMobileMenu(node)
            ? mobileMenuEligible
            : !mobileMenuEligible);
      }
    });
    return overrides;
  }, [
    breakpoint,
    mobileMenuEligible,
    navigationVisibility,
    nodes,
  ]);

  const closeCommerceMenu = useCallback(() => setCommerceMenu(null), []);
  const browseCatalog = useCallback((query: string, category: string) => {
    const params = new URLSearchParams();
    if (query) params.set("q", query);
    if (category) params.set("category", category);
    const suffix = params.size ? `?${params.toString()}` : "";
    setCommerceMenu(null);
    navigate(`${storefrontPath(slug, "products", customDomain)}${suffix}`);
  }, [customDomain, navigate, slug]);
  const openProduct = useCallback((productId: string) => {
    setCommerceMenu(null);
    navigate(storefrontPath(slug, `product/${productId}`, customDomain));
  }, [customDomain, navigate, slug]);

  const handleClick = (event: MouseEvent<HTMLDivElement>) => {
    let element = event.target instanceof Element ? event.target.closest("[data-node-id]") : null;
    while (element) {
      const nodeId = element.getAttribute("data-node-id");
      const node = nodeId ? nodes[nodeId] : undefined;
      const action = storefrontActionSystem.resolve(node);
      if (action?.type === "toggle-mobile-menu") {
        event.preventDefault();
        mobileMenu.toggle();
        return;
      }
      if (action?.type === "open-cart") {
        event.preventDefault();
        navigate(`${storefrontPath(slug, "", customDomain)}?cart=1`);
        return;
      }
      if (action?.type === "open-account") {
        event.preventDefault();
        navigate(`/auth?returnTo=${encodeURIComponent(storefrontPath(slug, "", customDomain))}`);
        return;
      }
      if (action?.type === "open-search") {
        event.preventDefault();
        setCommerceMenu("search");
        mobileMenu.close();
        return;
      }
      if (action?.type === "open-category-menu") {
        event.preventDefault();
        setCommerceMenu("categories");
        mobileMenu.close();
        return;
      }
      const productId = productIdForNode(node);
      if (action?.type === "add-to-cart" && productId) {
        event.preventDefault();
        cart.add(productId, 1);
        toast({ title: "Added to cart" });
        return;
      }
      if (action?.type === "toggle-wishlist" && productId) {
        event.preventDefault();
        wishlist.toggle(productId);
        toast({
          title: wishlist.has(productId)
            ? "Removed from wishlist"
            : "Saved to wishlist",
        });
        return;
      }
      if (action?.type === "browse-products") {
        event.preventDefault();
        const query = action.query
          ? `?category=${encodeURIComponent(action.query)}`
          : "";
        navigate(`${storefrontPath(slug, "products", customDomain)}${query}`);
        return;
      }
      if (action?.type === "scroll-to-node") {
        event.preventDefault();
        const target = wrapperRef.current?.querySelector<HTMLElement>(
          `[data-node-id="${action.targetNodeId.replace(/["\\]/g, "\\$&")}"]`,
        );
        target?.scrollIntoView({ behavior: "smooth", block: "start" });
        return;
      }
      if (action?.type === "step-node-set") {
        event.preventDefault();
        const current = nodeStepIndexRef.current.get(action.groupId) ?? 0;
        const next =
          (current + action.direction + action.targetNodeIds.length) %
          action.targetNodeIds.length;
        nodeStepIndexRef.current.set(action.groupId, next);
        const targetId = action.targetNodeIds[next];
        const target = wrapperRef.current?.querySelector<HTMLElement>(
          `[data-node-id="${targetId.replace(/["\\]/g, "\\$&")}"]`,
        );
        if (target) {
          wrapperRef.current
            ?.querySelectorAll("[data-storefront-action-active]")
            .forEach((candidate) => candidate.removeAttribute("data-storefront-action-active"));
          target.setAttribute("data-storefront-action-active", "true");
          target.scrollIntoView({ behavior: "smooth", block: "center", inline: "center" });
          window.setTimeout(
            () => target.removeAttribute("data-storefront-action-active"),
            900,
          );
        }
        return;
      }
      const route = productId
        ? storefrontPath(slug, `product/${productId}`, customDomain)
        : routeForNode(slug, node, {
            pages: linkContext.pages,
            products: linkContext.products,
            collections: linkContext.collections,
            sectionIds: linkContext.sectionIds,
          });
      const resolvedRoute = route
        ? remapStorefrontPath(route, slug, customDomain)
        : null;
      if (resolvedRoute) {
        event.preventDefault();
        mobileMenu.close();
        if (node?.extensions?.openInNewTab === true) {
          window.open(resolvedRoute, "_blank", "noopener,noreferrer");
        } else if (/^https?:\/\//i.test(resolvedRoute)) {
          window.location.assign(resolvedRoute);
        } else {
          navigate(resolvedRoute);
        }
        return;
      }
      element = element.parentElement?.closest("[data-node-id]") ?? null;
    }
  };

  if (!rootNodeId) {
    return (
      <div className="grid min-h-screen place-items-center bg-background p-6">
        <Card className="w-full max-w-md p-8 text-center">
          <AlertCircle className="mx-auto mb-3 text-muted-foreground" size={32} />
          <h1 className="text-xl font-semibold">Empty store scene</h1>
          <p className="mt-2 text-sm text-muted-foreground">This storefront has no renderable Engine Scene.</p>
        </Card>
      </div>
    );
  }

  return (
    <main
      ref={wrapperRef}
      data-public-store
      data-theme-menu-root
      data-theme-menu-open={mobileMenu.open}
      className="min-h-screen w-full overflow-x-hidden"
      style={{ background: publicSceneBackground(scene) }}
    >
      <ThemeMobileMenuStyles settings={chrome} />
      <style>{`
        [data-public-store] [data-node-id]{-webkit-tap-highlight-color:transparent;}
        [data-public-store] [data-node-type="button"]{
          cursor:pointer!important;
          transition:filter 140ms ease,box-shadow 140ms ease,background-color 140ms ease;
        }
        [data-public-store] [data-node-type="button"]:hover{
          filter:brightness(.94);
          box-shadow:0 5px 16px rgba(0,0,0,.12);
        }
        [data-public-store] [data-theme-chrome-slot="nav-link"],
        [data-public-store] [data-theme-chrome-slot="account"],
        [data-public-store] [data-theme-chrome-slot="cart"],
        [data-public-store] [data-theme-chrome-slot="search"],
        [data-public-store] [data-theme-chrome-slot="nav-link"]:hover,
        [data-public-store] [data-theme-chrome-slot="account"]:hover,
        [data-public-store] [data-theme-chrome-slot="cart"]:hover,
        [data-public-store] [data-theme-chrome-slot="search"]:hover{
          box-shadow:none!important;
        }
        [data-public-store] [data-node-type="button"]:focus-visible{
          outline:3px solid #0178ff;
          outline-offset:2px;
        }
        [data-public-store] [data-node-id^="noir-product-card-"]{
          transition:transform 220ms ease,box-shadow 220ms ease;
        }
        [data-public-store] [data-node-id^="noir-product-card-"][data-storefront-action-active="true"]{
          transform:translate3d(0,-4px,0)!important;
          box-shadow:0 18px 38px rgba(0,0,0,.24)!important;
        }
        [data-public-store] [data-node-id^="basic-product-card-"][data-node-type="image"],
        [data-public-store] [data-node-id^="atelier-product-card-"][data-node-type="image"],
        [data-public-store] [data-node-id^="noir-product-card-"][data-node-type="image"]{
          cursor:pointer;
        }
        [data-public-store] [data-node-id^="basic-product-card-"][data-node-type="image"] img,
        [data-public-store] [data-node-id^="atelier-product-card-"][data-node-type="image"] img,
        [data-public-store] [data-node-id^="noir-product-card-"][data-node-type="image"] img{
          transition:transform 260ms ease,filter 260ms ease;
          will-change:transform;
        }
        [data-public-store] [data-node-id^="basic-product-card-"][data-node-type="image"]:hover img,
        [data-public-store] [data-node-id^="atelier-product-card-"][data-node-type="image"]:hover img,
        [data-public-store] [data-node-id^="noir-product-card-"][data-node-type="image"]:hover img{
          transform:scale(1.035);
          filter:saturate(1.04) contrast(1.02);
        }
        [data-image-empty] > button{display:none!important;}
        @media (prefers-reduced-motion:reduce){
          [data-public-store] [data-node-type="button"],
          [data-public-store] [data-node-type="image"] img{transition:none!important;}
        }
      `}</style>
      <div className="mx-auto flex w-full justify-center" style={{ minHeight: sceneHeight }}>
        <div style={{ position: "relative", width: sceneWidth, height: sceneHeight, maxWidth: "100%" }}>
          <div
            onClick={handleClick}
            style={{
              position: "relative",
              left: 0,
              top: 0,
              width: sceneWidth,
              height: sceneHeight,
              background: publicSceneBackground(renderedScene),
            }}
          >
            <ThemeMobileMenuProvider
              value={{
                open: mobileMenu.open,
                close: mobileMenu.close,
                toggle: mobileMenu.toggle,
                panelId: mobileMenuPanel
                  ? `theme-mobile-menu-${mobileMenuPanel.id.replace(/[^a-zA-Z0-9_-]/g, "-")}`
                  : undefined,
              }}
            >
              <StorefrontRuntime
                scene={renderedScene}
                breakpoint={breakpoint}
                layoutResolved
                linkContext={linkContext}
                pageType="home"
                storeId={profile.id}
                visibilityOverrides={chromeVisibilityOverrides}
                dynamicData={{
                  products,
                  currency: "USD",
                  store: {
                    name: profile.business_name,
                    tagline: profile.store_tagline,
                    about: profile.store_about,
                    cartCount: cart.count,
                  },
                }}
              />
            </ThemeMobileMenuProvider>
          </div>
        </div>
      </div>
      <ThemeCommerceMenu
        mode={commerceMenu}
        products={products}
        maximumSuggestions={functionality.search.maximumSuggestions}
        accent={storefrontTheme.accent}
        onClose={closeCommerceMenu}
        onBrowse={browseCatalog}
        onProduct={openProduct}
      />
    </main>
  );
};

const ProductsPage = ({
  slug,
  profile,
  products,
  theme,
  catalogRevision,
  initialQuery = "",
  initialCategory = "",
  collectionHandle = "",
  customDomain,
  themeId,
}: {
  slug: string;
  profile: PublicStoreProfile;
  products: PublicStoreItem[];
  theme: StoreTheme;
  catalogRevision: number;
  initialQuery?: string;
  initialCategory?: string;
  collectionHandle?: string;
  customDomain: boolean;
  themeId: string;
}) => {
  const cart = useCart(slug);
  const wishlist = useWishlist(slug);
  const { toast } = useToast();
  const [query, setQuery] = useState(initialQuery);
  const [category, setCategory] = useState(initialCategory);
  const [sort, setSort] = useState<CatalogSort>("newest");
  const [page, setPage] = useState(1);
  const pageSize = 24;
  const collectionTitle = collectionHandle
    ? collectionHandle.replace(/-/g, " ").replace(/\b\w/g, (character) => character.toUpperCase())
    : "";
  const template: StoreTemplate = themeId === "noir-chrono" ? "noir-chrono" : "minimal";
  const [catalog, setCatalog] = useState<CatalogPage>({
    items: collectionHandle ? [] : products.slice(0, pageSize),
    page: 1,
    pageSize,
    total: collectionHandle ? 0 : products.length,
    pageCount: collectionHandle ? 1 : Math.max(1, Math.ceil(products.length / pageSize)),
  });
  const [catalogLoading, setCatalogLoading] = useState(false);

  useEffect(() => {
    setPage(1);
  }, [category, query, sort]);

  useEffect(() => {
    setQuery(initialQuery);
  }, [initialQuery]);

  useEffect(() => {
    setCategory(initialCategory);
  }, [initialCategory]);

  useEffect(() => {
    let active = true;
    const timer = window.setTimeout(async () => {
      setCatalogLoading(true);
      try {
        const result = await storefrontDataResolver.getCatalog({
          storeId: profile.id,
          page,
          pageSize,
          search: query,
          sort,
          collectionHandle: collectionHandle || category,
        });
        if (active) setCatalog(result);
      } catch {
        // Keep the last valid catalog page visible during a temporary fetch failure.
      } finally {
        if (active) setCatalogLoading(false);
      }
    }, query.trim() ? 220 : 0);
    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [catalogRevision, category, collectionHandle, page, profile.id, query, sort]);

  const currentPage = Math.min(page, catalog.pageCount);
  const visible = catalog.items;

  return (
    <main data-storefront-page={collectionHandle ? "collection" : "products"}>
      <section className="bg-neutral-50">
        <div className="mx-auto w-full max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
          <div className="flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
            <div>
              <p className="text-sm font-medium" style={{ color: theme.accent }}>
                {collectionHandle ? "Collection" : "Products"}
              </p>
              <h1 className="mt-2 text-3xl font-semibold tracking-tight text-neutral-950 sm:text-4xl">
                {collectionTitle || `${profile.business_name || "Store"} products`}
              </h1>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-neutral-600">
                {collectionHandle
                  ? `Browse published products in the ${collectionTitle} collection.`
                  : "Browse every published product from this store. New dashboard products appear here automatically."}
              </p>
            </div>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-[minmax(220px,1fr)_170px_180px] lg:w-[720px]">
              <label className="relative block">
                <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400" size={16} />
                <input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Search products"
                  className="h-11 w-full rounded-full border border-black/10 bg-white pl-9 pr-4 text-sm outline-none focus:border-neutral-900"
                />
              </label>
              <label className="relative block">
                <select
                  aria-label="Filter by category"
                  value={category}
                  onChange={(event) => setCategory(event.target.value)}
                  className="h-11 w-full appearance-none rounded-full border border-black/10 bg-white px-4 text-sm outline-none focus:border-neutral-900"
                >
                  <option value="">All categories</option>
                  {Array.from(new Set(products
                    .map((product) => product.category?.trim())
                    .filter((value): value is string => Boolean(value))))
                    .sort((left, right) => left.localeCompare(right))
                    .map((value) => <option key={value} value={value}>{value}</option>)}
                </select>
              </label>
              <label className="relative block">
                <SlidersHorizontal className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400" size={16} />
                <select
                  value={sort}
                  onChange={(event) => setSort(event.target.value as CatalogSort)}
                  className="h-11 w-full appearance-none rounded-full border border-black/10 bg-white pl-9 pr-4 text-sm outline-none focus:border-neutral-900"
                >
                  <option value="newest">Newest</option>
                  <option value="name">Name</option>
                  <option value="price-asc">Price low to high</option>
                  <option value="price-desc">Price high to low</option>
                </select>
              </label>
            </div>
          </div>
          <div className="mt-6 flex gap-2 overflow-x-auto pb-1" aria-label="Product categories">
            <button type="button" onClick={() => setCategory("")} aria-pressed={!category} className="h-9 shrink-0 rounded-full border border-black/15 px-4 text-sm" style={!category ? { background: theme.accent, color: "#fff" } : undefined}>All</button>
            {Array.from(new Set(products
              .map((product) => product.category?.trim())
              .filter((value): value is string => Boolean(value))))
              .sort((left, right) => left.localeCompare(right))
              .map((value) => (
                <button key={value} type="button" onClick={() => setCategory(value)} aria-pressed={category === value} className="h-9 shrink-0 rounded-full border border-black/15 px-4 text-sm" style={category === value ? { background: theme.accent, color: "#fff" } : undefined}>{value}</button>
              ))}
          </div>
        </div>
      </section>

      <section className="mx-auto w-full max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        {visible.length ? (
          <div
            className="grid grid-cols-2 gap-3 transition-opacity sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5"
            aria-busy={catalogLoading}
            style={{ opacity: catalogLoading ? 0.55 : 1 }}
          >
            {visible.map((item) => (
              <ProductCard
                key={item.id}
                it={item}
                slug={slug}
                template={template}
                accent={theme.accent}
                onAdd={(id) => {
                  cart.add(id, 1);
                  toast({ title: "Added to cart" });
                }}
                onWish={(id) => wishlist.toggle(id)}
                wished={wishlist.has(item.id)}
                customDomain={customDomain}
              />
            ))}
          </div>
        ) : (
          <Card className="grid min-h-72 place-items-center p-8 text-center">
            <div>
              <div className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-neutral-100">
                <Search size={20} className="text-neutral-500" />
              </div>
              <h2 className="mt-4 text-xl font-semibold text-neutral-950">No products found</h2>
              <p className="mt-2 text-sm text-neutral-600">
                {catalog.total ? "Try a different search." : "Published products from the dashboard will appear here."}
              </p>
            </div>
          </Card>
        )}

        {catalog.pageCount > 1 ? (
          <div className="mt-8 flex items-center justify-center gap-2">
            <Button variant="outline" disabled={currentPage <= 1 || catalogLoading} onClick={() => setPage((value) => Math.max(1, value - 1))}>
              <ChevronLeft size={16} className="mr-1" /> Previous
            </Button>
            <span className="text-sm text-neutral-600">Page {currentPage} of {catalog.pageCount}</span>
            <Button variant="outline" disabled={currentPage >= catalog.pageCount || catalogLoading} onClick={() => setPage((value) => Math.min(catalog.pageCount, value + 1))}>
              Next <ChevronRight size={16} className="ml-1" />
            </Button>
          </div>
        ) : null}
      </section>
    </main>
  );
};

const AboutPage = ({ profile, theme }: { profile: PublicStoreProfile; theme: StoreTheme }) => (
  <main data-storefront-page="about">
    <section className="bg-neutral-50">
      <div className="mx-auto grid w-full max-w-7xl gap-8 px-4 py-12 sm:px-6 md:grid-cols-[1.1fr_0.9fr] lg:px-8">
        <div>
          <p className="text-sm font-medium" style={{ color: theme.accent }}>About us</p>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight text-neutral-950 sm:text-5xl">
            {profile.business_name || "Our store"}
          </h1>
          <p className="mt-5 max-w-2xl text-base leading-8 text-neutral-600">
            {profile.store_about || "This merchant has not added an about description yet."}
          </p>
        </div>
        <div className="rounded-3xl border border-black/10 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-neutral-950">Mission</h2>
          <p className="mt-3 text-sm leading-7 text-neutral-600">
            {profile.store_tagline || "This merchant has not added a mission statement yet."}
          </p>
          <div className="mt-6 grid grid-cols-2 gap-3">
            {["Product catalog", "Store information", "Responsive storefront", "Brand presentation"].map((item) => (
              <div key={item} className="rounded-2xl bg-neutral-50 p-4 text-sm font-medium text-neutral-800">{item}</div>
            ))}
          </div>
        </div>
      </div>
    </section>
  </main>
);

export const ContactPage = ({ profile, theme }: { profile: PublicStoreProfile; theme: StoreTheme }) => {
  return (
    <main data-storefront-page="contact">
      <section className="bg-neutral-50">
        <div className="mx-auto grid w-full max-w-7xl gap-8 px-4 py-12 sm:px-6 lg:grid-cols-[0.85fr_1.15fr] lg:px-8">
          <div>
            <p className="text-sm font-medium" style={{ color: theme.accent }}>Contact</p>
            <h1 className="mt-3 text-3xl font-semibold tracking-tight text-neutral-950 sm:text-5xl">
              Contact {profile.business_name || "the store"}
            </h1>
            <p className="mt-5 text-base leading-8 text-neutral-600">
              Contact details have not been configured for this storefront.
            </p>
          </div>
          <Card className="flex min-h-56 items-center justify-center p-5 sm:p-6">
            <div className="max-w-sm text-center" role="status" data-contact-form-status="unavailable">
              <AlertCircle className="mx-auto" size={24} style={{ color: theme.accent }} />
              <h2 className="mt-4 text-lg font-semibold text-neutral-950">Contact form unavailable</h2>
              <p className="mt-2 text-sm leading-6 text-neutral-600">
                This store is not accepting contact-form submissions yet. No message has been sent or stored.
              </p>
            </div>
          </Card>
        </div>
      </section>
    </main>
  );
};

const SecondaryStorefrontShell = ({ children }: { children: ReactNode }) => {
  const runtime = useThemeRuntime();
  return (
    <div
      data-storefront-secondary
      data-active-theme={runtime.themeId}
      data-noir-storefront={runtime.themeId === "noir-chrono" ? "true" : undefined}
      className="min-h-screen bg-white text-neutral-950"
      style={{
        "--storefront-background": runtime.tokens.colors.background,
        "--storefront-surface": runtime.tokens.colors.surface,
        "--storefront-text": runtime.tokens.colors.text,
        "--storefront-muted": runtime.tokens.colors.textMuted,
        "--storefront-border": runtime.tokens.colors.border,
        "--storefront-primary": runtime.tokens.colors.primary,
        "--storefront-heading": runtime.tokens.typography.headingFont,
        fontFamily: runtime.tokens.typography.bodyFont,
      } as CSSProperties}
    >
      {runtime.themeId === "noir-chrono" ? <NoirChronoStorefrontStyles /> : null}
      {children}
    </div>
  );
};

const Store = ({
  page = "home",
  slugOverride,
  customDomain = false,
  previewSource,
  pageSlugOverride,
  collectionHandleOverride,
}: StoreProps) => {
  const {
    slug: routeSlug = "",
    pageSlug: customPageSlug = "",
    collectionHandle: routeCollectionHandle = "",
  } = useParams();
  const slug = slugOverride ?? routeSlug;
  const selectedPageSlug = pageSlugOverride ?? customPageSlug;
  const selectedCollectionHandle = collectionHandleOverride ?? routeCollectionHandle;
  const [searchParams, setSearchParams] = useSearchParams();
  const [state, setState] = useState<LoadState>({ status: "loading" });
  const rumReporterRef = useRef<ReturnType<typeof createStorefrontRumReporter> | null>(null);
  const cart = useCart(slug);
  const loadedStoreId = state.status === "ready" ? state.profile.id : "";
  const cartOpen = searchParams.get("cart") === "1";
  const setCartOpen = useCallback((open: boolean) => {
    const next = new URLSearchParams(searchParams);
    if (open) next.set("cart", "1");
    else next.delete("cart");
    setSearchParams(next, { replace: true });
  }, [searchParams, setSearchParams]);
  const loadCartProduct = useCallback(
    (productId: string) => storefrontDataResolver.getProduct(loadedStoreId, productId),
    [loadedStoreId],
  );

  useEffect(() => {
    if (state.status !== "ready") {
      rumReporterRef.current = null;
      return;
    }
    const reporter = createStorefrontRumReporter({
      handle: slug,
      routeType: resourceTypeForStorePage(page),
      assignment: state.runtimeAssignment,
    });
    rumReporterRef.current = reporter;
    let stop = () => undefined;
    let disposed = false;
    void reporter.startCoreWebVitals().then((cleanup) => {
      if (disposed) cleanup();
      else stop = cleanup;
    });
    return () => {
      disposed = true;
      stop();
      if (rumReporterRef.current === reporter) rumReporterRef.current = null;
    };
  }, [page, slug, state]);

  useEffect(() => {
    let active = true;

    const loadProducts = async (
      profileId: string,
      preview: StorePreviewSnapshot | null,
    ) => {
      if (preview) {
        return [...preview.items]
          .filter((item) => item.is_published)
          .map((item) => item as PublicStoreItem);
      }
      return (await storefrontDataResolver.getCatalog({
        storeId: profileId,
        page: 1,
        pageSize: 24,
        sort: "newest",
      })).items;
    };

    const resolveScene = async (
      profile: PublicStoreProfile,
      products: PublicStoreItem[],
      collections: StorefrontCollection[],
    ): Promise<{ scene: SceneTree; linkContext: StorefrontLinkContext }> => {
      try {
        const homeScene = getRequiredEngineScene(profile.theme, `Store ${slug}`);
        const pageDocument = getStorefrontPageDocument(
          profile.theme,
          homeScene,
        );
        const selectedScene =
          page === "custom"
            ? getStorefrontPageBySlug(profile.theme, homeScene, selectedPageSlug)?.scene
            : homeScene;
        if (!selectedScene) throw new Error(`Page ${selectedPageSlug} was not found.`);
        return {
          scene: await hydratePublicScene(profile, selectedScene, products),
          linkContext: {
            storeSlug: slug,
            pages: new Map(
              pageDocument.pages.map((storePage) => [
                storePage.id,
                {
                  id: storePage.id,
                  handle: storePage.slug,
                  status: "published" as const,
                },
              ]),
            ),
            products: new Map(
              products.map((product) => [
                product.id,
                {
                  id: product.id,
                  handle: product.handle || product.id,
                  status: product.is_published
                    ? "published" as const
                    : "hidden" as const,
                },
              ]),
            ),
            collections: collectionLinksFor(products, collections),
          },
        };
      } catch {
        if (page === "custom") throw new Error(`Page ${selectedPageSlug} was not found.`);
        return {
          scene: await hydratePublicScene(
            profile,
            buildStoreSceneTree(
              profile as StoreSceneProfile,
              products as StoreSceneItem[],
            ),
            products,
          ),
          linkContext: {
            storeSlug: slug,
            products: new Map(
              products.map((product) => [
                product.id,
                {
                  id: product.id,
                  handle: product.handle || product.id,
                  status: product.is_published
                    ? "published" as const
                    : "hidden" as const,
                },
              ]),
            ),
            collections: collectionLinksFor(products, collections),
          },
        };
      }
    };

    const load = async () => {
      setState({ status: "loading" });
      try {
        const preview = previewSource ? await previewSource.load() : null;
        const profile = preview
          ? {
              ...preview.profile,
              id: previewSource.storeId,
              store_slug: slug,
              theme: preview.profile.theme_draft ?? preview.profile.theme,
            }
          : await storefrontDataResolver.getStore(slug);
        if (!active) return;
        if (!profile) {
          setState({ status: "error", message: "Store not found." });
          return;
        }
        const rawProfile = profile as PublicStoreProfile;
        const typedProfile: PublicStoreProfile = {
          ...rawProfile,
          theme: preview
            ? rawProfile.theme_draft ?? rawProfile.theme
            : rawProfile.theme_published ?? rawProfile.theme,
        };
        const [products, collections, runtimeAssignment] = await Promise.all([
          loadProducts(typedProfile.id, preview),
          preview ? Promise.resolve([]) : storefrontDataResolver.getCollections(typedProfile.id),
          preview
            ? Promise.resolve({ runtime: "legacy", reason: "missing" } as const)
            : runtimeArtifactResolver.resolve(slug),
        ]);
        if (!active) return;
        if (page === "collection" && !collections.some((collection) =>
          collection.handle.toLowerCase() === selectedCollectionHandle.toLowerCase())) {
          throw new Error(`Collection ${selectedCollectionHandle} was not found.`);
        }
        if (runtimeAssignment.runtime === "adaptive") {
          setState({
            status: "ready",
            runtime: "adaptive",
            profile: typedProfile,
            products,
            collections,
            runtimeAssignment,
          });
          return;
        }
        const resolved = await resolveScene(typedProfile, products, collections);
        if (!active) return;
        setState({
          status: "ready",
          runtime: "legacy",
          profile: typedProfile,
          products,
          scene: resolved.scene,
          linkContext: resolved.linkContext,
          runtimeAssignment,
        });

      } catch (loadError) {
        setState({ status: "error", message: loadError instanceof Error ? loadError.message : "Could not load store." });
      }
    };

    void load();
    return () => {
      active = false;
    };
  }, [page, previewSource, selectedCollectionHandle, selectedPageSlug, slug]);

  if (state.status === "loading") {
    return <div className="grid min-h-screen place-items-center bg-background text-sm text-muted-foreground">Loading store...</div>;
  }

  if (state.status === "error") {
    return (
      <div className="grid min-h-screen place-items-center bg-background p-6">
        <Card className="w-full max-w-md p-8 text-center">
          <AlertCircle className="mx-auto mb-3 text-muted-foreground" size={34} />
          <h1 className="text-2xl font-semibold">Store unavailable</h1>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">{state.message}</p>
          <Button asChild className="mt-6">
            <Link to="/store"><ArrowLeft size={14} className="mr-2" /> Back to stores</Link>
          </Button>
        </Card>
      </div>
    );
  }

  const pageLabel = page === "home"
    ? ""
    : page === "custom"
      ? selectedPageSlug.replace(/-/g, " ")
      : page === "collection"
        ? selectedCollectionHandle.replace(/-/g, " ")
        : page;
  const storefrontTitle = pageLabel
    ? `${pageLabel.charAt(0).toUpperCase()}${pageLabel.slice(1)} | ${state.profile.business_name || "Store"}`
    : state.profile.business_name || "Store";
  const storefrontHead = (
    <StorefrontHead
      title={storefrontTitle}
      description={state.profile.store_tagline || state.profile.store_about}
      canonicalUrl={`${window.location.origin}${window.location.pathname}`}
    />
  );

  if (state.runtime === "adaptive") {
    const homeHref = storefrontPath(slug, "", customDomain);
    const productsHref = storefrontPath(slug, "products", customDomain);
    const cartHref = storefrontPath(slug, "cart", customDomain);
    const searchHref = storefrontPath(slug, "search", customDomain);
    const query = searchParams.get("q")?.trim() ?? "";
    const products = page === "search" && query
      ? state.products.filter((product) => `${product.name} ${product.description ?? ""} ${product.category ?? ""}`
        .toLocaleLowerCase().includes(query.toLocaleLowerCase()))
      : state.products;
    const selectedCollection = state.collections.find((collection) =>
      collection.handle.toLowerCase() === selectedCollectionHandle.toLowerCase());
    const adaptivePage = page === "about"
      ? { title: "About us", body: state.profile.store_about || "Learn more about our store and the care behind every product." }
      : page === "contact"
        ? { title: "Contact", body: "Questions about a product or order? Get in touch with our store team and we'll be happy to help." }
        : page === "blog"
          ? { title: pageLabel || "Journal", body: state.profile.store_about || "Stories, product notes, and updates from our store." }
          : page === "custom"
            ? { title: pageLabel || "Page", body: state.profile.store_about || "" }
            : null;
    return (
      <>
        {storefrontHead}
        <AdaptiveRuntimeErrorBoundary
          onError={(code) => void rumReporterRef.current?.reportRenderError(code)}
        >
          <AdaptiveStorefrontRuntime
            artifact={state.runtimeAssignment.artifact}
            resourceType={resourceTypeForStorePage(page)}
            storeName={state.profile.business_name || "Store"}
            bannerUrl={state.profile.store_banner_url}
            products={products}
            collectionTitle={selectedCollection?.title}
            page={adaptivePage}
            searchQuery={query}
            cart={{
              quantities: cart.cart,
              count: cart.count,
              add: cart.add,
              checkout: () => setCartOpen(true),
              increment: cart.inc,
              decrement: cart.dec,
              remove: cart.remove,
            }}
            navigation={adaptiveNavigationFor(slug, customDomain)}
            homeHref={homeHref}
            productsHref={productsHref}
            cartHref={cartHref}
            searchHref={searchHref}
            productHref={(product) => storefrontPath(
              slug,
              `products/${encodeURIComponent(product.handle || product.id)}`,
              customDomain,
            )}
          />
        </AdaptiveRuntimeErrorBoundary>
        <StorefrontCartDrawer
          open={cartOpen}
          onOpenChange={setCartOpen}
          storeId={state.profile.id}
          storeName={state.profile.business_name || "Store"}
          accent={state.profile.store_color?.trim() || "#1f2937"}
          products={state.products}
          loadProduct={loadCartProduct}
          cart={cart}
          checkoutEnabled={!previewSource}
        />
      </>
    );
  }

  const theme = resolveStorefrontTheme(state.profile, state.scene);
  const activeThemeId = themeIdForScene(state.scene);
  const activeBranding = themeBrandingSystem.getAppliedSettings(state.scene);
  const cartDrawer = (
    <StorefrontCartDrawer
      open={cartOpen}
      onOpenChange={setCartOpen}
      storeId={state.profile.id}
      storeName={state.profile.business_name || "Store"}
      accent={theme.accent}
      products={state.products}
      loadProduct={loadCartProduct}
      cart={cart}
      checkoutEnabled={!previewSource}
    />
  );

  if (page === "home" || page === "custom") {
    return (
      <>
        {storefrontHead}
        <StoreSceneSurface
          scene={state.scene}
          slug={slug}
          profile={state.profile}
          products={state.products}
          linkContext={state.linkContext}
          customDomain={customDomain}
        />
        {cartDrawer}
      </>
    );
  }

  return (
    <ThemeRuntimeProvider themeId={activeThemeId} mode="storefront" branding={activeBranding}>
      {storefrontHead}
      <SecondaryStorefrontShell>
        <PublicNav
          slug={slug}
          profile={state.profile}
          theme={theme}
          cartCount={cart.count}
          scene={state.scene}
          linkContext={state.linkContext}
          customDomain={customDomain}
        />
        {page === "products" || page === "collection" ? (
          <ProductsPage
            slug={slug}
            profile={state.profile}
            products={state.products}
            theme={theme}
            catalogRevision={0}
            initialQuery={searchParams.get("q") ?? ""}
            initialCategory={page === "products" ? searchParams.get("category") ?? "" : ""}
            collectionHandle={page === "collection" ? selectedCollectionHandle : ""}
            customDomain={customDomain}
            themeId={activeThemeId}
          />
        ) : page === "about" ? (
          <AboutPage profile={state.profile} theme={theme} />
        ) : (
          <ContactPage profile={state.profile} theme={theme} />
        )}
        <PublicFooter
          slug={slug}
          profile={state.profile}
          theme={theme}
          scene={state.scene}
          linkContext={state.linkContext}
          customDomain={customDomain}
        />
      </SecondaryStorefrontShell>
      {cartDrawer}
    </ThemeRuntimeProvider>
  );
};

export default Store;
