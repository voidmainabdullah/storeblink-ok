import type { CSSProperties } from "react";
import type { JsonValue, RuntimeArtifact } from "@/adaptive-commerce/contracts";
import { commerceBindingEngine, type CommerceRuntimeData } from "@/adaptive-commerce/commerce";
import type {
  AdaptiveStorefrontCart,
  AdaptiveStorefrontNavigationItem,
  AdaptiveStorefrontPageContent,
  AdaptiveStorefrontProduct,
  RuntimeComponentReference,
} from "./types";

const jsonProduct = (product: AdaptiveStorefrontProduct): Record<string, JsonValue> => {
  const rawImages = Array.isArray(product.images)
    ? product.images.filter((value): value is string => typeof value === "string").slice(0, 24)
    : [];
  const media = [product.image_url, ...rawImages]
    .filter((value): value is string => Boolean(value))
    .filter((value, index, values) => values.indexOf(value) === index)
    .map((src) => ({ src, alt: product.name }));
  return {
    id: product.id,
    handle: product.handle || product.id,
    title: product.name,
    name: product.name,
    description: product.description ?? "",
    category: product.category ?? "",
    price: product.price_cents,
    compareAtPrice: product.original_price_cents ?? null,
    inventory: product.stock ?? null,
    media,
  };
};

export const createCommerceRuntimeData = (input: Readonly<{
  storeName: string;
  navigation: readonly AdaptiveStorefrontNavigationItem[];
  products: readonly AdaptiveStorefrontProduct[];
  currentProduct?: AdaptiveStorefrontProduct | null;
  collectionTitle?: string;
  page?: AdaptiveStorefrontPageContent | null;
  cart: AdaptiveStorefrontCart;
  searchQuery?: string;
}>): CommerceRuntimeData => {
  const products = input.products.map(jsonProduct);
  const current = input.currentProduct ? jsonProduct(input.currentProduct) : null;
  const lines = Object.entries(input.cart.quantities).flatMap(([id, quantity]) => {
    const product = input.products.find((candidate) => candidate.id === id) ??
      (input.currentProduct?.id === id ? input.currentProduct : undefined);
    if (!product) return [];
    return [{ ...jsonProduct(product), quantity, lineTotal: product.price_cents * quantity }];
  });
  return {
    store: {
      name: input.storeName,
      navigation: {
        primary: input.navigation.map(({ id, label, href }) => ({ id, label, href })),
        footer: input.navigation.map(({ id, label, href }) => ({ id, label, href })),
      },
    },
    product: {
      current,
    },
    collection: {
      featured: { products },
      current: { title: input.collectionTitle ?? "Collection", products },
      recommendations: { products: products.filter((product) => product.id !== current?.id).slice(0, 8) },
    },
    page: {
      current: {
        title: input.page?.title ?? "Page",
        body: input.page?.body ?? "",
      },
    },
    cart: {
      count: input.cart.count,
      lines,
      subtotal: lines.reduce((total, line) => total + Number(line.lineTotal), 0),
    },
    search: {
      query: input.searchQuery ?? "",
      items: products,
    },
  };
};

export const resolveRuntimeComponentProps = (
  artifact: RuntimeArtifact,
  reference: RuntimeComponentReference,
  data: CommerceRuntimeData,
): Readonly<Record<string, JsonValue>> => {
  const props: Record<string, JsonValue> = structuredClone(reference.properties);
  const plansById = new Map(artifact.bindingPlans.map((plan) => [plan.id, plan]));
  reference.bindingIds.forEach((bindingId) => {
    const binding = plansById.get(bindingId);
    if (!binding || binding.target.path !== reference.path) {
      throw new Error(`Compiled binding ${bindingId} is unavailable for ${reference.path}.`);
    }
    Object.assign(props, commerceBindingEngine.resolve(binding, data).props);
  });
  return props;
};

const cssTokenValue = (value: JsonValue): string | null => {
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  if (typeof value === "string" && !/[;{}<>]/.test(value)) return value;
  if (Array.isArray(value) && value.every((item) => typeof item === "string" || typeof item === "number")) {
    const joined = value.join(", ");
    return /[;{}<>]/.test(joined) ? null : joined;
  }
  return null;
};

export const runtimeTokenStyle = (artifact: RuntimeArtifact): CSSProperties => {
  const output: Record<string, string> = {};
  Object.entries(artifact.resolvedTokens).forEach(([address, value]) => {
    const separator = address.indexOf(":");
    const path = separator >= 0 ? address.slice(separator + 1) : address;
    if (!/^[a-z][a-z0-9-]*(?:\.[a-z][a-z0-9-]*)+$/.test(path)) return;
    const cssValue = cssTokenValue(value);
    if (cssValue !== null) output[`--sb-${path.replace(/\./g, "-")}`] = cssValue;
  });
  return output as CSSProperties;
};
