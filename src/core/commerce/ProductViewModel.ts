import type { StorefrontProduct } from "@/storefront/data-resolvers";

export type Money = {
  amount: number;
  currency: string;
  formatted: string;
};

export type ProductCardViewModel = {
  id: string;
  title: string;
  handle: string;
  url: string;
  primaryImage: { url: string; alt: string } | null;
  price: Money;
  compareAtPrice?: Money;
  available: boolean;
  badges: string[];
  quickAddSupported: boolean;
  quickViewSupported: boolean;
};

const money = (cents: number, currency: string): Money => ({
  amount: cents,
  currency,
  formatted: new Intl.NumberFormat(undefined, {
    style: "currency",
    currency,
  }).format(cents / 100),
});

export const createProductCardViewModel = (
  product: StorefrontProduct,
  storeSlug: string,
  currency = "USD",
): ProductCardViewModel => ({
  id: product.id,
  title: product.name,
  handle: product.handle?.trim() || product.id,
  url: `/store/${encodeURIComponent(storeSlug)}/products/${encodeURIComponent(
    product.handle?.trim() || product.id,
  )}`,
  primaryImage: product.image_url ? { url: product.image_url, alt: product.name } : null,
  price: money(product.price_cents, currency),
  compareAtPrice:
    product.original_price_cents && product.original_price_cents > product.price_cents
      ? money(product.original_price_cents, currency)
      : undefined,
  available: product.stock === null || product.stock > 0,
  badges: [product.badge, product.sale_tag].filter((value): value is string => Boolean(value)),
  quickAddSupported: product.stock === null || product.stock > 0,
  quickViewSupported: true,
});
