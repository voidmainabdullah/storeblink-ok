import { z } from "zod";
import type {
  JsonValue,
  RuntimeArtifact,
  StorefrontResourceType,
} from "@/adaptive-commerce/contracts";

const runtimeComponentReferenceSchema = z.object({
  path: z.string().min(3),
  regionSlot: z.string().min(1).optional(),
  component: z.object({
    id: z.string().min(1),
    version: z.string().min(1),
    variantId: z.string().min(1),
  }).strict(),
  properties: z.record(z.unknown()),
  slots: z.array(z.object({
    slotId: z.string().min(1),
    value: z.unknown(),
  }).strict()),
  bindingIds: z.array(z.string()),
  accessibility: z.unknown(),
  layout: z.object({
    mode: z.literal("certified-flow"),
    responsivePolicy: z.string().min(1),
    freeform: z.literal(false),
  }).strict(),
}).strict();

const runtimeRenderDocumentSchema = z.object({
  schemaVersion: z.literal(1),
  resourceType: z.enum([
    "home",
    "product",
    "collection",
    "page",
    "blog",
    "cart",
    "search",
    "404",
  ]),
  locale: z.string().min(2),
  currency: z.string().length(3),
  sections: z.array(runtimeComponentReferenceSchema),
  globalRegionPaths: z.array(z.string().min(3)),
  content: z.unknown(),
  layout: z.unknown(),
  responsive: z.unknown(),
}).strict();

export type RuntimeComponentReference = Readonly<{
  path: string;
  regionSlot?: string;
  component: Readonly<{ id: string; version: string; variantId: string }>;
  properties: Readonly<Record<string, JsonValue>>;
  slots: readonly Readonly<{ slotId: string; value: JsonValue }>[];
  bindingIds: readonly string[];
  accessibility: JsonValue;
  layout: Readonly<{
    mode: "certified-flow";
    responsivePolicy: string;
    freeform: false;
  }>;
}>;

export type RuntimeRenderDocument = Readonly<{
  schemaVersion: 1;
  resourceType: StorefrontResourceType;
  locale: string;
  currency: string;
  sections: readonly RuntimeComponentReference[];
  globalRegionPaths: readonly string[];
  content: JsonValue;
  layout: JsonValue;
  responsive: JsonValue;
}>;

export const parseRuntimeRenderDocument = (
  artifact: RuntimeArtifact,
  resourceType: StorefrontResourceType,
): RuntimeRenderDocument => {
  const route = artifact.routes[resourceType];
  if (!route || route.resourceType !== resourceType) {
    throw new AdaptiveRuntimeRenderError(
      "ADAPTIVE_ROUTE_UNAVAILABLE",
      `The compiled ${resourceType} route is unavailable.`,
    );
  }
  const parsed = runtimeRenderDocumentSchema.safeParse(route.document);
  if (!parsed.success || parsed.data.resourceType !== resourceType) {
    throw new AdaptiveRuntimeRenderError(
      "ADAPTIVE_ROUTE_INVALID",
      `The compiled ${resourceType} route cannot be rendered safely.`,
    );
  }
  return parsed.data as RuntimeRenderDocument;
};

export const parseRuntimeGlobalReference = (
  artifact: RuntimeArtifact,
  path: string,
): RuntimeComponentReference => {
  const parsed = runtimeComponentReferenceSchema.safeParse(artifact.globals[path]);
  if (!parsed.success || parsed.data.path !== path) {
    throw new AdaptiveRuntimeRenderError(
      "ADAPTIVE_GLOBAL_INVALID",
      `The compiled global region ${path} cannot be rendered safely.`,
    );
  }
  return parsed.data as RuntimeComponentReference;
};

export class AdaptiveRuntimeRenderError extends Error {
  constructor(readonly code: string, message: string) {
    super(message);
    this.name = "AdaptiveRuntimeRenderError";
  }
}

export type AdaptiveStorefrontProduct = Readonly<{
  id: string;
  handle?: string | null;
  name: string;
  description?: string | null;
  category?: string | null;
  image_url?: string | null;
  images?: unknown;
  price_cents: number;
  original_price_cents?: number | null;
  stock?: number | null;
}>;

export type AdaptiveStorefrontNavigationItem = Readonly<{
  id: string;
  label: string;
  href: string;
}>;

export type AdaptiveStorefrontPageContent = Readonly<{
  title: string;
  body: string;
}>;

export type AdaptiveStorefrontCart = Readonly<{
  quantities: Readonly<Record<string, number>>;
  count: number;
  add: (productId: string, quantity?: number) => void;
  checkout: () => void;
  increment?: (productId: string) => void;
  decrement?: (productId: string) => void;
  remove?: (productId: string) => void;
}>;
