import { z } from "zod";
import {
  exactVersionSchema,
  integrityHashSchema,
  packageIdSchema,
  versionedPackageRefSchema,
} from "@/adaptive-commerce/contracts";

export const APP_BLOCK_PROTOCOL_VERSION = 1 as const;
export const APP_BLOCK_HOST_SCOPE = "storeblink:app-block:host" as const;
export const APP_BLOCK_FRAME_SCOPE = "storeblink:app-block:frame" as const;

export const EXTENSION_TRUST_LEVELS = [
  "declarative",
  "sandboxed",
  "reviewed-partner",
  "platform",
] as const;
export const extensionTrustLevelSchema = z.enum(EXTENSION_TRUST_LEVELS);

export const EXTENSION_CAPABILITIES = [
  "theme/content.read",
  "theme/navigation.request",
  "commerce/products.read",
  "commerce/cart.read",
  "commerce/cart.add",
  "commerce/cart.open",
  "app/render",
  "app/frame.resize",
  "app/telemetry.emit",
  "merchant/settings.read",
  "platform/compiled-react",
] as const;
export const extensionCapabilitySchema = z.enum(EXTENSION_CAPABILITIES);

export const EXTENSION_NAMESPACE_ROOTS = [
  "platform",
  "commerce",
  "theme",
  "app",
  "merchant",
] as const;
export const extensionNamespaceSchema = z.string().regex(
  /^(?:platform|commerce|theme|app|merchant)\/[a-z0-9]+(?:-[a-z0-9]+)*(?:\/[a-z0-9]+(?:-[a-z0-9]+)*)*$/,
  "Extension namespace is invalid.",
);

export const APP_BLOCK_SLOTS = [
  "product-information/extra-content",
  "section/extra-content",
  "cart/summary-after",
  "global/footer-after",
] as const;
export const appBlockSlotSchema = z.enum(APP_BLOCK_SLOTS);

export const appBlockQuotaSchema = z.object({
  maxBlocks: z.number().int().min(0).max(16),
  maxMessageBytes: z.number().int().min(512).max(65_536),
  maxDataBytes: z.number().int().min(512).max(131_072),
  maxActionsPerMinute: z.number().int().min(0).max(120),
  maxViewElements: z.number().int().min(1).max(100),
}).strict();

export const DEFAULT_APP_BLOCK_QUOTAS = Object.freeze({
  maxBlocks: 4,
  maxMessageBytes: 16_384,
  maxDataBytes: 32_768,
  maxActionsPerMinute: 30,
  maxViewElements: 40,
});

export const appBlockDataPathSchema = z.enum([
  "store.name",
  "store.currency",
  "cart.itemCount",
  "product.id",
  "product.title",
  "product.price",
]);

const viewKeySchema = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
const internalNavigationPathSchema = z.string()
  .regex(/^\/(?!\/)(?!.*\\)[^\s]*$/, "Navigation must use an internal path without backslashes.")
  .max(2_048);

export const appBlockViewElementSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("text"),
    key: viewKeySchema,
    text: z.string().max(5_000),
    emphasis: z.enum(["heading", "body", "muted"]),
  }).strict(),
  z.object({
    kind: z.literal("data"),
    key: viewKeySchema,
    label: z.string().min(1).max(120),
    path: appBlockDataPathSchema,
  }).strict(),
  z.object({
    kind: z.literal("action"),
    key: viewKeySchema,
    label: z.string().min(1).max(120),
    action: z.enum(["add-to-cart", "open-cart", "view-product", "navigate"]),
    productId: z.string().min(1).max(128).nullable(),
    quantity: z.number().int().min(1).max(99).nullable(),
    path: internalNavigationPathSchema.nullable(),
  }).strict(),
]);

export const appBlockViewSchema = z.object({
  ariaLabel: z.string().min(1).max(160),
  elements: z.array(appBlockViewElementSchema).max(100),
}).strict().superRefine((value, context) => {
  const keys = new Set<string>();
  value.elements.forEach((element, index) => {
    if (keys.has(element.key)) context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["elements", index, "key"],
      message: `Duplicate view element key ${element.key}.`,
    });
    keys.add(element.key);
    if (element.kind !== "action") return;
    const payloadValid = element.action === "add-to-cart"
      ? Boolean(element.productId && element.quantity && !element.path)
      : element.action === "open-cart"
        ? !element.productId && !element.quantity && !element.path
        : element.action === "view-product"
          ? Boolean(element.productId && !element.quantity && !element.path)
          : Boolean(element.path && !element.productId && !element.quantity);
    if (!payloadValid) context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["elements", index],
      message: `${element.action} contains an invalid mediated-action payload.`,
    });
  });
});

export const appBlockDefinitionSchema = z.object({
  id: packageIdSchema,
  namespace: extensionNamespaceSchema,
  protocolVersion: z.literal(APP_BLOCK_PROTOCOL_VERSION),
  slots: z.array(appBlockSlotSchema).min(1),
  requiredCapabilities: z.array(extensionCapabilitySchema),
  view: appBlockViewSchema,
}).strict();

const extensionAssetSchema = z.object({
  id: packageIdSchema,
  type: z.enum(["image", "svg", "font", "other"]),
  path: z.string().regex(/^assets\/[a-zA-Z0-9._/-]+$/),
  integrity: integrityHashSchema,
}).strict().superRefine((value, context) => {
  const segments = value.path.split("/");
  if (
    segments.some((segment) => segment === ".." || segment === "." || segment.length === 0) ||
    value.path.includes("//")
  ) context.addIssue({
    code: z.ZodIssueCode.custom,
    path: ["path"],
    message: "Extension assets must stay inside their package assets directory.",
  });
});

export const thirdPartyExtensionManifestSchema = z.object({
  kind: z.literal("storeblink-extension"),
  schemaVersion: z.literal(1),
  id: packageIdSchema,
  version: exactVersionSchema,
  publisherId: packageIdSchema,
  name: z.string().min(1).max(120),
  packageType: z.enum(["theme", "app"]),
  trustLevel: extensionTrustLevelSchema,
  namespace: extensionNamespaceSchema,
  requestedCapabilities: z.array(extensionCapabilitySchema),
  grantedCapabilities: z.array(extensionCapabilitySchema),
  requestedQuotas: appBlockQuotaSchema,
  compiledReact: z.boolean(),
  storeKit: versionedPackageRefSchema.nullable(),
  appBlocks: z.array(appBlockDefinitionSchema),
  assets: z.array(extensionAssetSchema),
}).strict().superRefine((value, context) => {
  const unique = (items: readonly string[], path: string) => {
    const seen = new Set<string>();
    items.forEach((item, index) => {
      if (seen.has(item)) context.addIssue({
        code: z.ZodIssueCode.custom,
        path: [path, index],
        message: `Duplicate ${path} entry ${item}.`,
      });
      seen.add(item);
    });
    return seen;
  };
  const requested = unique(value.requestedCapabilities, "requestedCapabilities");
  unique(value.grantedCapabilities, "grantedCapabilities").forEach((capability) => {
    if (!requested.has(capability)) context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["grantedCapabilities"],
      message: `Granted capability ${capability} was not requested.`,
    });
  });
  unique(value.appBlocks.map((block) => block.id), "appBlocks");
  unique(value.assets.map((asset) => asset.id), "assets");
  if (value.packageType === "theme" && !value.storeKit) context.addIssue({
    code: z.ZodIssueCode.custom,
    path: ["storeKit"],
    message: "Theme extensions require an exact StoreKit reference.",
  });
  if (value.packageType === "app" && value.storeKit) context.addIssue({
    code: z.ZodIssueCode.custom,
    path: ["storeKit"],
    message: "App extensions cannot own a StoreKit.",
  });
});

export const extensionGrantSchema = z.object({
  kind: z.literal("storeblink-extension-grant"),
  schemaVersion: z.literal(1),
  extensionId: packageIdSchema,
  extensionVersion: exactVersionSchema,
  trustLevel: extensionTrustLevelSchema,
  grantedCapabilities: z.array(extensionCapabilitySchema),
  quotas: appBlockQuotaSchema,
  status: z.enum(["active", "revoked"]),
  issuedAt: z.string().datetime(),
  expiresAt: z.string().datetime().nullable(),
  revokedAt: z.string().datetime().nullable(),
  revocationReason: z.string().min(1).max(500).nullable(),
}).strict().superRefine((value, context) => {
  const issuedAt = new Date(value.issuedAt).getTime();
  if (new Set(value.grantedCapabilities).size !== value.grantedCapabilities.length) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["grantedCapabilities"], message: "Grant contains duplicate capabilities." });
  }
  if (value.expiresAt && new Date(value.expiresAt).getTime() <= issuedAt) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["expiresAt"], message: "Grant expiry must be after issuance." });
  }
  if (value.revokedAt && new Date(value.revokedAt).getTime() < issuedAt) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["revokedAt"], message: "Grant revocation cannot predate issuance." });
  }
  if (value.status === "revoked" && (!value.revokedAt || !value.revocationReason)) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "Revoked grants require time and reason." });
  }
  if (value.status === "active" && (value.revokedAt || value.revocationReason)) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "Active grants cannot contain revocation details." });
  }
});

export const appBlockStoreDataSchema = z.object({
  name: z.string().min(1).max(160),
  currency: z.string().regex(/^[A-Z]{3}$/),
}).strict();
export const appBlockProductDataSchema = z.object({
  id: z.string().min(1).max(128),
  title: z.string().min(1).max(500),
  price: z.string().min(1).max(80),
}).strict();
export const appBlockDataProjectionSchema = z.object({
  store: appBlockStoreDataSchema.nullable(),
  product: appBlockProductDataSchema.nullable(),
  products: z.array(appBlockProductDataSchema).max(50),
  cart: z.object({ itemCount: z.number().int().nonnegative().max(9_999) }).strict().nullable(),
  merchantSettings: z.record(z.union([z.string(), z.number(), z.boolean(), z.null()])),
}).strict();

export const appBlockHostMessageSchema = z.object({
  scope: z.literal(APP_BLOCK_HOST_SCOPE),
  protocolVersion: z.literal(APP_BLOCK_PROTOCOL_VERSION),
  token: z.string().min(32).max(200),
  type: z.literal("host:init"),
  block: appBlockDefinitionSchema,
  data: appBlockDataProjectionSchema,
}).strict();

export const appBlockFrameMessageSchema = z.discriminatedUnion("type", [
  z.object({
    scope: z.literal(APP_BLOCK_FRAME_SCOPE),
    protocolVersion: z.literal(APP_BLOCK_PROTOCOL_VERSION),
    token: z.string().min(32).max(200),
    type: z.literal("frame:ready"),
  }).strict(),
  z.object({
    scope: z.literal(APP_BLOCK_FRAME_SCOPE),
    protocolVersion: z.literal(APP_BLOCK_PROTOCOL_VERSION),
    token: z.string().min(32).max(200),
    type: z.literal("frame:rendered"),
  }).strict(),
  z.object({
    scope: z.literal(APP_BLOCK_FRAME_SCOPE),
    protocolVersion: z.literal(APP_BLOCK_PROTOCOL_VERSION),
    token: z.string().min(32).max(200),
    type: z.literal("frame:error"),
    message: z.string().min(1).max(500),
  }).strict(),
  z.object({
    scope: z.literal(APP_BLOCK_FRAME_SCOPE),
    protocolVersion: z.literal(APP_BLOCK_PROTOCOL_VERSION),
    token: z.string().min(32).max(200),
    type: z.literal("frame:resize"),
    height: z.number().int().min(1).max(4_096),
  }).strict(),
  z.object({
    scope: z.literal(APP_BLOCK_FRAME_SCOPE),
    protocolVersion: z.literal(APP_BLOCK_PROTOCOL_VERSION),
    token: z.string().min(32).max(200),
    type: z.literal("frame:action"),
    action: z.enum(["add-to-cart", "open-cart", "view-product", "navigate"]),
    productId: z.string().min(1).max(128).nullable(),
    quantity: z.number().int().min(1).max(99).nullable(),
    path: internalNavigationPathSchema.nullable(),
  }).strict(),
]).superRefine((message, context) => {
  if (message.type !== "frame:action") return;
  const payloadValid = message.action === "add-to-cart"
    ? Boolean(message.productId && message.quantity && !message.path)
    : message.action === "open-cart"
      ? !message.productId && !message.quantity && !message.path
      : message.action === "view-product"
        ? Boolean(message.productId && !message.quantity && !message.path)
        : Boolean(message.path && !message.productId && !message.quantity);
  if (!payloadValid) context.addIssue({
    code: z.ZodIssueCode.custom,
    path: ["action"],
    message: `${message.action} contains an invalid mediated-action payload.`,
  });
});

export type ExtensionTrustLevel = z.infer<typeof extensionTrustLevelSchema>;
export type ExtensionCapability = z.infer<typeof extensionCapabilitySchema>;
export type AppBlockQuota = z.infer<typeof appBlockQuotaSchema>;
export type AppBlockDefinition = z.infer<typeof appBlockDefinitionSchema>;
export type ThirdPartyExtensionManifest = z.infer<typeof thirdPartyExtensionManifestSchema>;
export type ExtensionGrant = z.infer<typeof extensionGrantSchema>;
export type AppBlockDataProjection = z.infer<typeof appBlockDataProjectionSchema>;
export type AppBlockHostMessage = z.infer<typeof appBlockHostMessageSchema>;
export type AppBlockFrameMessage = z.infer<typeof appBlockFrameMessageSchema>;
