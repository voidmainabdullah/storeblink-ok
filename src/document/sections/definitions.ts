import type { BlockDefinition, SectionDefinition, SettingDefinition } from "./types";
import { CANONICAL_THEME_SECTION_DEFINITIONS } from "./canonicalThemeDefinitions";

const visibilitySetting: SettingDefinition = {
  id: "hidden",
  label: "Visible on this device",
  group: "responsive",
  control: "device-visibility",
  target: "meta",
  responsive: true,
  defaultValue: false,
};

const textSettings = (label: string, multiline = false): SettingDefinition[] => [
  {
    id: "text",
    label,
    group: "content",
    control: multiline ? "textarea" : "text",
    required: true,
    dynamicSources: ["store.business_name", "store.store_tagline", "product.name", "product.description"],
  },
  { id: "color", label: "Text color", group: "typography", control: "color", defaultValue: "#111111" },
  {
    id: "fontSize",
    label: "Font size",
    group: "typography",
    control: "range",
    min: 10,
    max: 96,
    step: 1,
    responsive: true,
  },
  {
    id: "textAlign",
    label: "Alignment",
    group: "typography",
    control: "alignment",
    responsive: true,
    options: [
      { label: "Left", value: "left" },
      { label: "Center", value: "center" },
      { label: "Right", value: "right" },
    ],
  },
  visibilitySetting,
];

const headingBlock: BlockDefinition = {
  type: "heading",
  name: "Heading",
  icon: "Type",
  elementType: "text",
  settings: textSettings("Heading"),
  defaultProps: {
    text: "Build a storefront customers remember",
    color: "#111111",
    fontSize: 58,
    fontWeight: 760,
    lineHeight: 1.04,
    textAlign: "left",
  },
};

const eyebrowBlock: BlockDefinition = {
  type: "eyebrow",
  name: "Eyebrow",
  icon: "Badge",
  elementType: "text",
  settings: textSettings("Eyebrow"),
  defaultProps: {
    text: "NEW COLLECTION",
    color: "#5c6655",
    fontSize: 13,
    fontWeight: 760,
    lineHeight: 1.2,
  },
};

const paragraphBlock: BlockDefinition = {
  type: "paragraph",
  name: "Paragraph",
  icon: "AlignLeft",
  elementType: "text",
  settings: textSettings("Text", true),
  defaultProps: {
    text: "Curated products, clear service, and a shopping experience designed around your brand.",
    color: "#505050",
    fontSize: 18,
    fontWeight: 400,
    lineHeight: 1.55,
  },
};

const buttonBlock: BlockDefinition = {
  type: "button",
  name: "Button",
  icon: "MousePointerClick",
  elementType: "button",
  settings: [
    { id: "label", label: "Label", group: "content", control: "text", required: true },
    { id: "navigationTarget", label: "Link", group: "content", control: "link", target: "extensions" },
    { id: "background", label: "Background", group: "appearance", control: "color" },
    { id: "color", label: "Text color", group: "appearance", control: "color" },
    { id: "fullWidthMobile", label: "Full width on mobile", group: "responsive", control: "switch", responsive: true },
    visibilitySetting,
  ],
  defaultProps: {
    label: "Shop products",
    background: "#171717",
    color: "#ffffff",
    fontSize: 15,
    fontWeight: 700,
  },
};

const imageBlock: BlockDefinition = {
  type: "image",
  name: "Image",
  icon: "Image",
  elementType: "image",
  settings: [
    { id: "src", label: "Image", group: "content", control: "image" },
    { id: "alt", label: "Alt text", group: "content", control: "text", required: true },
    {
      id: "objectFit",
      label: "Image fit",
      group: "layout",
      control: "select",
      options: [
        { label: "Cover", value: "cover" },
        { label: "Contain", value: "contain" },
      ],
    },
    visibilitySetting,
  ],
  defaultProps: { alt: "Store hero image", objectFit: "cover" },
};

const productCardBlock: BlockDefinition = {
  type: "product-card",
  name: "Product card",
  icon: "ShoppingBag",
  elementType: "container",
  settings: [
    {
      id: "productId",
      label: "Product",
      group: "content",
      control: "product",
      target: "extensions",
      required: true,
    },
    visibilitySetting,
  ],
  defaultProps: { overflow: "hidden" },
};

const navBlock: BlockDefinition = {
  type: "navigation-link",
  name: "Navigation link",
  icon: "Link",
  elementType: "button",
  settings: [
    { id: "label", label: "Label", group: "content", control: "text", required: true },
    { id: "navigationTarget", label: "Destination", group: "content", control: "link", target: "extensions", required: true },
    { id: "openInNewTab", label: "Open in new tab", group: "behavior", control: "switch", target: "extensions" },
    visibilitySetting,
  ],
  defaultProps: { label: "Link", background: "transparent", color: "#171717", fontSize: 14, fontWeight: 600 },
};

const localContentSection = (
  type: string,
  name: string,
  category: SectionDefinition["category"],
  description: string,
  blocks: Record<string, BlockDefinition>,
  defaultBlocks: string[],
): SectionDefinition => ({
  type,
  name,
  icon: "PanelsTopLeft",
  category,
  description,
  settings: [
    {
      id: "fillColor",
      label: "Background",
      group: "appearance",
      control: "color",
      target: "style",
    },
    visibilitySetting,
  ],
  blocks,
  defaultBlocks,
  responsiveBehavior: {
    desktop: "Theme-defined multi-column layout",
    tablet: "Theme-defined compact layout",
    mobile: "Theme-defined stacked layout",
  },
});

const testimonialBlock: BlockDefinition = {
  ...paragraphBlock,
  type: "testimonial",
  name: "Testimonial",
  defaultProps: {
    ...paragraphBlock.defaultProps,
    text: "Thoughtful products and dependable service, delivered with care.",
  },
};

const featureBlock: BlockDefinition = {
  ...paragraphBlock,
  type: "feature-item",
  name: "Feature",
  defaultProps: {
    ...paragraphBlock.defaultProps,
    text: "Designed for everyday use",
  },
};

const announcementItemBlock: BlockDefinition = {
  ...paragraphBlock,
  type: "announcement-item",
  name: "Announcement",
  settings: [
    { id: "text", label: "Message", group: "content", control: "text", required: true },
    {
      id: "navigationTarget",
      label: "Link",
      group: "content",
      control: "link",
      target: "extensions",
    },
    { id: "color", label: "Text color", group: "appearance", control: "color" },
    visibilitySetting,
  ],
  defaultProps: {
    ...paragraphBlock.defaultProps,
    text: "Free delivery on selected orders",
    color: "#ffffff",
    whiteSpace: "nowrap",
  },
};

const supplementalSectionDefinitions: SectionDefinition[] = [
  localContentSection(
    "navigation",
    "Navigation",
    "Header",
    "Page-local navigation surface backed by the store Navigation System.",
    { "navigation-link": navBlock },
    [
      "navigation-link",
      "navigation-link",
      "navigation-link",
      "navigation-link",
    ],
  ),
  localContentSection(
    "testimonials",
    "Testimonials",
    "Content",
    "Editable customer quotes in a responsive section.",
    { heading: headingBlock, testimonial: testimonialBlock },
    ["heading", "testimonial", "testimonial"],
  ),
  localContentSection(
    "newsletter",
    "Newsletter",
    "Marketing",
    "Responsive newsletter callout with editable copy and action.",
    {
      heading: headingBlock,
      paragraph: paragraphBlock,
      button: buttonBlock,
    },
    ["heading", "paragraph", "button"],
  ),
  localContentSection(
    "contact",
    "Contact section",
    "Content",
    "Store contact information and editable supporting copy.",
    {
      heading: headingBlock,
      paragraph: paragraphBlock,
      button: buttonBlock,
    },
    ["heading", "paragraph", "button"],
  ),
  localContentSection(
    "about",
    "About section",
    "Content",
    "Brand story content with independent text and image blocks.",
    {
      heading: headingBlock,
      paragraph: paragraphBlock,
      image: imageBlock,
      button: buttonBlock,
    },
    ["heading", "paragraph", "image"],
  ),
  localContentSection(
    "custom-content",
    "Custom content",
    "Content",
    "Flexible local section for independently editable content blocks.",
    {
      heading: headingBlock,
      paragraph: paragraphBlock,
      image: imageBlock,
      button: buttonBlock,
    },
    ["heading", "paragraph", "button"],
  ),
  localContentSection(
    "image-with-text",
    "Image with text",
    "Content",
    "Universal media and text composition.",
    {
      heading: headingBlock,
      paragraph: paragraphBlock,
      image: imageBlock,
      button: buttonBlock,
    },
    ["image", "heading", "paragraph"],
  ),
  localContentSection(
    "collection-list",
    "Collection list",
    "Products",
    "Responsive collection discovery cards.",
    { heading: headingBlock, "feature-item": featureBlock },
    ["heading", "feature-item", "feature-item", "feature-item"],
  ),
  localContentSection(
    "testimonial-grid",
    "Testimonial grid",
    "Content",
    "Universal responsive customer story grid.",
    { heading: headingBlock, testimonial: testimonialBlock },
    ["heading", "testimonial", "testimonial"],
  ),
  localContentSection(
    "faq",
    "FAQ",
    "Content",
    "Editable questions and answers in a responsive content section.",
    { heading: headingBlock, paragraph: paragraphBlock },
    ["heading", "paragraph", "paragraph"],
  ),
  localContentSection(
    "logo-list",
    "Logo list",
    "Marketing",
    "Responsive list of independently replaceable brand images.",
    { heading: headingBlock, image: imageBlock },
    ["heading", "image", "image", "image"],
  ),
  localContentSection(
    "video-banner",
    "Video banner",
    "Hero",
    "Media-led banner with editable supporting content.",
    {
      image: imageBlock,
      heading: headingBlock,
      paragraph: paragraphBlock,
      button: buttonBlock,
    },
    ["image", "heading", "paragraph", "button"],
  ),
  localContentSection(
    "featured-collection",
    "Featured collection",
    "Products",
    "Live product collection using the shared catalog bindings.",
    { "product-card": productCardBlock },
    [],
  ),
  localContentSection(
    "promotional-marquee",
    "Promotional marquee",
    "Marketing",
    "Reusable promotional ticker using the shared animation system.",
    { "announcement-item": announcementItemBlock, button: buttonBlock },
    ["announcement-item", "announcement-item", "announcement-item"],
  ),
];

export const BUILT_IN_SECTION_DEFINITIONS: SectionDefinition[] = [
  {
    type: "header",
    name: "Main header",
    icon: "PanelTop",
    category: "Header",
    description: "Responsive brand navigation with mobile menu and cart actions.",
    settings: [
      { id: "fillColor", label: "Background", group: "appearance", control: "color", target: "style" },
      { id: "sticky", label: "Sticky header", group: "behavior", control: "switch" },
      visibilitySetting,
    ],
    blocks: { "navigation-link": navBlock },
    defaultBlocks: ["navigation-link", "navigation-link", "navigation-link", "navigation-link"],
    responsiveBehavior: {
      desktop: "Full navigation",
      tablet: "Compact navigation",
      mobile: "Hamburger drawer with touch targets",
    },
  },
  {
    type: "hero",
    name: "Split hero",
    icon: "GalleryHorizontalEnd",
    category: "Hero",
    description: "Responsive editorial hero with independent content and media blocks.",
    settings: [
      { id: "fillColor", label: "Background", group: "appearance", control: "color", target: "style" },
      {
        id: "contentAlignment",
        label: "Content alignment",
        group: "layout",
        control: "alignment",
        responsive: true,
      },
      { id: "reverseOnMobile", label: "Image first on mobile", group: "responsive", control: "switch", responsive: true },
      visibilitySetting,
    ],
    blocks: {
      eyebrow: eyebrowBlock,
      heading: headingBlock,
      paragraph: paragraphBlock,
      button: buttonBlock,
      image: imageBlock,
    },
    defaultBlocks: ["eyebrow", "heading", "paragraph", "button", "image"],
    responsiveBehavior: {
      desktop: "Two columns",
      tablet: "Balanced split",
      mobile: "Stacked content and media",
    },
  },
  {
    type: "product-grid",
    name: "Featured products",
    icon: "LayoutGrid",
    category: "Products",
    description: "Live product references with responsive grid behavior.",
    settings: [
      { id: "heading", label: "Heading", group: "content", control: "text" },
      { id: "collectionId", label: "Collection", group: "content", control: "collection", target: "extensions" },
      { id: "columns", label: "Desktop columns", group: "layout", control: "range", min: 2, max: 5, responsive: true },
      visibilitySetting,
    ],
    blocks: { "product-card": productCardBlock },
    defaultBlocks: [],
    responsiveBehavior: {
      desktop: "Four columns",
      tablet: "Two columns",
      mobile: "Single column",
    },
  },
  {
    type: "rich-text",
    name: "Image with text",
    icon: "PanelsTopLeft",
    category: "Content",
    description: "Responsive story section with media, heading, and body copy.",
    settings: [
      { id: "fillColor", label: "Background", group: "appearance", control: "color", target: "style" },
      visibilitySetting,
    ],
    blocks: { heading: headingBlock, paragraph: paragraphBlock, button: buttonBlock, image: imageBlock },
    defaultBlocks: ["image", "heading", "paragraph"],
    responsiveBehavior: {
      desktop: "Media and content columns",
      tablet: "Compact columns",
      mobile: "Stacked",
    },
  },
  {
    type: "footer",
    name: "Footer",
    icon: "PanelBottom",
    category: "Footer",
    description: "Page-local brand, navigation, and legal information.",
    settings: [
      { id: "fillColor", label: "Background", group: "appearance", control: "color", target: "style" },
      { id: "color", label: "Text color", group: "appearance", control: "color" },
      visibilitySetting,
    ],
    blocks: { paragraph: paragraphBlock, "navigation-link": navBlock },
    defaultBlocks: ["paragraph"],
    responsiveBehavior: {
      desktop: "Three columns",
      tablet: "Two columns",
      mobile: "Stacked links",
    },
  },
  ...CANONICAL_THEME_SECTION_DEFINITIONS,
  ...supplementalSectionDefinitions,
];
