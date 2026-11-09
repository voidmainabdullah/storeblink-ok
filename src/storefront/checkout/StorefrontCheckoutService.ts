import { z } from "zod";
import {
  PublicSupabaseRestError,
  publicSupabaseRpc,
} from "@/platform/supabase/publicRest";

const customerSchema = z.object({
  name: z.string().trim().min(2, "Enter the customer's full name.").max(100),
  phone: z.string().trim().min(7, "Enter a valid phone number.").max(24),
  email: z.union([z.string().trim().email("Enter a valid email address."), z.literal("")]).optional(),
  address1: z.string().trim().min(5, "Enter the delivery address.").max(160),
  address2: z.string().trim().max(160).optional(),
  city: z.string().trim().min(2, "Enter the delivery city.").max(80),
  region: z.string().trim().max(80).optional(),
  postalCode: z.string().trim().max(24).optional(),
  country: z.string().trim().min(2, "Enter the delivery country.").max(80),
});

const checkoutSchema = z.object({
  storeId: z.string().uuid(),
  customer: customerSchema,
  lines: z.array(z.object({
    productId: z.string().uuid(),
    quantity: z.number().int().min(1).max(99),
  })).min(1, "Your cart is empty.").max(50),
  note: z.string().trim().max(1000).optional(),
  idempotencyKey: z.string().uuid(),
});

export type StorefrontCheckoutCustomer = z.input<typeof customerSchema>;
export type StorefrontCheckoutLine = {
  productId: string;
  quantity: number;
};
export type PlaceCodOrderInput = {
  storeId: string;
  customer: StorefrontCheckoutCustomer;
  lines: StorefrontCheckoutLine[];
  note?: string;
  idempotencyKey: string;
};
export type CodOrderConfirmation = {
  orderId: string;
  orderNumber: string;
  totalCents: number;
  status: "pending";
  paymentMethod: "cash_on_delivery";
};

type CheckoutGateway = (
  name: string,
  args: Record<string, unknown>,
) => Promise<{ data: unknown }>;

const responseSchema = z.object({
  order_id: z.string().uuid(),
  order_number: z.string().min(1),
  total_cents: z.coerce.number().int().nonnegative(),
  status: z.literal("pending"),
  payment_method: z.literal("cash_on_delivery"),
});

const userFacingCheckoutError = (error: unknown): Error => {
  if (!(error instanceof PublicSupabaseRestError)) {
    return new Error("The order could not be placed. Please try again.");
  }
  const safeMessages = [
    "Store is not accepting orders",
    "Cart contains an unavailable product",
    "A cart quantity is invalid",
    "A product does not have enough stock",
    "Cart total is invalid",
  ];
  const match = safeMessages.find((message) => error.message.includes(message));
  return new Error(match ?? "The order could not be placed. Please review the cart and try again.");
};

export class StorefrontCheckoutService {
  constructor(private readonly gateway: CheckoutGateway = publicSupabaseRpc) {}

  async placeCashOnDeliveryOrder(
    input: PlaceCodOrderInput,
  ): Promise<CodOrderConfirmation> {
    const parsed = checkoutSchema.parse(input);
    try {
      const result = await this.gateway("place_storefront_cod_order", {
        p_store_id: parsed.storeId,
        p_customer: {
          name: parsed.customer.name,
          phone: parsed.customer.phone,
          email: parsed.customer.email || null,
          address1: parsed.customer.address1,
          address2: parsed.customer.address2 || null,
          city: parsed.customer.city,
          region: parsed.customer.region || null,
          postalCode: parsed.customer.postalCode || null,
          country: parsed.customer.country,
        },
        p_lines: parsed.lines.map((line) => ({
          productId: line.productId,
          quantity: line.quantity,
        })),
        p_note: parsed.note || null,
        p_idempotency_key: parsed.idempotencyKey,
      });
      const response = responseSchema.parse(result.data);
      return {
        orderId: response.order_id,
        orderNumber: response.order_number,
        totalCents: response.total_cents,
        status: response.status,
        paymentMethod: response.payment_method,
      };
    } catch (error) {
      if (error instanceof z.ZodError) throw error;
      throw userFacingCheckoutError(error);
    }
  }
}

export const storefrontCheckoutService = new StorefrontCheckoutService();

export const createCheckoutIdempotencyKey = (): string => {
  const cryptoApi = globalThis.crypto;
  if (cryptoApi && typeof cryptoApi.randomUUID === "function") {
    return cryptoApi.randomUUID();
  }
  const bytes = new Uint8Array(16);
  if (cryptoApi && typeof cryptoApi.getRandomValues === "function") {
    cryptoApi.getRandomValues(bytes);
  } else {
    for (let index = 0; index < bytes.length; index += 1) {
      bytes[index] = Math.floor(Math.random() * 256);
    }
  }
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (value) => value.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
};
