import {
  adaptiveComponentLibrarySchema,
} from "../contracts/componentLibrary";
import type {
  AdaptiveComponentDefinition,
  ComponentPropertyDefinition,
  ComponentSlotDefinition,
  ComponentVariantDefinition,
  JsonValue,
} from "@/adaptive-commerce";
import { artifactHashFor } from "../compiler/sha256";

const property = (
  id: string,
  label: string,
  valueType: ComponentPropertyDefinition["valueType"],
  required = false,
  defaultValue?: JsonValue,
): ComponentPropertyDefinition => ({
  id,
  label,
  valueType,
  required,
  ...(defaultValue === undefined ? {} : { defaultValue }),
});

const slot = (
  id: string,
  accepts: string[],
  options: Partial<
    Pick<ComponentSlotDefinition, "required" | "minimumItems" | "maximumItems" | "static">
  > = {},
): ComponentSlotDefinition => ({
  id,
  accepts,
  required: options.required ?? false,
  minimumItems: options.minimumItems ?? 0,
  maximumItems: options.maximumItems ?? null,
  static: options.static ?? false,
});

const variant = (
  id: string,
  name: string,
  requiredSlots: string[],
  defaults: Record<string, JsonValue> = {},
): ComponentVariantDefinition => ({ id, name, requiredSlots, defaults });

type ComponentInput = Omit<AdaptiveComponentDefinition, "version">;

const component = (input: ComponentInput): AdaptiveComponentDefinition => ({
  ...input,
  version: "1.0.0",
});

const siteHeader = component({
  id: "site-header",
  name: "Site header",
  role: "global-region",
  properties: [
    property("navigation-label", "Navigation label", "string", true, "Primary navigation"),
    property("sticky", "Sticky", "boolean", false, true),
  ],
  slots: [
    slot("logo", ["image", "text"], { required: true, minimumItems: 1, maximumItems: 1, static: true }),
    slot("navigation", ["navigation-link"], { required: true, minimumItems: 1 }),
    slot("actions", ["button", "icon-button"], { static: true }),
  ],
  variants: [
    variant("standard", "Standard", ["logo", "navigation"]),
    variant("centered", "Centered", ["logo", "navigation"]),
  ],
  defaultVariantId: "standard",
  responsivePolicy: "site-header",
  commerceBindingIds: ["store-name", "primary-navigation", "cart-count"],
  customization: {
    allowVariantChange: true,
    allowSlotReorder: false,
    allowBlocks: true,
    allowFreeform: false,
    editableProperties: ["navigation-label", "sticky"],
    editableSlots: ["logo", "navigation"],
  },
  a11y: {
    landmark: "header",
    accessibleNameProperty: null,
    requiredAltSlots: ["logo"],
    requiresHeading: false,
  },
});

const siteFooter = component({
  id: "site-footer",
  name: "Site footer",
  role: "global-region",
  properties: [property("navigation-label", "Navigation label", "string", true, "Footer navigation")],
  slots: [
    slot("brand", ["image", "text"], { required: true, minimumItems: 1, static: true }),
    slot("navigation", ["navigation-link", "menu"], { required: true, minimumItems: 1 }),
    slot("legal", ["text", "navigation-link"], { required: true, minimumItems: 1, static: true }),
  ],
  variants: [
    variant("columns", "Columns", ["brand", "navigation", "legal"]),
    variant("compact", "Compact", ["brand", "navigation", "legal"]),
  ],
  defaultVariantId: "columns",
  responsivePolicy: "site-footer",
  commerceBindingIds: ["footer-store-name", "footer-navigation"],
  customization: {
    allowVariantChange: true,
    allowSlotReorder: true,
    allowBlocks: true,
    allowFreeform: false,
    editableProperties: ["navigation-label"],
    editableSlots: ["brand", "navigation", "legal"],
  },
  a11y: {
    landmark: "footer",
    accessibleNameProperty: null,
    requiredAltSlots: [],
    requiresHeading: false,
  },
});

const hero = component({
  id: "hero",
  name: "Hero",
  role: "section",
  properties: [
    property("heading", "Heading", "string", true, "Welcome to our store"),
    property("description", "Description", "rich-text", false, ""),
    property("alignment", "Alignment", "string", false, "start"),
  ],
  slots: [
    slot("content", ["heading", "text"], { required: true, minimumItems: 1, static: true }),
    slot("actions", ["button", "navigation-link"]),
    slot("media", ["image", "video"], { maximumItems: 1 }),
  ],
  variants: [
    variant("split", "Split", ["content", "media"], { alignment: "start" }),
    variant("centered", "Centered", ["content"], { alignment: "center" }),
    variant("editorial", "Editorial", ["content", "media"], { alignment: "start" }),
  ],
  defaultVariantId: "split",
  responsivePolicy: "hero-content-aware",
  commerceBindingIds: ["home-store-name"],
  customization: {
    allowVariantChange: true,
    allowSlotReorder: false,
    allowBlocks: true,
    allowFreeform: false,
    editableProperties: ["heading", "description", "alignment"],
    editableSlots: ["content", "actions", "media"],
  },
  a11y: {
    landmark: "section",
    accessibleNameProperty: "heading",
    requiredAltSlots: ["media"],
    requiresHeading: true,
  },
});

const productGrid = component({
  id: "product-grid",
  name: "Product grid",
  role: "section",
  properties: [
    property("heading", "Heading", "string", true, "Featured products"),
    property("empty-message", "Empty message", "string", true, "No products are available."),
  ],
  slots: [
    slot("heading", ["heading"], { required: true, minimumItems: 1, maximumItems: 1, static: true }),
    slot("products", ["product-card"], { required: true }),
  ],
  variants: [
    variant("grid", "Grid", ["heading", "products"]),
    variant("editorial", "Editorial", ["heading", "products"]),
    variant("carousel", "Carousel", ["heading", "products"]),
  ],
  defaultVariantId: "grid",
  responsivePolicy: "product-grid",
  commerceBindingIds: ["featured-products"],
  customization: {
    allowVariantChange: true,
    allowSlotReorder: false,
    allowBlocks: false,
    allowFreeform: false,
    editableProperties: ["heading", "empty-message"],
    editableSlots: ["heading"],
  },
  a11y: {
    landmark: "section",
    accessibleNameProperty: "heading",
    requiredAltSlots: [],
    requiresHeading: true,
  },
});

const productGallery = component({
  id: "product-gallery",
  name: "Product gallery",
  role: "section",
  properties: [property("label", "Gallery label", "string", true, "Product media")],
  slots: [
    slot("media", ["image", "video"], { required: true, minimumItems: 1 }),
    slot("thumbnails", ["image-button"]),
  ],
  variants: [
    variant("stacked", "Stacked", ["media"]),
    variant("carousel", "Carousel", ["media"]),
  ],
  defaultVariantId: "stacked",
  responsivePolicy: "product-gallery",
  commerceBindingIds: ["current-product-media"],
  customization: {
    allowVariantChange: true,
    allowSlotReorder: false,
    allowBlocks: false,
    allowFreeform: false,
    editableProperties: ["label"],
    editableSlots: [],
  },
  a11y: {
    landmark: "section",
    accessibleNameProperty: "label",
    requiredAltSlots: ["media"],
    requiresHeading: false,
  },
});

const productInformation = component({
  id: "product-information",
  name: "Product information",
  role: "section",
  properties: [property("heading", "Heading", "string", true, "Product information")],
  slots: [
    slot("title", ["heading"], { required: true, minimumItems: 1, maximumItems: 1, static: true }),
    slot("price", ["price"], { required: true, minimumItems: 1, maximumItems: 1, static: true }),
    slot("variants", ["variant-selector"], { static: true }),
    slot("purchase-actions", ["buy-button", "quantity"], { required: true, minimumItems: 1, static: true }),
    slot("extra-content", ["text", "app-block"]),
  ],
  variants: [
    variant("standard", "Standard", ["title", "price", "purchase-actions"]),
    variant("editorial", "Editorial", ["title", "price", "purchase-actions"]),
  ],
  defaultVariantId: "standard",
  responsivePolicy: "product-information",
  commerceBindingIds: ["current-product-title", "current-product-price", "current-product-inventory", "current-product-variant"],
  customization: {
    allowVariantChange: true,
    allowSlotReorder: false,
    allowBlocks: true,
    allowFreeform: false,
    editableProperties: ["heading"],
    editableSlots: ["extra-content"],
  },
  a11y: {
    landmark: "section",
    accessibleNameProperty: "heading",
    requiredAltSlots: [],
    requiresHeading: true,
  },
});

const collectionGrid = component({
  id: "collection-grid",
  name: "Collection grid",
  role: "section",
  properties: [
    property("heading", "Heading", "string", true, "Collection"),
    property("empty-message", "Empty message", "string", true, "No products match this collection."),
  ],
  slots: [
    slot("intro", ["heading", "text"], { required: true, minimumItems: 1, static: true }),
    slot("filters", ["filter", "sort"]),
    slot("products", ["product-card"], { required: true }),
  ],
  variants: [
    variant("standard", "Standard", ["intro", "products"]),
    variant("editorial", "Editorial", ["intro", "products"]),
  ],
  defaultVariantId: "standard",
  responsivePolicy: "collection-grid",
  commerceBindingIds: ["current-collection-title", "current-collection-products"],
  customization: {
    allowVariantChange: true,
    allowSlotReorder: false,
    allowBlocks: false,
    allowFreeform: false,
    editableProperties: ["heading", "empty-message"],
    editableSlots: ["intro"],
  },
  a11y: {
    landmark: "section",
    accessibleNameProperty: "heading",
    requiredAltSlots: [],
    requiresHeading: true,
  },
});

const cart = component({
  id: "cart",
  name: "Cart",
  role: "section",
  properties: [
    property("heading", "Heading", "string", true, "Your cart"),
    property("empty-message", "Empty message", "string", true, "Your cart is empty."),
  ],
  slots: [
    slot("lines", ["cart-line"], { required: true }),
    slot("summary", ["price", "text"], { required: true, minimumItems: 1, static: true }),
    slot("actions", ["checkout-button", "navigation-link"], { required: true, minimumItems: 1, static: true }),
  ],
  variants: [
    variant("page", "Page", ["lines", "summary", "actions"]),
    variant("compact", "Compact", ["lines", "summary", "actions"]),
  ],
  defaultVariantId: "page",
  responsivePolicy: "cart",
  commerceBindingIds: ["cart-lines", "cart-subtotal"],
  customization: {
    allowVariantChange: true,
    allowSlotReorder: false,
    allowBlocks: false,
    allowFreeform: false,
    editableProperties: ["heading", "empty-message"],
    editableSlots: [],
  },
  a11y: {
    landmark: "main",
    accessibleNameProperty: "heading",
    requiredAltSlots: [],
    requiresHeading: true,
  },
});

const searchResults = component({
  id: "search-results",
  name: "Search results",
  role: "section",
  properties: [
    property("heading", "Heading", "string", true, "Search"),
    property("input-label", "Input label", "string", true, "Search products"),
    property("empty-message", "Empty message", "string", true, "No results found."),
  ],
  slots: [
    slot("input", ["search-input"], { required: true, minimumItems: 1, maximumItems: 1, static: true }),
    slot("results", ["product-card", "page-result"], { required: true }),
    slot("empty-state", ["text"], { static: true }),
  ],
  variants: [variant("standard", "Standard", ["input", "results"])],
  defaultVariantId: "standard",
  responsivePolicy: "search-results",
  commerceBindingIds: ["search-query", "search-items"],
  customization: {
    allowVariantChange: false,
    allowSlotReorder: false,
    allowBlocks: false,
    allowFreeform: false,
    editableProperties: ["heading", "input-label", "empty-message"],
    editableSlots: [],
  },
  a11y: {
    landmark: "main",
    accessibleNameProperty: "heading",
    requiredAltSlots: [],
    requiresHeading: true,
  },
});

const recommendations = component({
  id: "recommendations",
  name: "Recommendations",
  role: "section",
  properties: [property("heading", "Heading", "string", true, "You may also like")],
  slots: [
    slot("heading", ["heading"], { required: true, minimumItems: 1, maximumItems: 1, static: true }),
    slot("products", ["product-card"], { required: true }),
  ],
  variants: [
    variant("grid", "Grid", ["heading", "products"]),
    variant("minimal", "Minimal", ["heading", "products"]),
  ],
  defaultVariantId: "grid",
  responsivePolicy: "recommendations",
  commerceBindingIds: ["recommended-products"],
  customization: {
    allowVariantChange: true,
    allowSlotReorder: false,
    allowBlocks: false,
    allowFreeform: false,
    editableProperties: ["heading"],
    editableSlots: ["heading"],
  },
  a11y: {
    landmark: "section",
    accessibleNameProperty: "heading",
    requiredAltSlots: [],
    requiresHeading: true,
  },
});

const richText = component({
  id: "rich-text",
  name: "Rich text",
  role: "section",
  properties: [property("heading", "Heading", "string", true, "Page")],
  slots: [
    slot("heading", ["heading"], { required: true, minimumItems: 1, maximumItems: 1, static: true }),
    slot("body", ["rich-text", "text"], { required: true, minimumItems: 1 }),
    slot("media", ["image", "video"], { maximumItems: 1 }),
  ],
  variants: [
    variant("article", "Article", ["heading", "body"]),
    variant("split", "Split", ["heading", "body", "media"]),
  ],
  defaultVariantId: "article",
  responsivePolicy: "rich-text",
  commerceBindingIds: ["current-page-title", "current-page-body"],
  customization: {
    allowVariantChange: true,
    allowSlotReorder: false,
    allowBlocks: true,
    allowFreeform: false,
    editableProperties: ["heading"],
    editableSlots: ["heading", "body", "media"],
  },
  a11y: {
    landmark: "main",
    accessibleNameProperty: "heading",
    requiredAltSlots: ["media"],
    requiresHeading: true,
  },
});

const blogArticle = component({
  id: "blog-article",
  name: "Blog article",
  role: "section",
  properties: [property("heading", "Heading", "string", true, "Article")],
  slots: [
    slot("title", ["heading"], { required: true, minimumItems: 1, maximumItems: 1, static: true }),
    slot("metadata", ["text"], { static: true }),
    slot("body", ["rich-text"], { required: true, minimumItems: 1 }),
    slot("media", ["image", "video"], { maximumItems: 1 }),
  ],
  variants: [
    variant("editorial", "Editorial", ["title", "body"]),
    variant("minimal", "Minimal", ["title", "body"]),
  ],
  defaultVariantId: "editorial",
  responsivePolicy: "blog-article",
  commerceBindingIds: ["blog-current-page-title", "blog-current-page-body"],
  customization: {
    allowVariantChange: true,
    allowSlotReorder: false,
    allowBlocks: true,
    allowFreeform: false,
    editableProperties: ["heading"],
    editableSlots: ["title", "body", "media"],
  },
  a11y: {
    landmark: "main",
    accessibleNameProperty: "heading",
    requiredAltSlots: ["media"],
    requiresHeading: true,
  },
});

const notFound = component({
  id: "not-found",
  name: "Page not found",
  role: "section",
  properties: [
    property("heading", "Heading", "string", true, "Page not found"),
    property("message", "Message", "string", true, "The page you requested is unavailable."),
  ],
  slots: [
    slot("heading", ["heading"], { required: true, minimumItems: 1, maximumItems: 1, static: true }),
    slot("body", ["text"], { required: true, minimumItems: 1, static: true }),
    slot("action", ["navigation-link"], { required: true, minimumItems: 1, maximumItems: 1, static: true }),
  ],
  variants: [variant("centered", "Centered", ["heading", "body", "action"])],
  defaultVariantId: "centered",
  responsivePolicy: "not-found",
  commerceBindingIds: [],
  customization: {
    allowVariantChange: false,
    allowSlotReorder: false,
    allowBlocks: false,
    allowFreeform: false,
    editableProperties: ["heading", "message"],
    editableSlots: [],
  },
  a11y: {
    landmark: "main",
    accessibleNameProperty: "heading",
    requiredAltSlots: [],
    requiresHeading: true,
  },
});

export const CERTIFIED_COMPONENT_DEFINITIONS = [
  siteHeader,
  siteFooter,
  hero,
  productGrid,
  productGallery,
  productInformation,
  collectionGrid,
  cart,
  searchResults,
  recommendations,
  richText,
  blogArticle,
  notFound,
] as const;

const libraryPayload = {
  kind: "component-library" as const,
  id: "storeblink-certified",
  version: "1.0.0",
  schemaVersion: 1,
  name: "StoreBlink Certified Commerce Components",
  components: Object.fromEntries(
    CERTIFIED_COMPONENT_DEFINITIONS.map((definition) => [definition.id, definition]),
  ),
};

export const STOREFRONT_CERTIFIED_COMPONENT_LIBRARY =
  adaptiveComponentLibrarySchema.parse({
    ...libraryPayload,
    integrity: artifactHashFor(libraryPayload),
  });
