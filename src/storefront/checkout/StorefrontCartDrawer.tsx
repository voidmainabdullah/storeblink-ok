import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
} from "react";
import { CheckCircle2, Minus, Plus, ShoppingBag, Trash2 } from "lucide-react";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import type { StoreCartApi } from "@/hooks/useStoreCart";
import type { StorefrontProduct } from "@/storefront/data-resolvers";
import {
  createCheckoutIdempotencyKey,
  storefrontCheckoutService,
  type CodOrderConfirmation,
  type StorefrontCheckoutCustomer,
} from "./StorefrontCheckoutService";

type StorefrontCartDrawerProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  storeId: string;
  storeName: string;
  accent: string;
  currency?: string;
  products: readonly StorefrontProduct[];
  loadProduct: (productId: string) => Promise<StorefrontProduct | null>;
  cart: StoreCartApi;
  checkoutEnabled?: boolean;
};

const emptyCustomer = (): StorefrontCheckoutCustomer => ({
  name: "",
  phone: "",
  email: "",
  address1: "",
  address2: "",
  city: "",
  region: "",
  postalCode: "",
  country: "",
});

const productRecord = (products: readonly StorefrontProduct[]) =>
  Object.fromEntries(products.map((product) => [product.id, product]));

export const StorefrontCartDrawer = ({
  open,
  onOpenChange,
  storeId,
  storeName,
  accent,
  currency = "USD",
  products,
  loadProduct,
  cart,
  checkoutEnabled = true,
}: StorefrontCartDrawerProps) => {
  const [resolvedProducts, setResolvedProducts] = useState<Record<string, StorefrontProduct>>(
    () => productRecord(products),
  );
  const [loadingProducts, setLoadingProducts] = useState(false);
  const [unavailableProductIds, setUnavailableProductIds] = useState<Set<string>>(
    () => new Set(),
  );
  const [customer, setCustomer] = useState<StorefrontCheckoutCustomer>(emptyCustomer);
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmation, setConfirmation] = useState<CodOrderConfirmation | null>(null);
  const idempotencyKey = useRef(createCheckoutIdempotencyKey());

  const cartIds = useMemo(() => Object.keys(cart.cart), [cart.cart]);
  const cartIdentity = cartIds.join("|");

  useEffect(() => {
    setResolvedProducts((current) => ({ ...current, ...productRecord(products) }));
  }, [products]);

  useEffect(() => {
    if (!open) return;
    const missingIds = cartIds.filter(
      (id) => !resolvedProducts[id] && !unavailableProductIds.has(id),
    );
    if (!missingIds.length) return;
    let active = true;
    setLoadingProducts(true);
    void Promise.all(missingIds.map(async (id) => [id, await loadProduct(id)] as const))
      .then((entries) => {
        if (!active) return;
        const unavailable = entries
          .filter((entry) => !entry[1])
          .map(([id]) => id);
        setResolvedProducts((current) => ({
          ...current,
          ...Object.fromEntries(
            entries.filter((entry): entry is readonly [string, StorefrontProduct] => Boolean(entry[1])),
          ),
        }));
        if (unavailable.length) {
          setUnavailableProductIds((current) => new Set([...current, ...unavailable]));
        }
      })
      .finally(() => {
        if (active) setLoadingProducts(false);
      });
    return () => {
      active = false;
    };
  }, [cartIdentity, cartIds, loadProduct, open, resolvedProducts, unavailableProductIds]);

  useEffect(() => {
    if (open) return;
    const timer = window.setTimeout(() => {
      setError(null);
      setConfirmation(null);
      setSubmitting(false);
      setUnavailableProductIds(new Set());
      idempotencyKey.current = createCheckoutIdempotencyKey();
    }, 250);
    return () => window.clearTimeout(timer);
  }, [open]);

  const lines = cartIds.flatMap((id) => {
    const product = resolvedProducts[id];
    return product ? [{ product, quantity: cart.cart[id] }] : [];
  });
  const unavailableIds = cartIds.filter((id) => unavailableProductIds.has(id));
  const subtotal = lines.reduce(
    (total, line) => total + line.product.price_cents * line.quantity,
    0,
  );
  const money = useMemo(
    () => new Intl.NumberFormat(undefined, { style: "currency", currency }),
    [currency],
  );

  const updateCustomer = (key: keyof StorefrontCheckoutCustomer, value: string) => {
    setCustomer((current) => ({ ...current, [key]: value }));
  };

  const submitOrder = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    if (loadingProducts || unavailableIds.length) {
      setError("Remove unavailable products before placing the order.");
      return;
    }
    setSubmitting(true);
    try {
      const result = await storefrontCheckoutService.placeCashOnDeliveryOrder({
        storeId,
        customer,
        lines: lines.map((line) => ({
          productId: line.product.id,
          quantity: line.quantity,
        })),
        note,
        idempotencyKey: idempotencyKey.current,
      });
      cart.clear();
      setConfirmation(result);
      idempotencyKey.current = createCheckoutIdempotencyKey();
    } catch (checkoutError) {
      if (checkoutError instanceof z.ZodError) {
        setError(checkoutError.issues[0]?.message ?? "Review the delivery details.");
      } else {
        setError(checkoutError instanceof Error ? checkoutError.message : "The order could not be placed.");
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="flex h-full w-full flex-col overflow-y-auto p-0 sm:max-w-lg">
        <SheetHeader className="border-b px-5 py-5 pr-12 text-left">
          <SheetTitle>{confirmation ? "Order confirmed" : "Your cart"}</SheetTitle>
          <SheetDescription>
            {confirmation
              ? `${storeName} has received your cash-on-delivery order.`
              : "Review your items and enter the delivery details."}
          </SheetDescription>
        </SheetHeader>

        {confirmation ? (
          <div className="flex flex-1 flex-col items-center justify-center px-6 py-12 text-center">
            <CheckCircle2 size={48} style={{ color: accent }} />
            <h2 className="mt-5 text-2xl font-semibold">Thank you for your order</h2>
            <p className="mt-2 max-w-sm text-sm leading-6 text-muted-foreground">
              Pay {money.format(confirmation.totalCents / 100)} in cash when the order is delivered.
            </p>
            <div className="mt-6 w-full max-w-sm rounded-lg border bg-muted/30 p-4 text-left">
              <div className="text-xs uppercase tracking-wide text-muted-foreground">Order reference</div>
              <div className="mt-1 font-mono text-base font-semibold">{confirmation.orderNumber}</div>
            </div>
            <Button className="mt-6 w-full max-w-sm" style={{ backgroundColor: accent }} onClick={() => onOpenChange(false)}>
              Continue shopping
            </Button>
          </div>
        ) : cartIds.length === 0 ? (
          <div className="flex flex-1 flex-col items-center justify-center px-6 py-12 text-center">
            <ShoppingBag size={40} className="text-muted-foreground" />
            <h2 className="mt-4 text-xl font-semibold">Your cart is empty</h2>
            <p className="mt-2 text-sm text-muted-foreground">Add a product to start an order.</p>
            <Button className="mt-6" variant="outline" onClick={() => onOpenChange(false)}>
              Continue shopping
            </Button>
          </div>
        ) : (
          <form className="flex flex-1 flex-col" onSubmit={submitOrder}>
            <div className="space-y-3 border-b px-5 py-5">
              {lines.map(({ product, quantity }) => {
                const maximum = product.stock === null ? 99 : Math.max(1, Math.min(99, product.stock));
                return (
                  <div key={product.id} className="grid grid-cols-[72px_minmax(0,1fr)_auto] gap-3 border-b pb-3 last:border-0 last:pb-0">
                    <div className="h-[72px] overflow-hidden rounded-md bg-muted">
                      {product.image_url ? (
                        <img src={product.image_url} alt="" className="h-full w-full object-cover" />
                      ) : null}
                    </div>
                    <div className="min-w-0">
                      <div className="truncate text-sm font-medium">{product.name}</div>
                      <div className="mt-1 text-sm text-muted-foreground">{money.format(product.price_cents / 100)}</div>
                      <div className="mt-2 inline-flex h-8 items-center rounded-md border">
                        <button type="button" className="grid h-8 w-8 place-items-center" aria-label={`Decrease ${product.name} quantity`} onClick={() => cart.setQty(product.id, quantity - 1)}>
                          <Minus size={13} />
                        </button>
                        <span className="w-8 text-center text-xs font-medium">{quantity}</span>
                        <button type="button" className="grid h-8 w-8 place-items-center disabled:opacity-40" aria-label={`Increase ${product.name} quantity`} disabled={quantity >= maximum} onClick={() => cart.setQty(product.id, quantity + 1)}>
                          <Plus size={13} />
                        </button>
                      </div>
                    </div>
                    <button type="button" aria-label={`Remove ${product.name}`} className="grid h-9 w-9 place-items-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground" onClick={() => cart.remove(product.id)}>
                      <Trash2 size={15} />
                    </button>
                  </div>
                );
              })}
              {unavailableIds.map((id) => (
                <div key={id} className="flex items-center justify-between gap-3 rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm">
                  <span>This product is no longer available.</span>
                  <Button type="button" size="sm" variant="ghost" onClick={() => cart.remove(id)}>Remove</Button>
                </div>
              ))}
            </div>

            <div className="space-y-4 px-5 py-5">
              <div>
                <h2 className="text-base font-semibold">Delivery details</h2>
                <p className="mt-1 text-xs text-muted-foreground">Payment method: Cash on delivery</p>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5 sm:col-span-2">
                  <Label htmlFor="checkout-name">Full name</Label>
                  <Input id="checkout-name" autoComplete="name" value={customer.name} onChange={(event) => updateCustomer("name", event.target.value)} required />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="checkout-phone">Phone</Label>
                  <Input id="checkout-phone" type="tel" autoComplete="tel" value={customer.phone} onChange={(event) => updateCustomer("phone", event.target.value)} required />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="checkout-email">Email (optional)</Label>
                  <Input id="checkout-email" type="email" autoComplete="email" value={customer.email} onChange={(event) => updateCustomer("email", event.target.value)} />
                </div>
                <div className="space-y-1.5 sm:col-span-2">
                  <Label htmlFor="checkout-address-1">Address</Label>
                  <Input id="checkout-address-1" autoComplete="address-line1" value={customer.address1} onChange={(event) => updateCustomer("address1", event.target.value)} required />
                </div>
                <div className="space-y-1.5 sm:col-span-2">
                  <Label htmlFor="checkout-address-2">Apartment, suite, etc. (optional)</Label>
                  <Input id="checkout-address-2" autoComplete="address-line2" value={customer.address2} onChange={(event) => updateCustomer("address2", event.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="checkout-city">City</Label>
                  <Input id="checkout-city" autoComplete="address-level2" value={customer.city} onChange={(event) => updateCustomer("city", event.target.value)} required />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="checkout-region">State / region</Label>
                  <Input id="checkout-region" autoComplete="address-level1" value={customer.region} onChange={(event) => updateCustomer("region", event.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="checkout-postal">Postal code</Label>
                  <Input id="checkout-postal" autoComplete="postal-code" value={customer.postalCode} onChange={(event) => updateCustomer("postalCode", event.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="checkout-country">Country</Label>
                  <Input id="checkout-country" autoComplete="country-name" value={customer.country} onChange={(event) => updateCustomer("country", event.target.value)} required />
                </div>
                <div className="space-y-1.5 sm:col-span-2">
                  <Label htmlFor="checkout-note">Delivery note (optional)</Label>
                  <Textarea id="checkout-note" value={note} onChange={(event) => setNote(event.target.value)} maxLength={1000} />
                </div>
              </div>
              {error ? <div role="alert" className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">{error}</div> : null}
            </div>

            <div className="sticky bottom-0 mt-auto border-t bg-background px-5 py-4">
              <div className="mb-3 flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Subtotal</span>
                <span className="text-lg font-semibold">{money.format(subtotal / 100)}</span>
              </div>
              <Button type="submit" className="w-full" size="lg" disabled={!checkoutEnabled || submitting || loadingProducts || unavailableIds.length > 0} style={{ backgroundColor: accent }}>
                {submitting ? "Placing order..." : checkoutEnabled ? "Place cash-on-delivery order" : "Checkout disabled in preview"}
              </Button>
              <p className="mt-2 text-center text-[11px] leading-4 text-muted-foreground">No online payment is collected. Pay the courier when your order arrives.</p>
            </div>
          </form>
        )}
      </SheetContent>
    </Sheet>
  );
};
