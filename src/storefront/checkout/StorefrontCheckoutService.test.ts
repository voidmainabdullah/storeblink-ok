import { describe, expect, it, vi } from "vitest";
import { PublicSupabaseRestError } from "@/platform/supabase/publicRest";
import { StorefrontCheckoutService } from "./StorefrontCheckoutService";

const input = {
  storeId: "11111111-1111-4111-8111-111111111111",
  customer: {
    name: "Alex Morgan",
    phone: "+1 555 010 2000",
    email: "alex@example.com",
    address1: "20 Market Street",
    city: "Austin",
    country: "United States",
  },
  lines: [
    {
      productId: "22222222-2222-4222-8222-222222222222",
      quantity: 2,
    },
  ],
  idempotencyKey: "33333333-3333-4333-8333-333333333333",
};

describe("StorefrontCheckoutService", () => {
  it("submits a server-priced COD order through the public RPC", async () => {
    const gateway = vi.fn().mockResolvedValue({
      data: {
        order_id: "44444444-4444-4444-8444-444444444444",
        order_number: "SB-4444444444",
        total_cents: 51000,
        status: "pending",
        payment_method: "cash_on_delivery",
      },
    });
    const service = new StorefrontCheckoutService(gateway);

    await expect(service.placeCashOnDeliveryOrder(input)).resolves.toEqual({
      orderId: "44444444-4444-4444-8444-444444444444",
      orderNumber: "SB-4444444444",
      totalCents: 51000,
      status: "pending",
      paymentMethod: "cash_on_delivery",
    });
    expect(gateway).toHaveBeenCalledWith(
      "place_storefront_cod_order",
      expect.objectContaining({
        p_store_id: input.storeId,
        p_lines: input.lines,
        p_idempotency_key: input.idempotencyKey,
      }),
    );
  });

  it("maps safe stock errors and rejects invalid delivery data before transport", async () => {
    const gateway = vi
      .fn()
      .mockRejectedValue(new PublicSupabaseRestError("A product does not have enough stock", 400));
    const service = new StorefrontCheckoutService(gateway);

    await expect(service.placeCashOnDeliveryOrder(input)).rejects.toThrow(
      "A product does not have enough stock",
    );
    await expect(
      service.placeCashOnDeliveryOrder({
        ...input,
        customer: { ...input.customer, address1: "x" },
      }),
    ).rejects.toThrow("Enter the delivery address");
    expect(gateway).toHaveBeenCalledTimes(1);
  });
});
