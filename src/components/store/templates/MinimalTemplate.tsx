// ============================================================================
// Minimal (Modulive-style) storefront template — lead code for the "minimal" design.
// Self-contained sections. Fully theme-driven; edits/overlays still work because
// each visible piece exposes a stable data-style / data-edit id.
//
// Sections exported:
//   - MinimalHero              (centered pill-image headline + split banner + side cards)
//   - MinimalStats             (three-column KPI strip)
//   - MinimalProductsHeader    (centered title + pill category filter)
//   - MinimalWhyChooseUs       (image left + accordion right)
//   - MinimalCTA               (dark full-bleed image with headline + pill button)
//   - MinimalNewsletter        (centered subscribe form)
//   - MinimalFooter            (dark footer with centered brand mark)
// ============================================================================
import { useState } from "react";
import { ArrowUpRight, Play, Plus, Minus, Send } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

export type MinimalStore = {
  id: string;
  business_name: string;
  store_tagline?: string | null;
  store_about?: string | null;
  store_banner_url?: string | null;
};

type Item = { id: string; name: string; price_cents: number; image_url?: string | null };

const fmtMoney = (c: number) => "$" + (c / 100).toFixed(2);

// ---------------------------------------------------------------------------
// HERO
// ---------------------------------------------------------------------------
export const MinimalHero = ({
  store,
  accent,
  banner,
  sideItems,
  heroCta,
  heroBadge,
  slug,
  onShop,
  Link,
}: {
  store: MinimalStore;
  accent: string;
  banner?: string;
  sideItems: Item[]; // up to 2 shown in side cards
  heroCta: string;
  heroBadge: string;
  slug: string;
  onShop: () => void;
  Link: any;
}) => {
  const [i1, i2] = sideItems;
  return (
    <section data-section="hero" className="container pt-6 lg:pt-10 pb-4">
      {/* Headline with inline pill images */}
      <h1
        data-edit="minimalHeroHeadline"
        data-style="minimal-hero-headline"
        className="text-center font-semibold leading-[1.05] tracking-tight text-[38px] md:text-[56px] lg:text-[68px] max-w-[1000px] mx-auto"
        style={{ color: "inherit" }}
      >
        Transform{" "}
        <span
          className="inline-block align-middle mx-1 md:mx-2 overflow-hidden bg-muted"
          style={{ width: "0.95em", height: "0.65em", borderRadius: 999 }}
        >
          {banner && (
            <img src={banner} alt="" className="w-full h-full object-cover" />
          )}
        </span>{" "}
        Space with{" "}
        <span
          className="inline-block align-middle mx-1 md:mx-2 overflow-hidden bg-muted"
          style={{ width: "1.6em", height: "0.65em", borderRadius: 999 }}
        >
          {i1?.image_url && (
            <img src={i1.image_url} alt="" className="w-full h-full object-cover" />
          )}
        </span>{" "}
        Sustainable Furniture
      </h1>

      {/* Split banner: main + 2 side cards */}
      <div className="grid lg:grid-cols-[1fr_260px] gap-4 mt-8">
        <div
          data-style="hero-banner"
          data-style-label="Hero banner"
          className="relative overflow-hidden bg-muted"
          style={{ borderRadius: 28, aspectRatio: "16/10" }}
        >
          {banner ? (
            <img src={banner} alt={store.business_name} className="absolute inset-0 w-full h-full object-cover" />
          ) : (
            <div className="absolute inset-0" style={{ background: `linear-gradient(135deg, ${accent}22, ${accent}05)` }} />
          )}

          {heroBadge.trim() ? (
            <div className="absolute top-4 left-4 flex items-center bg-background/95 px-3 py-2 rounded-full shadow-sm backdrop-blur">
            <span className="text-[11px] font-medium leading-tight" data-edit="heroBadge">
              {heroBadge}
            </span>
            </div>
          ) : null}

          {/* Shop Now pill (bottom-right, ink black) */}
          <button
            onClick={onShop}
            data-style="minimal-hero-cta"
            className="absolute bottom-4 right-4 flex items-center gap-2 pl-5 pr-2 py-2 rounded-full text-sm font-medium text-white shadow-lg"
            style={{ background: accent }}
          >
            <span data-edit="heroCta">{heroCta}</span>
            <span
              className="w-8 h-8 rounded-full grid place-items-center bg-background"
              style={{ color: accent }}
            >
              <ArrowUpRight size={16} />
            </span>
          </button>
        </div>

        {/* Side product cards */}
        <div className="grid grid-cols-2 lg:grid-cols-1 gap-4">
          {[i1, i2].map((it, idx) =>
            it ? (
              <Link
                key={it.id}
                to={`/store/${slug}/product/${it.id}`}
                data-style={`minimal-side-product-${it.id}-card`}
                data-style-label={`${it.name} side product card`}
                className="group block bg-background overflow-hidden border border-border/60"
                style={{ borderRadius: 24 }}
              >
                <div data-style={`minimal-side-product-${it.id}-media`} data-style-label={`${it.name} side product media`} className="aspect-square bg-muted overflow-hidden">
                  {it.image_url && (
                    <img
                      data-style={`minimal-side-product-${it.id}-image`}
                      data-style-label={`${it.name} side product image`}
                      src={it.image_url}
                      alt={it.name}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                    />
                  )}
                </div>
                <div className="px-4 py-3 flex items-center justify-between">
                  <span data-style={`minimal-side-product-${it.id}-title`} data-style-label={`${it.name} side product title`} className="text-sm font-medium truncate">{it.name}</span>
                  <span data-style={`minimal-side-product-${it.id}-price`} data-style-label={`${it.name} side product price`} className="text-sm font-semibold tabular-nums" style={{ color: accent }}>
                    {fmtMoney(it.price_cents)}
                  </span>
                </div>
              </Link>
            ) : (
              <div
                key={idx}
                data-style={`minimal-side-product-empty-${idx}`}
                data-style-label={`Empty side product ${idx + 1}`}
                className="bg-muted/60 border border-dashed border-border/60"
                style={{ borderRadius: 24, aspectRatio: "1/1.15" }}
              />
            )
          )}
        </div>
      </div>
    </section>
  );
};

// ---------------------------------------------------------------------------
// STATS
// ---------------------------------------------------------------------------
export const MinimalStats = ({
  stats,
}: {
  stats?: { value: string; label: string }[];
}) => {
  const items = (stats ?? []).filter((item) => item.value.trim() && item.label.trim());
  if (!items.length) return null;
  return (
    <section data-section="minimalStats" className="container py-10 lg:py-14">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-8 lg:gap-4 text-center">
        {items.map((s, i) => (
          <div key={i} data-style={`minimal-stat-${i}`}>
            <div
              data-edit={`stat${i + 1}Value`}
              className="font-semibold tracking-tight leading-none text-[56px] md:text-[64px]"
            >
              {s.value}
            </div>
            <p
              data-edit={`stat${i + 1}Label`}
              className="mt-3 text-xs md:text-sm text-muted-foreground max-w-[220px] mx-auto leading-snug"
            >
              {s.label}
            </p>
          </div>
        ))}
      </div>
    </section>
  );
};

// ---------------------------------------------------------------------------
// PRODUCTS HEADER (centered title + pill category filter)
// ---------------------------------------------------------------------------
export const MinimalProductsHeader = ({
  title,
  categories,
  active,
  onSelect,
  accent,
}: {
  title: string;
  categories: string[];
  active: string;
  onSelect: (c: string) => void;
  accent: string;
}) => (
  <div className="text-center mb-8">
    <h2
      data-edit="allProductsTitle"
      data-style="minimal-products-title"
      data-style-label="Products section title"
      className="text-3xl md:text-4xl lg:text-[44px] font-semibold tracking-tight"
    >
      {title}
    </h2>
    {categories.length > 1 && (
      <div className="mt-6 flex flex-wrap justify-center gap-2">
        {categories.map((c, index) => {
          const isActive = c === active;
          return (
            <button
              key={c}
              data-style={`minimal-category-${index}`}
              data-style-label={`${c} category filter`}
              onClick={() => onSelect(c)}
              className="px-5 py-2 rounded-full text-sm font-medium border transition-colors"
              style={
                isActive
                  ? { background: accent, color: "#fff", borderColor: accent }
                  : { background: "transparent", color: "inherit", borderColor: "rgba(0,0,0,.15)" }
              }
            >
              {c}
            </button>
          );
        })}
      </div>
    )}
  </div>
);

// ---------------------------------------------------------------------------
// WHY CHOOSE US
// ---------------------------------------------------------------------------
export const MinimalWhyChooseUs = ({
  title,
  intro,
  image,
  items,
  accent,
}: {
  title: string;
  intro?: string;
  image?: string;
  items: { q: string; a: string }[];
  accent: string;
}) => {
  const [open, setOpen] = useState(1);
  return (
    <section data-section="about" className="container py-10 lg:py-16">
      <div className="grid lg:grid-cols-2 gap-8 lg:gap-14 items-start">
        <div>
          <div
            data-style="minimal-why-image"
            className="relative overflow-hidden bg-muted"
            style={{ borderRadius: 24, aspectRatio: "4/3" }}
          >
            {image && (
              <img src={image} alt="" className="w-full h-full object-cover" />
            )}
            <button
              data-style="minimal-why-play"
              data-style-label="Why section play button"
              className="absolute inset-0 m-auto w-12 h-12 rounded-full grid place-items-center text-white"
              style={{ background: accent }}
              aria-label="Play video"
            >
              <Play size={18} className="ml-0.5" fill="currentColor" />
            </button>
          </div>
          <p data-edit="whyVideoCaption" className="mt-3 text-sm text-muted-foreground">
            Watch the video and learn more about our story
          </p>
        </div>

        <div>
          <h2
            data-edit="aboutTitle"
            className="text-3xl md:text-4xl lg:text-[44px] font-semibold tracking-tight"
          >
            {title}
          </h2>
          {intro && (
            <p data-edit="whyIntro" className="mt-3 text-sm text-muted-foreground max-w-md">
              {intro}
            </p>
          )}
          <div className="mt-6 divide-y divide-border/70 border-y border-border/70">
            {items.map((it, i) => {
              const isOpen = open === i;
              return (
                <div key={i} data-style={`minimal-why-item-${i}`} data-style-label={`Why item ${i + 1}`}>
                  <button
                    data-style={`minimal-why-question-${i}`}
                    data-style-label={`Why question ${i + 1}`}
                    onClick={() => setOpen(isOpen ? -1 : i)}
                    className="w-full flex items-center justify-between py-4 text-left"
                  >
                    <span className="text-base md:text-lg font-medium">{it.q}</span>
                    {isOpen ? (
                      <Minus size={18} className="opacity-70" />
                    ) : (
                      <Plus size={18} className="opacity-70" />
                    )}
                  </button>
                  {isOpen && (
                    <p data-style={`minimal-why-answer-${i}`} data-style-label={`Why answer ${i + 1}`} className="pb-5 text-sm text-muted-foreground max-w-lg leading-relaxed">
                      {it.a}
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
};

// ---------------------------------------------------------------------------
// FULL-BLEED CTA
// ---------------------------------------------------------------------------
export const MinimalCTA = ({
  title,
  cta,
  image,
  accent,
  onClick,
}: {
  title: string;
  cta: string;
  image?: string;
  accent: string;
  onClick?: () => void;
}) => (
  <section data-section="minimalCta" className="container py-10">
    <div
      data-style="minimal-cta"
      className="relative overflow-hidden bg-muted"
      style={{ borderRadius: 28, aspectRatio: "16/7", minHeight: 320 }}
    >
      {image ? (
        <img src={image} alt="" className="absolute inset-0 w-full h-full object-cover" />
      ) : (
        <div className="absolute inset-0" style={{ background: `linear-gradient(135deg, ${accent}66, ${accent}22)` }} />
      )}
      <div className="absolute inset-0 bg-gradient-to-r from-black/25 via-transparent to-transparent" />

      <div className="relative h-full flex flex-col justify-between p-6 md:p-10 lg:p-14">
        <button
          data-style="minimal-cta-top-button"
          data-style-label="CTA top button"
          onClick={onClick}
          className="self-end flex items-center gap-2 pl-4 pr-2 py-2 rounded-full text-xs md:text-sm font-medium text-white"
          style={{ background: accent }}
        >
          <span data-edit="ctaButton">Book an appointment</span>
          <span className="w-7 h-7 rounded-full grid place-items-center bg-background" style={{ color: accent }}>
            <ArrowUpRight size={14} />
          </span>
        </button>

        <div className="mt-auto text-white max-w-xl">
          <h3
            data-edit="ctaTitle"
            data-style="minimal-cta-title"
            data-style-label="CTA title"
            className="font-semibold leading-[1.05] tracking-tight text-3xl md:text-4xl lg:text-5xl"
            style={{ textShadow: "0 2px 20px rgba(0,0,0,.35)" }}
          >
            {title}
          </h3>
          <button
            data-style="minimal-cta-secondary-button"
            data-style-label="CTA secondary button"
            onClick={onClick}
            className="mt-6 inline-flex items-center gap-2 px-5 py-2 rounded-full text-xs font-medium bg-white text-foreground"
          >
            <span data-edit="ctaSecondary">{cta}</span>
          </button>
        </div>
      </div>
    </div>
  </section>
);

// ---------------------------------------------------------------------------
// NEWSLETTER
// ---------------------------------------------------------------------------
export const MinimalNewsletter = ({
  title,
  cta,
  accent,
}: {
  title: string;
  cta: string;
  accent: string;
}) => (
  <section data-section="newsletter" className="container py-14 lg:py-20 text-center">
    <h2
      data-edit="newsletterTitle"
      data-style="minimal-newsletter-title"
      data-style-label="Newsletter title"
      className="text-3xl md:text-4xl lg:text-[44px] font-semibold tracking-tight max-w-2xl mx-auto leading-tight"
    >
      {title}
    </h2>
    <div className="mt-8 max-w-xl mx-auto flex items-center gap-3">
      <div
        data-style="minimal-newsletter-icon"
        data-style-label="Newsletter icon"
        className="w-11 h-11 rounded-full grid place-items-center shrink-0"
        style={{ background: `${accent}18`, color: accent }}
      >
        <Send size={18} />
      </div>
      <div
        data-style="minimal-newsletter-form"
        data-style-label="Newsletter form"
        className="flex-1 flex items-center bg-background border border-border rounded-full pl-4 pr-1 py-1"
      >
        <Input
          data-style="minimal-newsletter-input"
          data-style-label="Newsletter email input"
          type="email"
          placeholder="Your Email..."
          className="border-0 shadow-none focus-visible:ring-0 h-10 bg-transparent px-0"
        />
        <Button
          data-style="minimal-newsletter-button"
          data-style-label="Newsletter button"
          className="rounded-full h-10 px-6 text-white text-sm font-medium"
          style={{ background: accent }}
        >
          <span data-edit="newsletterCta">{cta}</span>
        </Button>
      </div>
    </div>
  </section>
);

// ---------------------------------------------------------------------------
// FOOTER
// ---------------------------------------------------------------------------
export const MinimalFooter = ({
  store,
  accent,
  slug,
  footerNote,
}: {
  store: MinimalStore;
  accent: string;
  slug: string;
  footerNote: string;
}) => (
  <footer data-section="footer" className="mt-6">
    <div
      data-style="minimal-footer-panel"
      data-style-label="Footer panel"
      className="container"
      style={{ background: "#0F0F0F", color: "#fff", borderRadius: 28 }}
    >
      <div className="grid grid-cols-2 md:grid-cols-5 gap-8 px-6 md:px-10 py-10">
        <div data-style="minimal-footer-service" data-style-label="Footer service column">
          <div data-style="minimal-footer-service-title" data-style-label="Footer service title" className="text-sm font-semibold mb-4">Service</div>
          <ul className="space-y-2 text-sm opacity-70">
            <li data-style="minimal-footer-service-1" data-style-label="Footer service link 1">Legal Notice</li>
            <li data-style="minimal-footer-service-2" data-style-label="Footer service link 2">Data Protection</li>
          </ul>
        </div>
        <div data-style="minimal-footer-newsletter" data-style-label="Footer newsletter column">
          <div data-style="minimal-footer-newsletter-title" data-style-label="Footer newsletter title" className="text-sm font-semibold mb-4">Newsletter</div>
          <ul className="space-y-2 text-sm opacity-70">
            <li data-style="minimal-footer-newsletter-1" data-style-label="Footer newsletter link 1">Enter Email Address</li>
            <li data-style="minimal-footer-newsletter-2" data-style-label="Footer newsletter link 2">Sign Up</li>
          </ul>
        </div>
        <div className="col-span-2 md:col-span-1 flex flex-col items-center justify-center order-first md:order-none">
          <div
            data-style="minimal-footer-logo"
            data-style-label="Footer logo"
            className="w-11 h-11 rounded-full grid place-items-center font-black text-lg mb-2"
            style={{ background: accent, color: "#0F0F0F" }}
          >
            {store.business_name?.charAt(0)?.toUpperCase() ?? "S"}
          </div>
          <div data-style="minimal-footer-brand" data-style-label="Footer brand name" className="font-semibold tracking-tight text-lg">{store.business_name}</div>
        </div>
        <div data-style="minimal-footer-connect" data-style-label="Footer connect column">
          <div data-style="minimal-footer-connect-title" data-style-label="Footer connect title" className="text-sm font-semibold mb-4">Connect</div>
          <ul className="space-y-2 text-sm opacity-70">
            <li data-style="minimal-footer-connect-1" data-style-label="Footer Instagram link">Instagram</li>
            <li data-style="minimal-footer-connect-2" data-style-label="Footer Facebook link">Facebook</li>
          </ul>
        </div>
        <div data-style="minimal-footer-contact" data-style-label="Footer contact column">
          <div data-style="minimal-footer-contact-title" data-style-label="Footer contact title" className="text-sm font-semibold mb-4">Contact</div>
          <ul className="space-y-2 text-sm opacity-70">
            <li data-style="minimal-footer-address-1" data-style-label="Footer address line 1">12 B Street, Eastern</li>
            <li data-style="minimal-footer-address-2" data-style-label="Footer address line 2">Alberta</li>
            <li data-style="minimal-footer-email" data-style-label="Footer email" className="underline">hello@{slug}.shop</li>
          </ul>
        </div>
      </div>
      <div data-style="minimal-footer-bottom" data-style-label="Footer bottom bar" className="border-t border-white/10 px-6 md:px-10 py-4 flex flex-col md:flex-row items-center justify-between gap-2 text-xs opacity-70">
        <span>© {new Date().getFullYear()} {store.business_name}. <span data-edit="footerNote">{footerNote}</span></span>
        <div className="flex gap-5">
          <span data-style="minimal-footer-terms" data-style-label="Footer terms link">Terms of Service</span>
          <span data-style="minimal-footer-privacy" data-style-label="Footer privacy link">Privacy Policy</span>
        </div>
      </div>
    </div>
  </footer>
);
