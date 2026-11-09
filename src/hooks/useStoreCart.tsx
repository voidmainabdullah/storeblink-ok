import { useMemo, useSyncExternalStore } from "react";

export type StoreCartSnapshot = Readonly<Record<string, number>>;

export type StoreCartApi = Readonly<{
  cart: StoreCartSnapshot;
  add: (id: string, quantity?: number) => void;
  inc: (id: string) => void;
  dec: (id: string) => void;
  remove: (id: string) => void;
  setQty: (id: string, quantity: number) => void;
  clear: () => void;
  count: number;
}>;

type Listener = () => void;

const EMPTY_CART: StoreCartSnapshot = Object.freeze({});
const MAX_LINE_QUANTITY = 99;
const stores = new Map<string, CartStore>();

const keyFor = (slug: string) => `Storeblink:cart:${slug}`;

const normalizeCart = (value: unknown): StoreCartSnapshot => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return EMPTY_CART;
  const normalized: Record<string, number> = {};
  Object.entries(value as Record<string, unknown>)
    .slice(0, 50)
    .forEach(([id, quantity]) => {
      const safeId = id.trim();
      const safeQuantity = Math.min(
        MAX_LINE_QUANTITY,
        Math.max(0, Math.floor(Number(quantity))),
      );
      if (safeId && Number.isFinite(safeQuantity) && safeQuantity > 0) {
        normalized[safeId] = safeQuantity;
      }
    });
  return Object.keys(normalized).length ? Object.freeze(normalized) : EMPTY_CART;
};

class CartStore {
  private snapshot: StoreCartSnapshot = EMPTY_CART;
  private readonly listeners = new Set<Listener>();
  private listeningForStorage = false;

  constructor(private readonly slug: string) {
    this.snapshot = this.readPersisted();
  }

  getSnapshot = (): StoreCartSnapshot => this.snapshot;

  subscribe = (listener: Listener): (() => void) => {
    this.listeners.add(listener);
    this.ensureStorageListener();
    return () => this.listeners.delete(listener);
  };

  add = (id: string, quantity = 1): void => {
    this.setQty(id, (this.snapshot[id.trim()] ?? 0) + quantity);
  };

  setQty = (id: string, quantity: number): void => {
    const safeId = id.trim();
    if (!safeId) return;
    const safeQuantity = Math.min(
      MAX_LINE_QUANTITY,
      Math.max(0, Math.floor(Number(quantity))),
    );
    const next = { ...this.snapshot };
    if (!Number.isFinite(safeQuantity) || safeQuantity <= 0) delete next[safeId];
    else next[safeId] = safeQuantity;
    this.commit(next);
  };

  clear = (): void => this.commit({});

  private readPersisted(): StoreCartSnapshot {
    if (typeof window === "undefined") return EMPTY_CART;
    try {
      const raw = window.localStorage.getItem(keyFor(this.slug));
      return raw ? normalizeCart(JSON.parse(raw)) : EMPTY_CART;
    } catch {
      return EMPTY_CART;
    }
  }

  private commit(value: unknown): void {
    const next = normalizeCart(value);
    if (
      Object.keys(next).length === Object.keys(this.snapshot).length &&
      Object.entries(next).every(([id, quantity]) => this.snapshot[id] === quantity)
    ) return;
    this.snapshot = next;
    if (typeof window !== "undefined") {
      try {
        if (next === EMPTY_CART) window.localStorage.removeItem(keyFor(this.slug));
        else window.localStorage.setItem(keyFor(this.slug), JSON.stringify(next));
      } catch {
        // Storage can be unavailable in privacy modes; the in-memory cart remains usable.
      }
    }
    this.emit();
  }

  private ensureStorageListener(): void {
    if (this.listeningForStorage || typeof window === "undefined") return;
    this.listeningForStorage = true;
    window.addEventListener("storage", (event) => {
      if (event.key !== keyFor(this.slug)) return;
      try {
        this.snapshot = event.newValue
          ? normalizeCart(JSON.parse(event.newValue))
          : EMPTY_CART;
      } catch {
        this.snapshot = EMPTY_CART;
      }
      this.emit();
    });
  }

  private emit(): void {
    this.listeners.forEach((listener) => listener());
  }
}

const storeFor = (slug: string): CartStore => {
  const normalized = slug.trim().toLowerCase() || "unknown-store";
  const current = stores.get(normalized);
  if (current) return current;
  const store = new CartStore(normalized);
  stores.set(normalized, store);
  return store;
};

export const useStoreCart = (slug: string | undefined): StoreCartApi => {
  const store = useMemo(() => storeFor(slug ?? ""), [slug]);
  const cart = useSyncExternalStore(
    store.subscribe,
    store.getSnapshot,
    () => EMPTY_CART,
  );

  return useMemo(() => ({
    cart,
    add: store.add,
    inc: (id: string) => store.add(id, 1),
    dec: (id: string) => store.add(id, -1),
    remove: (id: string) => store.setQty(id, 0),
    setQty: store.setQty,
    clear: store.clear,
    count: Object.values(cart).reduce((total, quantity) => total + quantity, 0),
  }), [cart, store]);
};
