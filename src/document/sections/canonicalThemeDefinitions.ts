import type {
  BlockDefinition,
  SectionDefinition,
  SettingDefinition,
} from "./types";
import type { ElementType } from "@/types";
import type { CanonicalSectionType } from "@/theme-engine/contracts";

const visibility: SettingDefinition = {
  id: "hidden",
  label: "Visible on this device",
  group: "responsive",
  control: "device-visibility",
  target: "meta",
  responsive: true,
  defaultValue: false,
};

const setting = (
  id: string,
  label: string,
  group: SettingDefinition["group"],
  control: SettingDefinition["control"],
  options: Partial<SettingDefinition> = {},
): SettingDefinition => ({ id, label, group, control, ...options });

const block = (type: string, name: string, elementType: ElementType): BlockDefinition => ({
  type,
  name,
  icon: "Box",
  elementType,
  settings: [
    setting(
      elementType === "button" ? "label" : "text",
      elementType === "button" ? "Label" : "Content",
      "content",
      elementType === "image" ? "image" : "text",
    ),
    ...(elementType === "button" ? [
      setting("navigationTarget", "Destination", "content", "link", {
        target: "extensions",
      }),
      setting("openInNewTab", "Open in new tab", "behavior", "switch", {
        target: "extensions",
      }),
    ] : []),
    visibility,
  ],
  defaultProps:
    elementType === "button"
      ? { label: name, background: "transparent", color: "#0A0A0A" }
      : elementType === "image"
        ? { alt: name, objectFit: "cover" }
        : { text: name },
});

const blockTypes: Array<[string, string, ElementType]> = [
  ["announcement-item", "Announcement", "text"],
  ["store-logo", "Store logo", "text"],
  ["navigation-link", "Navigation link", "button"],
  ["search-trigger", "Search", "button"],
  ["account-trigger", "Account", "button"],
  ["cart-trigger", "Cart", "button"],
  ["cart-count", "Cart count", "text"],
  ["mobile-menu", "Mobile menu", "container"],
  ["mobile-menu-trigger", "Mobile menu trigger", "button"],
  ["eyebrow", "Eyebrow", "text"],
  ["heading", "Heading", "text"],
  ["rich-heading-emphasis", "Editorial emphasis", "text"],
  ["paragraph", "Paragraph", "text"],
  ["image", "Image", "image"],
  ["media-caption", "Media caption", "text"],
  ["decorative-shape", "Decorative shape", "shape"],
  ["product-reference", "Product", "text"],
  ["product-price", "Product price", "text"],
  ["product-action", "Product action", "button"],
  ["button", "Button", "button"],
  ["feature-item", "Feature", "text"],
  ["collection-filter", "Collection filter", "button"],
  ["collection-sort", "Collection sort", "button"],
  ["product-card", "Product card", "container"],
  ["empty-state", "Empty state", "text"],
  ["testimonial", "Testimonial", "text"],
  ["contact-information", "Contact information", "text"],
  ["menu-heading", "Menu heading", "text"],
  ["menu", "Menu", "text"],
  ["legal", "Legal", "text"],
];

const sharedBlocks = Object.fromEntries(
  blockTypes.map(([type, name, elementType]) => [type, block(type, name, elementType)]),
);
sharedBlocks["announcement-item"] = {
  ...sharedBlocks["announcement-item"],
  settings: [
    setting("text", "Message", "content", "text", { required: true }),
    setting("navigationTarget", "Link", "content", "link", {
      target: "extensions",
    }),
    setting("color", "Text color", "appearance", "color"),
    visibility,
  ],
  defaultProps: {
    text: "Free delivery on selected orders",
    color: "#ffffff",
    whiteSpace: "nowrap",
  },
};
sharedBlocks["navigation-link"] = {
  ...sharedBlocks["navigation-link"],
  settings: [
    setting("label", "Label", "content", "text", { required: true }),
    setting("navigationTarget", "Destination", "content", "link", {
      target: "extensions",
      required: true,
    }),
    setting("openInNewTab", "Open in new tab", "behavior", "switch", {
      target: "extensions",
    }),
    visibility,
  ],
  defaultProps: {
    label: "Link",
    background: "transparent",
    color: "#171717",
  },
};
const definition = (
  type: CanonicalSectionType,
  name: string,
  category: SectionDefinition["category"],
  description: string,
  settings: SettingDefinition[],
): SectionDefinition => ({
  type,
  name,
  icon: "PanelsTopLeft",
  category,
  description,
  settings: [...settings, visibility],
  blocks: sharedBlocks,
  defaultBlocks: [],
  responsiveBehavior: {
    desktop: "Theme-defined editorial layout",
    tablet: "Theme-defined compact layout",
    mobile: "Theme-defined stacked layout",
  },
});

export const CANONICAL_THEME_SECTION_DEFINITIONS: SectionDefinition[] = [
  definition(
    "announcement-marquee",
    "Announcement marquee",
    "Marketing",
    "Accessible announcement ticker with responsive speed and direction.",
    [
      setting("enabled", "Enabled", "behavior", "switch", {
        defaultValue: true,
      }),
      setting("fillColor", "Background", "appearance", "color", {
        target: "style",
      }),
      setting("textColor", "Text color", "appearance", "color", {
        defaultValue: "#ffffff",
      }),
      setting("fontFamily", "Font family", "typography", "text", {
        defaultValue: "Inter, system-ui, sans-serif",
      }),
      setting("fontSize", "Font size", "typography", "range", {
        min: 8,
        max: 72,
        step: 1,
        responsive: true,
      }),
      setting("fontWeight", "Font weight", "typography", "range", {
        min: 100,
        max: 900,
        step: 50,
      }),
      setting("letterSpacing", "Letter spacing", "typography", "range", {
        min: 0,
        max: 16,
        step: 0.1,
        responsive: true,
      }),
      setting("height", "Bar height", "layout", "range", {
        target: "transform",
        min: 24,
        max: 160,
        step: 1,
        responsive: true,
      }),
      setting("horizontalPadding", "Horizontal padding", "layout", "range", {
        min: 0,
        max: 160,
        step: 1,
        responsive: true,
      }),
      setting("itemGap", "Item gap", "layout", "range", {
        min: 0,
        max: 240,
        step: 1,
        responsive: true,
      }),
      setting("separator", "Separator or icon", "content", "text", {
        defaultValue: "\u2022",
      }),
      setting("speed", "Speed", "behavior", "range", {
        min: 8,
        max: 240,
        step: 1,
        responsive: true,
        mode: "advanced",
      }),
      setting("direction", "Direction", "behavior", "segmented", {
        options: [
          { label: "Left", value: "left" },
          { label: "Right", value: "right" },
        ],
      }),
      setting("pauseOnHover", "Pause on hover", "behavior", "switch", { mode: "advanced" }),
      setting(
        "pauseWhenOffscreen",
        "Pause when off-screen",
        "behavior",
        "switch",
        { mode: "advanced", defaultValue: true },
      ),
    ],
  ),
  definition(
    "site-header",
    "Site header",
    "Header",
    "Local header instance using store-level navigation data.",
    [
      setting("menuId", "Menu", "content", "menu"),
      setting("sticky", "Sticky", "behavior", "switch", { mode: "advanced" }),
      setting("showSearch", "Search", "behavior", "switch"),
      setting("showAccount", "Account", "behavior", "switch"),
      setting("showCart", "Cart", "behavior", "switch"),
    ],
  ),
  definition(
    "editorial-intro",
    "Editorial intro",
    "Hero",
    "Large editorial statement with safe semantic emphasis and supporting media.",
    [
      setting("colorSchemeId", "Color scheme", "appearance", "select"),
      setting("mobileStackingOrder", "Mobile order", "responsive", "select", {
        responsive: true,
        options: [
          { label: "Text first", value: "text-media" },
          { label: "Media first", value: "media-text" },
        ],
      }),
    ],
  ),
  definition(
    "immersive-product-hero",
    "Immersive product hero",
    "Hero",
    "Live product hotspot experience backed by product references.",
    [
      setting("imageFit", "Image fit", "layout", "select", {
        options: [
          { label: "Cover", value: "cover" },
          { label: "Contain", value: "contain" },
        ],
      }),
      setting("cardStyle", "Product card", "appearance", "select", {
        options: [
          { label: "Floating", value: "floating" },
          { label: "Minimal", value: "minimal" },
          { label: "Glass", value: "glass" },
        ],
      }),
      setting("showAddToCart", "Add to cart", "behavior", "switch"),
      setting("showViewProduct", "View product", "behavior", "switch"),
    ],
  ),
  definition(
    "brand-story",
    "Brand story",
    "Content",
    "Asymmetrical media and editorial brand narrative.",
    [
      setting("desktopArrangement", "Desktop layout", "layout", "select", { mode: "advanced" }),
      setting("mobileArrangement", "Mobile layout", "responsive", "select", { responsive: true, mode: "advanced" }),
    ],
  ),
  definition(
    "craftsmanship-features",
    "Craftsmanship features",
    "Content",
    "High-contrast feature narrative with keyboard-compatible active states.",
    [setting("activeFeature", "Active feature", "behavior", "select")],
  ),
  definition(
    "featured-product-collection",
    "Featured products",
    "Products",
    "Live catalog references with responsive columns, filtering and sorting.",
    [
      setting("source", "Product source", "content", "collection"),
      setting("maximumProducts", "Maximum products", "content", "range", { min: 1, max: 24, step: 1 }),
      setting("columns", "Columns", "layout", "range", { min: 1, max: 5, step: 1, responsive: true }),
      setting("showQuickAdd", "Quick add", "behavior", "switch"),
      setting("showQuickView", "Quick view", "behavior", "switch"),
    ],
  ),
  definition(
    "customer-stories",
    "Customer stories",
    "Content",
    "Editorial testimonial split compatible with future review sources.",
    [
      setting("source", "Source", "content", "select"),
      setting("mode", "Layout", "layout", "select"),
    ],
  ),
  definition(
    "site-footer",
    "Site footer",
    "Footer",
    "Local footer instance using store-level navigation data.",
    [
      setting("primaryMenuId", "Primary menu", "content", "menu"),
      setting("secondaryMenuId", "Secondary menu", "content", "menu"),
      setting("showNewsletter", "Newsletter", "behavior", "switch"),
      setting("showSocialLinks", "Social links", "behavior", "switch"),
      setting("showContactInformation", "Contact details", "behavior", "switch"),
    ],
  ),
];
