// Centralized theme system for storefronts. The visual editor writes to
// profiles.theme (jsonb); Store.tsx reads it and applies overrides.

export type SectionKey =
  | "topBar"
  | "search"
  | "categories"
  | "hero"
  | "trustStrip"
  | "about"
  | "flashDeals"
  | "specialSections"
  | "allProducts"
  | "newsletter"
  | "footer";

export type OverlayImage = {
  id: string;
  url: string;
  /** which section the overlay is anchored to */
  section: SectionKey;
  /** percent of section width/height (0..100) */
  x: number;
  y: number;
  /** percent of section width */
  w: number;
  rotate?: number;
  z?: number;
  /** visual styling */
  radius?: number; // px
  shadow?: "none" | "sm" | "md" | "lg" | "xl";
};

export type SpecialSectionItem = {
  id: string;
  title: string;
  subtitle?: string;
  /** small logo/icon shown in the section header */
  logoUrl?: string;
  accent?: string;
  /** product ids included in this section */
  productIds: string[];
  /** badges to apply to every product card in this section */
  badges?: { kind: "Hot" | "Deal" | "Custom"; label?: string }[];
  /** optional countdown end date for the whole section */
  endsAt?: string;
};

/** Per-element style overrides. Keyed by data-style id. */
export type ElementStyle = {
  bg?: string;
  bgImage?: string;
  gradient?: string;
  color?: string;
  borderColor?: string;
  borderWidth?: number;
  borderStyle?: "solid" | "dashed" | "dotted" | "double" | "none";
  radius?: number;
  padding?: number;
  margin?: number;
  gap?: number;
  shadow?: "none" | "sm" | "md" | "lg" | "xl";
  width?: string;       // any CSS width e.g. "100%", "320px"
  height?: string;      // any CSS height
  maxWidth?: string;
  minWidth?: string;
  minHeight?: string;
  align?: "left" | "center" | "right";
  fontSize?: number;    // px
  fontWeight?: number;
  fontFamily?: string;
  letterSpacing?: number;
  lineHeight?: number;
  textTransform?: "none" | "uppercase" | "lowercase" | "capitalize";
  display?: string;
  position?: "static" | "relative" | "absolute" | "fixed" | "sticky";
  top?: string;
  right?: string;
  bottom?: string;
  left?: string;
  zIndex?: number;
  opacity?: number;
  objectFit?: "contain" | "cover" | "fill" | "none" | "scale-down";
  backgroundSize?: string;
  backgroundPosition?: string;
  justifyContent?: string;
  alignItems?: string;
  flexDirection?: "row" | "column" | "row-reverse" | "column-reverse";
  order?: number;
  transform?: string;
  transition?: string;
  hoverBg?: string;
  hoverColor?: string;
  customCss?: Record<string, string | number>;
  hidden?: boolean;
};

export type ElementMedia = {
  src?: string;
  alt?: string;
  poster?: string;
  background?: string;
};

/** A free-form text overlay placed on the hero/banner area. */
export type TextOverlay = {
  id: string;
  text: string;
  /** anchor position as percent of the hero box (0-100) */
  x: number;
  y: number;
  color?: string;
  bg?: string;          // optional pill background (with alpha)
  fontSize?: number;    // px
  fontWeight?: number;
  letterSpacing?: number;
  shadow?: boolean;     // text shadow for legibility
  rotate?: number;
};

export type StoreTheme = {
  // Colors (hex)
  accent: string;
  bg: string;
  surface: string;
  text: string;
  buttonText: string;

  // Shape & spacing
  radius: number;
  density: "compact" | "cozy" | "roomy";
  font: "system" | "inter" | "poppins" | "playfair" | "georgia" | "mono";

  /** Compact storefront — scales the whole public store + product page to ~80% */
  compact?: boolean;

  // Section visibility
  sections: Record<SectionKey, boolean>;

  // Section render order (top -> bottom). topBar/search are part of header and stay fixed.
  section_order: SectionKey[];

  // Editable copy
  text_overrides: {
    heroBadge?: string;
    heroCta?: string;
    flashTitle?: string;
    flashSubtitle?: string;
    allProductsTitle?: string;
    aboutTitle?: string;
    newsletterTitle?: string;
    newsletterCopy?: string;
    newsletterCta?: string;
    searchCta?: string;
    footerNote?: string;
    trust1Title?: string;
    trust1Sub?: string;
    trust2Title?: string;
    trust2Sub?: string;
    trust3Title?: string;
    trust3Sub?: string;
    trust4Title?: string;
    trust4Sub?: string;
  };

  // Free-form image overlays placed on top of sections
  overlays: OverlayImage[];

  /** Per-element style overrides keyed by data-style id (Shopify-like inspector) */
  element_styles: Record<string, ElementStyle>;

  /** Responsive overrides layered on top of element_styles at their breakpoint. */
  element_styles_tablet?: Record<string, ElementStyle>;
  element_styles_mobile?: Record<string, ElementStyle>;

  /** Free-form text overrides keyed by data-style id. Any element becomes editable. */
  element_text?: Record<string, string>;

  /** Link overrides for any button/anchor element keyed by data-style id. */
  element_links?: Record<string, ElementLink>;

  /** Media overrides for any image/video/background element keyed by data-style id. */
  element_media?: Record<string, ElementMedia>;

  /** Free-form text overlays anchored to the hero/banner */
  text_overlays: TextOverlay[];

  /** Per-element lock: prevents editor selection & modification. */
  element_locks?: Record<string, boolean>;

  /** User-inserted blocks appended after a section (heading/text/image/button/spacer/divider/video/icon). */
  custom_blocks?: CustomBlock[];

  /** When false (default), business_name is NOT auto-printed on the hero banner.
   *  Users add their own text via text_overlays. */
  showStoreNameOnBanner: boolean;
};

/** Insertable block appended below a section in the storefront. */
export type CustomBlockKind =
  | "heading" | "text" | "image" | "button"
  | "spacer" | "divider" | "video" | "icon";

export type CustomBlock = {
  id: string;
  section: SectionKey;
  kind: CustomBlockKind;
  order: number;
  props: {
    text?: string;
    src?: string;
    href?: string;
    icon?: string;
    height?: number;
    alt?: string;
  };
};


export type LinkKind = "url" | "home" | "product" | "collection" | "cart" | "checkout" | "email" | "phone" | "anchor";
export type ElementLink = {
  kind: LinkKind;
  /** For url/anchor/email/phone/product/collection: raw value or id/slug. */
  value: string;
  target?: "_self" | "_blank";
};

export const DEFAULT_SECTION_ORDER: SectionKey[] = [
  "hero",
  "trustStrip",
  "about",
  "flashDeals",
  "specialSections",
  "allProducts",
  "newsletter",
  "footer",
];

export const DEFAULT_THEME: StoreTheme = {
  accent: "#5669ff",
  bg: "#F5F5F7",
  surface: "#FFFFFF",
  text: "#0F172A",
  buttonText: "#FFFFFF",
  radius: 12,
  density: "cozy",
  font: "system",
  compact: false,
  sections: {
    topBar: true,
    search: true,
    categories: true,
    hero: true,
    trustStrip: true,
    about: true,
    flashDeals: true,
    specialSections: true,
    allProducts: true,
    newsletter: true,
    footer: true,
  },
  section_order: DEFAULT_SECTION_ORDER,
  text_overrides: {
    heroBadge: "Welcome",
    heroCta: "Shop now",
    flashTitle: "Flash Deals",
    flashSubtitle: "Best picks for you",
    allProductsTitle: "All Products",
    aboutTitle: "About the store",
    newsletterTitle: "Stay updated",
    newsletterCopy: "Get exclusive offers in your inbox.",
    newsletterCta: "Join",
    searchCta: "Search",
    footerNote: "All rights reserved.",
    trust1Title: "Free Shipping",
    trust1Sub: "On orders over $50",
    trust2Title: "Easy Returns",
    trust2Sub: "7-day return policy",
    trust3Title: "Secure Payment",
    trust3Sub: "100% protected",
    trust4Title: "24/7 Support",
    trust4Sub: "Dedicated help",
  },
  overlays: [],
  element_styles: {},
  element_styles_tablet: {},
  element_styles_mobile: {},
  element_text: {},
  element_links: {},
  element_media: {},
  element_locks: {},
  custom_blocks: [],
  text_overlays: [],
  showStoreNameOnBanner: false,
};


export const FONT_MAP: Record<StoreTheme["font"], string> = {
  system: "ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, sans-serif",
  inter: '"Inter", ui-sans-serif, system-ui, sans-serif',
  poppins: '"Poppins", ui-sans-serif, system-ui, sans-serif',
  playfair: '"Playfair Display", Georgia, serif',
  georgia: 'Georgia, "Times New Roman", serif',
  mono: 'ui-monospace, SFMono-Regular, Menlo, monospace',
};

/** Merge persisted partial theme + accent fallback into a complete theme. */
export const resolveTheme = (raw: any, accentFallback?: string): StoreTheme => {
  const t = (raw && typeof raw === "object" ? raw : {}) as Partial<StoreTheme>;
  const persistedOrder = Array.isArray(t.section_order) ? t.section_order : [];
  const seen = new Set<string>();
  const order: SectionKey[] = [];
  for (const k of persistedOrder) {
    if (DEFAULT_SECTION_ORDER.includes(k as SectionKey) && !seen.has(k)) {
      order.push(k as SectionKey);
      seen.add(k);
    }
  }
  for (const k of DEFAULT_SECTION_ORDER) {
    if (!seen.has(k)) order.push(k);
  }
  return {
    ...DEFAULT_THEME,
    ...t,
    accent: t.accent ?? accentFallback ?? DEFAULT_THEME.accent,
    sections: { ...DEFAULT_THEME.sections, ...(t.sections ?? {}) },
    section_order: order,
    text_overrides: { ...DEFAULT_THEME.text_overrides, ...(t.text_overrides ?? {}) },
    overlays: Array.isArray(t.overlays) ? t.overlays : [],
    element_styles: (t as any).element_styles && typeof (t as any).element_styles === "object" ? (t as any).element_styles : {},
    element_styles_tablet: (t as any).element_styles_tablet && typeof (t as any).element_styles_tablet === "object" ? (t as any).element_styles_tablet : {},
    element_styles_mobile: (t as any).element_styles_mobile && typeof (t as any).element_styles_mobile === "object" ? (t as any).element_styles_mobile : {},
    element_text: (t as any).element_text && typeof (t as any).element_text === "object" ? (t as any).element_text : {},
    element_links: (t as any).element_links && typeof (t as any).element_links === "object" ? (t as any).element_links : {},
    element_media: (t as any).element_media && typeof (t as any).element_media === "object" ? (t as any).element_media : {},
    element_locks: (t as any).element_locks && typeof (t as any).element_locks === "object" ? (t as any).element_locks : {},
    custom_blocks: Array.isArray((t as any).custom_blocks) ? (t as any).custom_blocks : [],
    text_overlays: Array.isArray((t as any).text_overlays) ? (t as any).text_overlays : [],
    showStoreNameOnBanner: typeof (t as any).showStoreNameOnBanner === "boolean" ? (t as any).showStoreNameOnBanner : false,
    compact: t.compact ?? false,
  };
};

export const densityPad = (d: StoreTheme["density"]) =>
  d === "compact" ? "py-2" : d === "roomy" ? "py-10" : "py-6";

export const SECTION_LABELS: Record<SectionKey, string> = {
  topBar: "Top utility bar",
  search: "Search bar",
  categories: "Categories strip",
  hero: "Hero / banner",
  trustStrip: "Trust badges",
  about: "About the store",
  flashDeals: "Flash Deals row",
  specialSections: "Special sections",
  allProducts: "All products grid",
  newsletter: "Newsletter signup",
  footer: "Footer",
};

export const SHADOW_CSS: Record<NonNullable<OverlayImage["shadow"]>, string> = {
  none: "none",
  sm: "0 1px 2px rgba(0,0,0,.08)",
  md: "0 6px 14px rgba(0,0,0,.15)",
  lg: "0 14px 30px rgba(0,0,0,.22)",
  xl: "0 25px 50px rgba(0,0,0,.30)",
};

// ============= THEME PRESETS =============
export type ThemePreset = {
  id: string;
  name: string;
  description: string;
  theme: Partial<StoreTheme>;
  template?: string;
};

export const THEME_PRESETS: ThemePreset[] = [
  {
    id: "minimal",
    name: "Minimal",
    description: "Warm cream canvas, ink-black accents, rounded soft cards — furniture/lifestyle feel.",
    template: "minimal",
    theme: {
      accent: "#0F0F0F",
      bg: "#F7F4EE",
      surface: "#FFFFFF",
      text: "#111111",
      buttonText: "#FFFFFF",
      font: "inter",
      radius: 20,
      density: "roomy",
      sections: {
        topBar: false,
        search: true,
        categories: false,
        hero: true,
        trustStrip: false,
        about: true,
        flashDeals: false,
        specialSections: false,
        allProducts: true,
        newsletter: true,
        footer: true,
      },
      text_overrides: {
        heroBadge: "Check reviews",
        heroCta: "Shop Now",
        flashTitle: "Featured",
        flashSubtitle: "Best sellers this week",
        allProductsTitle: "Our Best Quality Products",
        aboutTitle: "Why Choose Us",
        newsletterTitle: "Subscribe to our newsletter and grab 30% OFF",
        newsletterCopy: "Join our list for early access to new drops and member-only offers.",
        newsletterCta: "Subscribe",
        searchCta: "Search",
        footerNote: "All Rights Reserved.",
        trust1Title: "Free Shipping",
        trust1Sub: "On orders over $50",
        trust2Title: "Easy Returns",
        trust2Sub: "7-day return policy",
        trust3Title: "Secure Payment",
        trust3Sub: "100% protected",
        trust4Title: "24/7 Support",
        trust4Sub: "We're here to help",
      },
    },
  },
  {
    id: "daraz",
    name: "Daraz Marketplace",
    description: "Dense grid, vibrant orange, marketplace energy",
    template: "marketplace",
    theme: {
      accent: "#5669ff",
      bg: "#F5F5F7",
      surface: "#FFFFFF",
      text: "#0F172A",
      font: "system",
      radius: 6,
      density: "compact",
      text_overrides: {
        heroBadge: "Mega Sale",
        heroCta: "Shop now",
        flashTitle: "⚡ Flash Sale",
        flashSubtitle: "Hurry, ends soon!",
        allProductsTitle: "Just for You",
        newsletterTitle: "Get the best deals first",
        newsletterCopy: "Subscribe for exclusive vouchers and early access.",
        newsletterCta: "Subscribe",
      },
    },
  },
  {
    id: "apple",
    name: "Apple Minimal",
    description: "Whitespace, soft greys, premium feel",
    template: "minimal",
    theme: {
      accent: "#0071E3",
      bg: "#FFFFFF",
      surface: "#F5F5F7",
      text: "#1D1D1F",
      font: "inter",
      radius: 18,
      density: "roomy",
      text_overrides: {
        heroBadge: "New",
        heroCta: "Learn more",
        flashTitle: "Featured",
        flashSubtitle: "Crafted for you",
        allProductsTitle: "Shop the lineup",
        newsletterTitle: "Stay in the loop",
        newsletterCopy: "Be the first to hear about new arrivals.",
        newsletterCta: "Sign up",
      },
    },
  },
  {
    id: "editorial",
    name: "Editorial",
    description: "Magazine-style serif, generous spacing",
    template: "editorial",
    theme: {
      accent: "#1F2937",
      bg: "#FAFAF9",
      surface: "#FFFFFF",
      text: "#1F2937",
      font: "playfair",
      radius: 4,
      density: "roomy",
      text_overrides: {
        heroBadge: "The Edit",
        heroCta: "Read more",
        flashTitle: "Curated",
        flashSubtitle: "Hand-picked this season",
        allProductsTitle: "The Collection",
        newsletterTitle: "Join the journal",
        newsletterCopy: "Stories, releases, and quiet moments.",
        newsletterCta: "Subscribe",
      },
    },
  },
  {
    id: "dark-luxury",
    name: "Dark Luxury",
    description: "Deep black with gold accents",
    template: "lookbook",
    theme: {
      accent: "#D4AF37",
      bg: "#0A0A0A",
      surface: "#171717",
      text: "#FAFAFA",
      font: "playfair",
      radius: 2,
      density: "roomy",
      text_overrides: {
        heroBadge: "Exclusive",
        heroCta: "Discover",
        flashTitle: "The Atelier",
        flashSubtitle: "Limited release",
        allProductsTitle: "Maison",
        newsletterTitle: "Private invitations",
        newsletterCopy: "Reserved for our circle.",
        newsletterCta: "Request",
      },
    },
  },
  {
    id: "pastel",
    name: "Pastel Soft",
    description: "Soft pinks, rounded corners, friendly",
    template: "minimal",
    theme: {
      accent: "#EC4899",
      bg: "#FFF5F7",
      surface: "#FFFFFF",
      text: "#3F0418",
      font: "poppins",
      radius: 22,
      density: "cozy",
      text_overrides: {
        heroBadge: "Hello sunshine",
        heroCta: "Browse",
        flashTitle: "Sweet picks",
        flashSubtitle: "You'll love these",
        allProductsTitle: "Everything cute",
        newsletterTitle: "Pinky promise",
        newsletterCopy: "Only the cutest news in your inbox.",
        newsletterCta: "Yes please",
      },
    },
  },
  {
    id: "thread",
    name: "Thread",
    description: "Modern fashion magazine — huge type, editorial energy, MONDE-style layout.",
    template: "trend",
    theme: {
      accent: "#E63946",
      bg: "#F7F5F1",
      surface: "#FFFFFF",
      text: "#0F0F0F",
      buttonText: "#FFFFFF",
      font: "inter",
      radius: 12,
      density: "roomy",
      sections: {
        topBar: false,
        search: false,
        categories: false,
        hero: true,
        trustStrip: false,
        about: false,
        flashDeals: false,
        specialSections: false,
        allProducts: false,
        newsletter: false,
        footer: false,
      },
      text_overrides: {
        heroBadge: "Fashion Trend 2025",
        heroCta: "Explore Now",
        flashTitle: "Curated Collections",
        flashSubtitle: "Trends 2025",
        allProductsTitle: "The Collection",
        aboutTitle: "About Monde",
        newsletterTitle: "Designed for modern you",
        newsletterCopy: "Join our list for first looks at new drops.",
        newsletterCta: "Subscribe",
        searchCta: "Search",
        footerNote: "All Rights Reserved.",
      },
    },
  },
];
