import { Link } from "react-router-dom";
import { Card } from "@/components/ui/card";
import { ArrowRight, Heart, ShoppingBag, Truck, Sparkles, Flame, Clock } from "lucide-react";
import type { StoreTemplate } from "./templates";
import { fmt, coverImage } from "./storeUtils";
import { cn } from "@/lib/utils";
import { Countdown } from "./Countdown";

type Props = {
  it: any;
  slug: string;
  template: StoreTemplate;
  accent: string;
  onAdd: (id: string) => void;
  onWish: (id: string) => void;
  wished: boolean;
  editorId?: string;
  customDomain?: boolean;
};

/** Compact reusable bits shared across templates */

const SaleTag = ({ text }: { text: string }) => (
  <span className="inline-flex items-center bg-orange-500 text-white text-[10px] font-black px-1.5 py-0.5 rounded-sm leading-none mr-1.5 align-middle">
    {text}
  </span>
);

const BadgeChip = ({ kind, accent }: { kind: "Deal" | "Hot"; accent: string }) => {
  if (kind === "Hot") {
    return (
      <span className="inline-flex items-center gap-0.5 text-white text-[9px] font-bold uppercase px-1.5 py-0.5 rounded-sm shadow"
        style={{ background: "linear-gradient(135deg,#ff7a00,#ff3d00)" }}>
        <Sparkles size={9} /> Hot
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-0.5 text-white text-[9px] font-bold uppercase px-1.5 py-0.5 rounded-sm shadow"
      style={{ background: accent }}>
      <Flame size={9} /> Deal
    </span>
  );
};

const FreeDelivery = () => (
  <span className="inline-flex items-center gap-1 border border-emerald-500/40 text-emerald-600 dark:text-emerald-400 text-[9px] font-semibold px-1.5 py-0.5 rounded">
    <Truck size={9} /> Free Delivery
  </span>
);

export const ProductCard = ({ it, slug, template, accent, onAdd, onWish, wished, editorId, customDomain = false }: Props) => {
  const cover = coverImage(it);
  const hasOriginal = typeof it.original_price_cents === "number" && it.original_price_cents > it.price_cents;
  const original = hasOriginal ? it.original_price_cents : null;
  const discount = hasOriginal
    ? Math.round(((it.original_price_cents - it.price_cents) / it.original_price_cents) * 100)
    : 0;
  const productPath = typeof it.handle === "string" && it.handle.trim()
    ? `products/${encodeURIComponent(it.handle.trim())}`
    : `product/${it.id}`;
  const href = customDomain ? `/${productPath}` : `/store/${slug}/${productPath}`;
  const soldOut = it.stock !== null && it.stock <= 0;
  const badge: "Deal" | "Hot" | null = it.badge === "Deal" || it.badge === "Hot" ? it.badge : null;
  const freeDelivery = !!it.free_delivery;
  const saleTag: string | null = typeof it.sale_tag === "string" && it.sale_tag.trim() ? it.sale_tag.trim() : null;
  const saleEndsAt: string | null = typeof it.sale_ends_at === "string" ? it.sale_ends_at : null;
  const hasActiveCountdown = saleEndsAt && new Date(saleEndsAt).getTime() > Date.now();
  const baseStyleId = editorId ?? `product-${template}-${it.id}`;
  const styleId = (part: string) => `${baseStyleId}-${part}`;
  const styleLabel = (part: string) => `${it.name} ${part}`;

  // Compact timer chip rendered ON the image (top-right corner)
  const TimerChip = () => hasActiveCountdown ? (
    <div
      data-style={styleId("timer")}
      data-style-label={styleLabel("timer")}
      className="absolute top-1 right-1 flex items-center gap-1 bg-black/75 backdrop-blur text-white rounded px-1.5 py-0.5 shadow-md z-10"
    >
      <Clock size={9} />
      <Countdown endsAt={saleEndsAt} compact className="text-[9px] font-bold tracking-tight" />
    </div>
  ) : null;

  if (template === "noir-chrono") {
    return (
      <article data-noir-product-card className="group overflow-hidden rounded-lg">
        <Link to={href} className="relative block aspect-[4/5] overflow-hidden bg-[#202020]" aria-label={`View ${it.name}`}>
          {cover ? (
            <img src={cover} alt={it.name} loading="lazy" className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.035]" />
          ) : (
            <div className="grid h-full w-full place-items-center text-5xl font-semibold text-white/20" style={{ background: `linear-gradient(145deg,#111,${accent}55)` }}>
              {it.name.charAt(0).toUpperCase()}
            </div>
          )}
          <div className="absolute left-3 top-3 flex items-center gap-1.5">
            {badge ? <BadgeChip kind={badge} accent={accent} /> : null}
            {discount > 0 ? <span className="rounded-full bg-white/90 px-2 py-1 text-[10px] font-semibold text-black">-{discount}%</span> : null}
          </div>
          <button
            type="button"
            aria-label={wished ? "Remove from wishlist" : "Add to wishlist"}
            onClick={(event) => { event.preventDefault(); event.stopPropagation(); onWish(it.id); }}
            className="absolute right-3 top-3 grid h-9 w-9 place-items-center rounded-full border border-white/20 bg-black/45 text-white backdrop-blur hover:bg-black/70"
          >
            <Heart size={15} fill={wished ? "currentColor" : "none"} />
          </button>
        </Link>
        <div className="p-3.5">
          {it.category ? <div className="text-[10px] uppercase text-white/55">{it.category}</div> : null}
          <Link to={href} className="mt-1 flex items-start justify-between gap-3">
            <h3 className="line-clamp-2 text-sm font-medium leading-5">{it.name}</h3>
            <ArrowRight size={15} className="mt-0.5 shrink-0 text-white/60" />
          </Link>
          <div className="mt-3 flex items-center justify-between gap-2">
            <div className="min-w-0">
              <div className="text-sm font-semibold" style={{ color: accent }}>{fmt(it.price_cents)}</div>
              {original ? <div className="text-[10px] text-white/45 line-through">{fmt(original)}</div> : null}
            </div>
            <button
              type="button"
              disabled={soldOut}
              onClick={() => onAdd(it.id)}
              className="flex h-9 shrink-0 items-center gap-1.5 rounded-full px-3 text-[11px] font-semibold text-[#111] transition-[filter] hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-45"
              style={{ background: accent }}
            >
              <ShoppingBag size={13} /> {soldOut ? "Sold out" : "Add"}
            </button>
          </div>
        </div>
      </article>
    );
  }

  const WishBtn = ({ size = 26, iconSize = 12, className = "" }: { size?: number; iconSize?: number; className?: string }) => (
    <button
      data-style={styleId("wishlist")}
      data-style-label={styleLabel("wishlist button")}
      onClick={(e) => { e.preventDefault(); e.stopPropagation(); onWish(it.id); }}
      aria-label={wished ? "Remove from wishlist" : "Add to wishlist"}
      style={{ width: size, height: size }}
      className={cn(
        "rounded-full grid place-items-center transition-all backdrop-blur",
        wished ? "bg-background text-rose-500" : "bg-background/85 text-foreground hover:bg-background",
        className,
      )}
    >
      <Heart size={iconSize} fill={wished ? "currentColor" : "none"} />
    </button>
  );

  /* ============== Image area shared between marketplace/minimal/bold ============== */
  const ImageArea = ({ aspect = "square", radius = "rounded-md" }: { aspect?: string; radius?: string }) => (
    <Link
      to={href}
      data-style={styleId("media-frame")}
      data-style-label={styleLabel("media frame")}
      className={cn("block overflow-hidden relative bg-muted", radius)}
      style={{ aspectRatio: aspect === "square" ? "1 / 1" : aspect }}
    >
      {cover ? (
        <img
          data-style={styleId("image")}
          data-style-label={styleLabel("image")}
          src={cover}
          alt={it.name}
          loading="lazy"
          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
        />
      ) : (
        <div
          data-style={styleId("image")}
          data-style-label={styleLabel("image placeholder")}
          className="w-full h-full grid place-items-center text-3xl font-bold text-foreground/15"
          style={{ background: `linear-gradient(135deg, ${accent}22, ${accent}11)` }}>
          {it.name.charAt(0).toUpperCase()}
        </div>
      )}
      {/* Top-left stack: merchant badge + persisted compare-at discount. */}
      <div className="absolute top-1 left-1 flex flex-col items-start gap-1">
        {badge && <BadgeChip kind={badge} accent={accent} />}
        {discount > 0 && !badge && (
          <span data-style={styleId("discount")} data-style-label={styleLabel("discount")} className="bg-orange-500 text-white text-[9px] font-bold px-1.5 py-0.5 rounded-sm">-{discount}%</span>
        )}
      </div>
      {soldOut && (
        <div data-style={styleId("sold-out")} data-style-label={styleLabel("sold out overlay")} className="absolute inset-0 bg-background/70 grid place-items-center">
          <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Sold out</span>
        </div>
      )}
      <TimerChip />
      <WishBtn className={cn("absolute right-1 shadow", hasActiveCountdown ? "top-7" : "top-1")} />
    </Link>
  );

  // ============== BOLD ==============
  if (template === "bold") {
    return (
      <Card data-style={styleId("card")} data-style-label={styleLabel("card")} className="overflow-hidden group rounded-xl border border-border hover:border-foreground hover:shadow-lg transition-all bg-background">
        <ImageArea radius="rounded-t-xl rounded-b-none" />
        <div className="p-2">
          {it.category && <div data-style={styleId("category")} data-style-label={styleLabel("category")} className="text-[9px] uppercase tracking-wider text-muted-foreground truncate">{it.category}</div>}
          <Link to={href}>
            <h3 data-style={styleId("title")} data-style-label={styleLabel("title")} className="text-xs font-semibold leading-snug line-clamp-2 min-h-[2rem] mt-0.5">
              {saleTag && <SaleTag text={saleTag} />}{it.name}
            </h3>
          </Link>
          {freeDelivery && <div className="mt-1"><FreeDelivery /></div>}
          <div className="flex items-baseline gap-1.5 mt-1">
            <span data-style={styleId("price")} data-style-label={styleLabel("price")} className="text-sm font-black" style={{ color: accent }}>{fmt(it.price_cents)}</span>
            {original && <span data-style={styleId("original-price")} data-style-label={styleLabel("original price")} className="text-[10px] text-muted-foreground line-through">{fmt(original)}</span>}
          </div>
        </div>
      </Card>
    );
  }

  // ============== EDITORIAL ==============
  if (template === "editorial") {
    return (
      <div data-style={styleId("card")} data-style-label={styleLabel("card")} className="group">
        <Link to={href} data-style={styleId("media-frame")} data-style-label={styleLabel("media frame")} className="block aspect-[4/5] overflow-hidden rounded-lg bg-muted relative">
          {cover ? (
            <img data-style={styleId("image")} data-style-label={styleLabel("image")} src={cover} alt={it.name} loading="lazy" className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700" />
          ) : (
            <div data-style={styleId("image")} data-style-label={styleLabel("image placeholder")} className="w-full h-full grid place-items-center text-4xl text-foreground/20" style={{ fontFamily: "Georgia, serif", fontStyle: "italic" }}>{it.name.charAt(0)}</div>
          )}
          <div className="absolute top-2 left-2 flex flex-col gap-1">
            {badge && <BadgeChip kind={badge} accent={accent} />}
            {discount > 0 && !badge && <span data-style={styleId("discount")} data-style-label={styleLabel("discount")} className="bg-background text-foreground text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded">-{discount}%</span>}
          </div>
          <TimerChip />
          <WishBtn className={cn("absolute right-2 shadow", hasActiveCountdown ? "top-9" : "top-2")} />
        </Link>
        <div className="mt-2">
          {it.category && <div data-style={styleId("category")} data-style-label={styleLabel("category")} className="text-[9px] uppercase tracking-[0.2em] text-muted-foreground mb-0.5">{it.category}</div>}
          <Link to={href}>
            <h3 data-style={styleId("title")} data-style-label={styleLabel("title")} className="font-medium text-xs leading-snug line-clamp-2" style={{ fontFamily: "Georgia, serif" }}>
              {saleTag && <SaleTag text={saleTag} />}{it.name}
            </h3>
          </Link>
          <div className="flex items-baseline gap-1.5 mt-0.5">
            <span data-style={styleId("price")} data-style-label={styleLabel("price")} className="text-xs font-semibold">{fmt(it.price_cents)}</span>
            {original && <span data-style={styleId("original-price")} data-style-label={styleLabel("original price")} className="text-[10px] text-muted-foreground line-through">{fmt(original)}</span>}
          </div>
          {freeDelivery && <div className="mt-1"><FreeDelivery /></div>}
        </div>
      </div>
    );
  }

  // ============== LOOKBOOK ==============
  if (template === "lookbook") {
    return (
      <div data-style={styleId("card")} data-style-label={styleLabel("card")} className="group relative">
        <Link to={href} data-style={styleId("media-frame")} data-style-label={styleLabel("media frame")} className="block aspect-[3/4] overflow-hidden rounded-md bg-muted relative">
          {cover ? (
            <img data-style={styleId("image")} data-style-label={styleLabel("image")} src={cover} alt={it.name} loading="lazy" className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700" />
          ) : (
            <div data-style={styleId("image")} data-style-label={styleLabel("image placeholder")} className="w-full h-full grid place-items-center text-4xl font-light text-foreground/15">{it.name.charAt(0)}</div>
          )}
          <div className="absolute top-1.5 left-1.5 flex flex-col gap-1">
            {badge && <BadgeChip kind={badge} accent={accent} />}
            {discount > 0 && !badge && <span data-style={styleId("discount")} data-style-label={styleLabel("discount")} className="bg-background text-foreground text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-sm">-{discount}%</span>}
          </div>
          <TimerChip />
          <WishBtn className={cn("absolute right-1.5", hasActiveCountdown ? "top-8" : "top-1.5")} />
        </Link>
        <div className="mt-1.5 text-center">
          <Link to={href}>
            <h3 data-style={styleId("title")} data-style-label={styleLabel("title")} className="text-[11px] font-medium uppercase tracking-wide line-clamp-1">
              {saleTag && <SaleTag text={saleTag} />}{it.name}
            </h3>
          </Link>
          <div className="text-[11px] mt-0.5">
            {original && <span data-style={styleId("original-price")} data-style-label={styleLabel("original price")} className="line-through mr-1.5 text-muted-foreground">{fmt(original)}</span>}
            <span data-style={styleId("price")} data-style-label={styleLabel("price")} className="font-semibold text-foreground">{fmt(it.price_cents)}</span>
          </div>
        </div>
      </div>
    );
  }

  // ============== MARKETPLACE (Daraz-style) - DEFAULT ==============
  // This is the spec layout the user asked us to clone faithfully.
  return (
    <Card data-style={styleId("card")} data-style-label={styleLabel("card")} className="overflow-hidden group rounded-md border border-border hover:shadow-md transition-all bg-background">
      <ImageArea radius="rounded-t-md rounded-b-none" />
      <div className="p-2">
        {it.category && <div data-style={styleId("category")} data-style-label={styleLabel("category")} className="text-[9px] uppercase tracking-wider text-muted-foreground truncate mb-0.5">{it.category}</div>}
        <Link to={href}>
          <h3 data-style={styleId("title")} data-style-label={styleLabel("title")} className="text-[12px] font-medium line-clamp-2 min-h-[2.1em] leading-snug hover:text-foreground">
            {saleTag && <SaleTag text={saleTag} />}{it.name}
          </h3>
        </Link>
        {freeDelivery && <div className="mt-1"><FreeDelivery /></div>}
        
        <div className="flex items-baseline gap-1.5 mt-1">
          <span data-style={styleId("price")} data-style-label={styleLabel("price")} className="text-[13px] font-bold" style={{ color: accent }}>{fmt(it.price_cents)}</span>
          {original && <span data-style={styleId("original-price")} data-style-label={styleLabel("original price")} className="text-[10px] text-muted-foreground line-through">{fmt(original)}</span>}
        </div>
      </div>
    </Card>
  );
};
