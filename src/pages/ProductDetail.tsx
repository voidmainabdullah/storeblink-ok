import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { useParams, Link, NavLink, useSearchParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Logo } from "@/components/marketing/Logo";
import {
  ShoppingCart, Heart, ChevronRight, ChevronLeft, Plus, Minus, Share2, Check,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { useStoreCart } from "@/hooks/useStoreCart";
import { useWishlist } from "@/hooks/useWishlist";
import { ProductCard } from "@/components/store/ProductCard";
import { fmt, galleryImages } from "@/components/store/storeUtils";
import type { StoreTemplate } from "@/components/store/templates";
import { cn } from "@/lib/utils";
import { buildStoreSceneTree, getRequiredEngineScene, type StoreSceneProfile } from "@/editor/engine/storeSceneAdapter";
import { storefrontDataResolver } from "@/storefront/data-resolvers";
import { StorefrontHead } from "@/storefront/seo/StorefrontHead";
import { StorefrontCartDrawer } from "@/storefront/checkout";
import type { StorefrontProduct } from "@/storefront/data-resolvers";
import { resolveSceneNavigation, type NavigationViewItem } from "@/core/navigation";
import { getStorefrontPageDocument } from "@/document/pages";
import type { StorefrontLinkContext } from "@/content/menus";
import {
  ThemeMenuMorphIcon,
  ThemeMobileMenuStyles,
  themeChromeSystem,
  themeMenuIconPresentationForScene,
  useThemeMobileMenu,
} from "@/theme-engine/chrome";
import { themeIdForScene } from "@/theme-engine/runtime";
import { NoirChronoStorefrontStyles } from "@/themes/noir-chrono/runtime";
import {
  AdaptiveRuntimeErrorBoundary,
  AdaptiveStorefrontRuntime,
  runtimeArtifactResolver,
  type StorefrontRuntimeAssignment,
} from "@/adaptive-commerce/runtime";
import type { RuntimeArtifact } from "@/adaptive-commerce/contracts";
import { createStorefrontRumReporter } from "@/adaptive-commerce/rollout";

const sceneForProductProfile = (profile: StoreSceneProfile) => {
  try {
    return getRequiredEngineScene(profile.theme, "Product detail store profile");
  } catch {
    return buildStoreSceneTree(profile);
  }
};

const accentFromEngineScene = (profile: StoreSceneProfile): string => {
  const profileAccent = typeof profile.store_color === "string" ? profile.store_color.trim() : "";
  if (profileAccent) return profileAccent;
  const scene = sceneForProductProfile(profile);
  const nodes = Object.values(scene.nodes);
  const buttonBackground = nodes.find((node) => typeof node.props.background === "string")?.props.background;
  if (typeof buttonBackground === "string") return buttonBackground;
  const solidFill = nodes
    .flatMap((node) => node.style.fills)
    .find((fill) => fill.type === "solid" && !["#ffffff", "#FFFFFF", "#f3f4f6", "#F3F4F6"].includes(fill.color));
  return solidFill?.type === "solid" ? solidFill.color : "#0178ff";
};

type ProductDetailProps = {
  slugOverride?: string;
  customDomain?: boolean;
};

const ProductDetail = ({ slugOverride, customDomain = false }: ProductDetailProps = {}) => {
  const { slug: routeSlug = "", id, handle } = useParams();
  const slug = slugOverride ?? routeSlug;
  const storePath = (path = "") => {
    const suffix = path ? `/${path.replace(/^\/+/, "")}` : "";
    return customDomain ? suffix || "/" : `/store/${slug}${suffix}`;
  };
  const productIdentifier = handle ?? id ?? "";
  const { toast } = useToast();
  const cart = useStoreCart(slug);
  const wishlist = useWishlist(slug);
  const [searchParams, setSearchParams] = useSearchParams();
  const headerRef = useRef<HTMLElement>(null);
  const mobileMenu = useThemeMobileMenu(headerRef);

  const [store, setStore] = useState<any>(null);
  const [item, setItem] = useState<any>(null);
  const [related, setRelated] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [runtimeAssignment, setRuntimeAssignment] = useState<StorefrontRuntimeAssignment<RuntimeArtifact> | null>(null);
  const rumReporterRef = useRef<ReturnType<typeof createStorefrontRumReporter> | null>(null);
  const [activeImg, setActiveImg] = useState(0);
  const [qty, setQty] = useState(1);
  const [added, setAdded] = useState(false);
  const cartOpen = searchParams.get("cart") === "1";
  const setCartOpen = useCallback((open: boolean) => {
    const next = new URLSearchParams(searchParams);
    if (open) next.set("cart", "1");
    else next.delete("cart");
    setSearchParams(next, { replace: true });
  }, [searchParams, setSearchParams]);
  const loadCartProduct = useCallback(
    (productId: string) => store
      ? storefrontDataResolver.getProduct(store.id, productId)
      : Promise.resolve(null),
    [store],
  );
  const activeScene = useMemo(
    () => (store && runtimeAssignment?.runtime !== "adaptive"
      ? sceneForProductProfile(store as StoreSceneProfile)
      : null),
    [runtimeAssignment, store],
  );
  const activeThemeId = activeScene ? themeIdForScene(activeScene) : "universal";
  const activeChrome = useMemo(
    () => (activeScene ? themeChromeSystem.getSettings(activeScene) : null),
    [activeScene],
  );
  const menuIcon = useMemo(
    () => (activeScene ? themeMenuIconPresentationForScene(activeScene, "mobile") : null),
    [activeScene],
  );
  const navigationLinks = useMemo<NavigationViewItem[]>(() => {
    if (!activeScene || !store) return [];
    const catalogProducts = [item, ...related].filter(Boolean) as StorefrontProduct[];
    const pageDocument = getStorefrontPageDocument(store.theme, activeScene);
    const context: StorefrontLinkContext = {
      storeSlug: slug,
      pages: new Map(pageDocument.pages.map((page) => [page.id, {
        id: page.id,
        handle: page.slug,
        status: "published" as const,
      }])),
      products: new Map(catalogProducts.map((product) => [product.id, {
        id: product.id,
        handle: product.handle || product.id,
        status: product.is_published ? "published" as const : "hidden" as const,
      }])),
      collections: new Map(
        Array.from(new Set(catalogProducts.map((product) => product.category?.trim()).filter(Boolean)))
          .map((category) => [String(category), {
            id: String(category),
            handle: String(category),
            status: "published" as const,
          }]),
      ),
    };
    const prefix = `/store/${slug}`;
    return resolveSceneNavigation(slug, activeScene, context, "mobile").map((link) => {
      if (!customDomain || link.external) return link;
      const href = link.href === prefix
        ? "/"
        : link.href.startsWith(`${prefix}/`)
          ? link.href.slice(prefix.length)
          : link.href;
      return { ...link, href };
    });
  }, [activeScene, customDomain, item, related, slug, store]);

  useEffect(() => {
    let active = true;
    const load = async () => {
      setLoading(true);
      setLoadError(null);
      setRuntimeAssignment(null);
      try {
        const [profile, assignment] = await Promise.all([
          storefrontDataResolver.getStore(slug),
          runtimeArtifactResolver.resolve(slug),
        ]);
        if (!profile || !active) {
          if (active) setLoading(false);
          return;
        }
        const [product, catalog] = await Promise.all([
          storefrontDataResolver.getProduct(profile.id, productIdentifier),
          storefrontDataResolver.getCatalog({
            storeId: profile.id,
            page: 1,
            pageSize: 9,
            sort: "newest",
          }),
        ]);
        if (!active) return;
        setStore(profile);
        setRuntimeAssignment(assignment);
        setItem(product);
        setRelated(catalog.items.filter((candidate) => candidate.id !== product?.id).slice(0, 8));
        setActiveImg(0);
        setQty(1);
        window.scrollTo({ top: 0, behavior: "instant" as ScrollBehavior });
      } catch (error) {
        if (active) {
          setLoadError(error instanceof Error ? error.message : "Could not load this product.");
        }
      } finally {
        if (active) setLoading(false);
      }
    };
    void load();
    return () => {
      active = false;
    };
  }, [productIdentifier, slug]);

  useEffect(() => {
    if (!runtimeAssignment) {
      rumReporterRef.current = null;
      return;
    }
    const reporter = createStorefrontRumReporter({
      handle: slug,
      routeType: "product",
      assignment: runtimeAssignment,
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
  }, [runtimeAssignment, slug]);

  // Build gallery from images[] (preferred) or legacy image_url
  const gallery = useMemo(() => (item ? galleryImages(item) : []), [item]);

  if (loading) return <div className="min-h-screen grid place-items-center text-muted-foreground">Loading...</div>;
  if (loadError) {
    return (
      <div className="min-h-screen grid place-items-center bg-background p-6">
        <Card className="max-w-md w-full p-10 text-center">
          <h1 className="text-2xl font-semibold mb-2">Store unavailable</h1>
          <p className="text-muted-foreground mb-6">{loadError}</p>
          <Button asChild><Link to={storePath()}>Back to store</Link></Button>
        </Card>
      </div>
    );
  }

  if (!store || !item) {
    return (
      <div className="min-h-screen grid place-items-center bg-background p-6">
        <Card className="max-w-md w-full p-10 text-center">
          <h1 className="text-2xl font-semibold mb-2">Product not found</h1>
          <p className="text-muted-foreground mb-6">This product may have been removed.</p>
          <Button asChild><Link to={storePath()}>Back to store</Link></Button>
        </Card>
      </div>
    );
  }

  if (runtimeAssignment?.runtime === "adaptive") {
    const products = [item, ...related];
    return (
      <>
        <StorefrontHead
          title={`${item.name} | ${store.business_name || "Store"}`}
          description={item.description}
          canonicalUrl={`${window.location.origin}${window.location.pathname}`}
        />
        <AdaptiveRuntimeErrorBoundary
          onError={(code) => void rumReporterRef.current?.reportRenderError(code)}
        >
          <AdaptiveStorefrontRuntime
            artifact={runtimeAssignment.artifact}
            resourceType="product"
            storeName={store.business_name || "Store"}
            bannerUrl={store.store_banner_url}
            products={products}
            currentProduct={item}
            cart={{
              quantities: cart.cart,
              count: cart.count,
              add: cart.add,
              checkout: () => setCartOpen(true),
              increment: cart.inc,
              decrement: cart.dec,
              remove: cart.remove,
            }}
            navigation={[
              { id: "home", label: "Home", href: storePath() },
              { id: "products", label: "Products", href: storePath("products") },
              { id: "about", label: "About", href: storePath("about") },
              { id: "contact", label: "Contact", href: storePath("contact") },
            ]}
            homeHref={storePath()}
            productsHref={storePath("products")}
            cartHref={storePath("cart")}
            searchHref={storePath("search")}
            productHref={(product) => storePath(`products/${encodeURIComponent(product.handle || product.id)}`)}
          />
        </AdaptiveRuntimeErrorBoundary>
        <StorefrontCartDrawer
          open={cartOpen}
          onOpenChange={setCartOpen}
          storeId={store.id}
          storeName={store.business_name || "Store"}
          accent={accentFromEngineScene(store as StoreSceneProfile)}
          products={[item, ...related] as StorefrontProduct[]}
          loadProduct={loadCartProduct}
          cart={cart}
        />
      </>
    );
  }

  const accent = accentFromEngineScene(store as StoreSceneProfile);
  const template: StoreTemplate = activeThemeId === "noir-chrono" ? "noir-chrono" : "minimal";

  const hasOriginal =
    typeof item.original_price_cents === "number" &&
    item.original_price_cents > item.price_cents;
  const original = hasOriginal ? item.original_price_cents : null;
  const discount = hasOriginal
    ? Math.round(
        ((item.original_price_cents - item.price_cents) /
          item.original_price_cents) *
          100,
      )
    : 0;
  const wished = wishlist.has(item.id);
  const soldOut = item.stock !== null && item.stock <= 0;
  const maxQty = Math.max(1, Math.min(item.stock ?? 99, 99));

  const handleAdd = () => {
    if (soldOut) return;
    cart.add(item.id, qty);
    setAdded(true);
    toast({ title: `Added ${qty} x ${item.name} to cart` });
    setTimeout(() => setAdded(false), 1500);
  };
  const handleBuyNow = () => {
    if (soldOut) return;
    cart.add(item.id, qty);
    setCartOpen(true);
  };

  return (
    <div
      data-active-theme={activeThemeId}
      data-noir-storefront={activeThemeId === "noir-chrono" ? "true" : undefined}
      className="min-h-screen bg-muted/30"
      style={{
        "--storefront-primary": accent,
        "--storefront-heading": activeThemeId === "noir-chrono" ? "Inter" : "inherit",
      } as CSSProperties}
    >
      {activeThemeId === "noir-chrono" ? <NoirChronoStorefrontStyles /> : null}
      <StorefrontHead
        title={`${item.name} | ${store.business_name || "Store"}`}
        description={item.description}
        canonicalUrl={`${window.location.origin}${window.location.pathname}`}
      />
      <header
        ref={headerRef}
        data-storefront-chrome="header"
        data-theme-menu-root
        data-theme-menu-open={mobileMenu.open}
        className="sticky top-0 z-40 border-b border-border bg-background shadow-sm"
      >
        {activeChrome ? <ThemeMobileMenuStyles settings={activeChrome} /> : null}
        <div className="container flex items-center justify-between h-14 gap-3">
          <Link to={storePath()} className="relative z-20 flex min-w-0 items-center gap-2">
            <div className="w-8 h-8 rounded-lg grid place-items-center text-white font-black shrink-0" style={{ backgroundColor: accent }}>
              {store.business_name?.charAt(0)?.toUpperCase() ?? "S"}
            </div>
            <span data-public-brand-name className="truncate font-bold tracking-tight">{store.business_name}</span>
          </Link>
          <nav data-theme-primary-nav className="relative z-20 hidden items-center gap-1 rounded-full border border-border p-1 text-sm md:flex">
            {navigationLinks.map((link) => link.external ? (
              <a key={link.id} href={link.href} target={link.target} rel={link.rel ?? "noopener noreferrer"} className="rounded-full px-3 py-1.5 hover:bg-muted">
                {link.label}
              </a>
            ) : (
              <NavLink key={link.id} to={link.href} className="rounded-full px-3 py-1.5 hover:bg-muted">
                {link.label}
              </NavLink>
            ))}
          </nav>
          <div className="relative z-20 flex items-center gap-1">
            <button onClick={() => wishlist.toggle(item.id)} className="px-2.5 py-2 rounded-lg hover:bg-muted relative" aria-label="Wishlist">
              <Heart size={18} className={wished ? "text-rose-500" : ""} fill={wished ? "currentColor" : "none"} />
            </button>
            <button type="button" onClick={() => setCartOpen(true)} className="px-2.5 py-2 rounded-lg hover:bg-muted relative" aria-label="Open cart">
              <ShoppingCart size={18} />
              {cart.count > 0 && (
                <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] text-[10px] grid place-items-center rounded-full text-white font-bold px-1" style={{ backgroundColor: accent }}>
                  {cart.count}
                </span>
              )}
            </button>
            {menuIcon ? (
              <button
                type="button"
                data-theme-menu-trigger-shell
                data-theme-chrome-slot="mobile-menu-trigger"
                aria-label={mobileMenu.open ? "Close navigation" : "Open navigation"}
                aria-expanded={mobileMenu.open}
                aria-controls="product-mobile-navigation"
                onClick={mobileMenu.toggle}
                className="hidden items-center justify-center"
                style={{
                  color: menuIcon.config.color,
                  background: menuIcon.config.background,
                  border: `${menuIcon.config.borderWidth}px solid ${menuIcon.config.borderColor}`,
                  borderRadius: menuIcon.config.radius,
                  padding: menuIcon.config.padding,
                }}
              >
                <ThemeMenuMorphIcon config={menuIcon.config} customSource={menuIcon.customSource} />
              </button>
            ) : null}
          </div>
        </div>
        <nav
          id="product-mobile-navigation"
          data-theme-secondary-mobile-menu
          data-theme-chrome-slot="mobile-menu"
          data-mobile-menu-presentation={activeChrome?.mobileMenu.presentation ?? "drawer"}
          aria-label="Store navigation"
          tabIndex={-1}
          className="relative z-20 grid gap-1 border-t border-border bg-background p-3"
        >
          {navigationLinks.map((link) => link.external ? (
            <a key={link.id} href={link.href} target={link.target} rel={link.rel ?? "noopener noreferrer"} className="min-h-11 rounded-lg bg-muted px-3 py-3 text-sm font-medium">
              {link.label}
            </a>
          ) : (
            <NavLink key={link.id} to={link.href} onClick={mobileMenu.close} className="min-h-11 rounded-lg bg-muted px-3 py-3 text-sm font-medium">
              {link.label}
            </NavLink>
          ))}
        </nav>
      </header>

      {/* Breadcrumb */}
      <div className="container pt-4 pb-2">
        <nav className="flex items-center gap-1.5 text-xs text-muted-foreground flex-wrap">
          <Link to={storePath()} className="hover:text-foreground">Home</Link>
          <ChevronRight size={12} />
          <Link to={storePath("products")} className="hover:text-foreground">Products</Link>
          <ChevronRight size={12} />
          {item.category && <><span className="hover:text-foreground">{item.category}</span><ChevronRight size={12} /></>}
          <span className="text-foreground font-medium truncate max-w-[200px]">{item.name}</span>
        </nav>
      </div>

      {/* Main product area */}
      <section className="container pb-8">
        <div className="bg-background rounded-2xl border border-border overflow-hidden">
          <div className="grid lg:grid-cols-2 gap-0">
            {/* Gallery */}
            <div className="p-4 lg:p-6 lg:border-r border-border">
              <div className="aspect-square rounded-xl bg-muted overflow-hidden relative group">
                {gallery[activeImg] ? (
                  <img src={gallery[activeImg]} alt={item.name} className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full grid place-items-center text-7xl font-bold text-foreground/15"
                    style={{ background: `linear-gradient(135deg, ${accent}22, ${accent}08)` }}>
                    {item.name.charAt(0).toUpperCase()}
                  </div>
                )}
                {discount > 0 && (
                  <div className="absolute top-3 left-3 text-white text-xs font-bold px-2.5 py-1 rounded-full" style={{ background: accent }}>
                    -{discount}% OFF
                  </div>
                )}
              </div>
              {gallery.length > 1 && (
                <div className="flex gap-2 mt-3 overflow-x-auto">
                  {gallery.map((g, i) => (
                    <button
                      key={i}
                      onClick={() => setActiveImg(i)}
                      className={cn(
                        "w-16 h-16 rounded-lg overflow-hidden border-2 shrink-0 transition-all",
                        i === activeImg ? "border-foreground" : "border-transparent opacity-60 hover:opacity-100"
                      )}
                    >
                      <img src={g} alt="" className="w-full h-full object-cover" />
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Info */}
            <div className="p-5 lg:p-8 flex flex-col">
              {item.category && (
                <Badge variant="secondary" className="self-start mb-2 font-normal">{item.category}</Badge>
              )}
              <h1 className={cn(
                "font-bold leading-tight",
                template === "editorial" ? "text-3xl" : "text-2xl lg:text-3xl",
              )}
              style={template === "editorial" ? { fontFamily: "Georgia, serif" } : undefined}>
                {item.name}
              </h1>

              {/* Price block */}
              <div className="mt-5 p-4 rounded-xl" style={{ background: `${accent}0a` }}>
                <div className="flex items-baseline gap-3 flex-wrap">
                  <span className="text-3xl lg:text-4xl font-black" style={{ color: accent }}>{fmt(item.price_cents)}</span>
                  {original && (
                    <>
                      <span className="text-base text-muted-foreground line-through">{fmt(original)}</span>
                      <Badge className="bg-rose-500 hover:bg-rose-500 text-white">Save {discount}%</Badge>
                    </>
                  )}
                </div>
                {!soldOut && item.stock !== null && item.stock < 10 && (
                  <p className="text-xs text-rose-500 font-medium mt-2">{item.stock} units currently in stock.</p>
                )}
              </div>

              {/* Description */}
              {item.description && (
                <div className="mt-5">
                  <h3 className="text-sm font-semibold mb-2">Description</h3>
                  <p className="text-sm text-foreground/75 leading-relaxed whitespace-pre-line">{item.description}</p>
                </div>
              )}

              {/* Quantity */}
              <div className="mt-6 flex items-center gap-4">
                <span className="text-sm font-medium">Quantity</span>
                <div className="flex items-center border border-border rounded-full overflow-hidden">
                  <button onClick={() => setQty(Math.max(1, qty - 1))} disabled={qty <= 1} className="w-9 h-9 grid place-items-center hover:bg-muted disabled:opacity-40">
                    <Minus size={14} />
                  </button>
                  <span className="w-10 text-center text-sm font-semibold">{qty}</span>
                  <button onClick={() => setQty(Math.min(maxQty, qty + 1))} disabled={qty >= maxQty} className="w-9 h-9 grid place-items-center hover:bg-muted disabled:opacity-40">
                    <Plus size={14} />
                  </button>
                </div>
                {item.stock !== null && <span className="text-xs text-muted-foreground">{item.stock} available</span>}
              </div>

              {/* Actions */}
              <div className="mt-6 grid grid-cols-1 sm:grid-cols-2 gap-2">
                <Button onClick={handleAdd} disabled={soldOut} size="lg" variant="outline" className="rounded-full font-semibold border-2" style={{ borderColor: accent, color: accent }}>
                  {added ? <><Check size={18} className="mr-1" /> Added</> : <><ShoppingCart size={18} className="mr-1" /> Add to cart</>}
                </Button>
                <Button onClick={handleBuyNow} disabled={soldOut} size="lg" className="rounded-full font-semibold text-white" style={{ background: accent }}>
                  {soldOut ? "Sold out" : "Buy now - cash on delivery"}
                </Button>
              </div>

              <div className="mt-3 flex items-center gap-2">
                <Button onClick={() => wishlist.toggle(item.id)} variant="ghost" size="sm" className="rounded-full">
                  <Heart size={16} className={cn("mr-1.5", wished && "text-rose-500")} fill={wished ? "currentColor" : "none"} />
                  {wished ? "Saved" : "Save for later"}
                </Button>
                <Button
                  variant="ghost" size="sm" className="rounded-full"
                  onClick={() => {
                    navigator.clipboard.writeText(window.location.href);
                    toast({ title: "Link copied" });
                  }}
                >
                  <Share2 size={16} className="mr-1.5" /> Share
                </Button>
              </div>

            </div>
          </div>
        </div>
      </section>

      {/* Related */}
      {related.length > 0 && (
        <section className="container pb-16">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg lg:text-xl font-bold">You may also like</h2>
            <Button asChild variant="ghost" size="sm" style={{ color: accent }}>
              <Link to={storePath("products")}>View all <ChevronRight size={14} /></Link>
            </Button>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3 lg:gap-4">
            {related.slice(0, 5).map((r) => (
              <ProductCard
                key={r.id}
                it={r}
                slug={slug!}
                template={template}
                accent={accent}
                onAdd={(rid) => { cart.add(rid, 1); toast({ title: "Added to cart" }); }}
                onWish={(rid) => wishlist.toggle(rid)}
                wished={wishlist.has(r.id)}
                customDomain={customDomain}
              />
            ))}
          </div>
        </section>
      )}

      {/* Back link */}
      <div className="container pb-12">
        <Button asChild variant="ghost"><Link to={storePath("products")}><ChevronLeft size={16} className="mr-1" /> Back to products</Link></Button>
      </div>

      <footer data-storefront-chrome="footer" className="bg-background border-t border-border">
        <div className="container py-4 flex items-center justify-between text-xs text-muted-foreground">
          <span>(c) {new Date().getFullYear()} {store.business_name}</span>
          <div className="flex items-center gap-1.5">Powered by <Logo size="sm" /></div>
        </div>
      </footer>
      <StorefrontCartDrawer
        open={cartOpen}
        onOpenChange={setCartOpen}
        storeId={store.id}
        storeName={store.business_name || "Store"}
        accent={accent}
        products={[item, ...related] as StorefrontProduct[]}
        loadProduct={loadCartProduct}
        cart={cart}
      />
    </div>
  );
};

export default ProductDetail;
