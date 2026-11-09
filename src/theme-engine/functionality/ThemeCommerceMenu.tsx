import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronRight, Search, X } from "lucide-react";
import type { StorefrontProduct } from "@/storefront/data-resolvers";

export type ThemeCommerceMenuMode = "search" | "categories";

type ThemeCommerceMenuProps = {
  mode: ThemeCommerceMenuMode | null;
  products: readonly StorefrontProduct[];
  maximumSuggestions: number;
  accent: string;
  onClose: () => void;
  onBrowse: (query: string, category: string) => void;
  onProduct: (productId: string) => void;
};

const normalized = (value: string): string => value.trim().toLocaleLowerCase();

export const ThemeCommerceMenu = ({
  mode,
  products,
  maximumSuggestions,
  accent,
  onClose,
  onBrowse,
  onProduct,
}: ThemeCommerceMenuProps) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("");
  const categories = useMemo(() => Array.from(new Set(products
    .map((product) => product.category?.trim())
    .filter((value): value is string => Boolean(value))))
    .sort((left, right) => left.localeCompare(right)), [products]);
  const suggestions = useMemo(() => {
    const needle = normalized(query);
    return products.filter((product) => {
      if (category && normalized(product.category ?? "") !== normalized(category)) return false;
      if (!needle) return true;
      return [product.name, product.category ?? "", product.description ?? ""]
        .some((value) => normalized(value).includes(needle));
    }).slice(0, maximumSuggestions);
  }, [category, maximumSuggestions, products, query]);

  useEffect(() => {
    if (!mode) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const timer = window.setTimeout(() => inputRef.current?.focus(), 0);
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [mode, onClose]);

  useEffect(() => {
    if (mode) return;
    setQuery("");
    setCategory("");
  }, [mode]);

  if (!mode) return null;

  const submit = () => onBrowse(query.trim(), category);

  return (
    <div
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 2147483000,
        background: "rgba(0,0,0,.54)",
        display: "flex",
        justifyContent: "center",
        alignItems: "flex-start",
        padding: "clamp(16px, 8vh, 72px) 16px 16px",
      }}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-label={mode === "search" ? "Search products" : "Browse categories"}
        style={{
          width: "min(720px, 100%)",
          maxHeight: "min(760px, calc(100vh - 32px))",
          overflow: "auto",
          background: "#ffffff",
          color: "#111111",
          borderRadius: 8,
          boxShadow: "0 28px 80px rgba(0,0,0,.28)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "18px 20px", borderBottom: "1px solid #e5e5e5" }}>
          <h2 style={{ margin: 0, font: "600 18px/1.3 Inter, system-ui, sans-serif" }}>
            {mode === "search" ? "Search products" : "Shop by category"}
          </h2>
          <button type="button" onClick={onClose} aria-label="Close" style={{ width: 40, height: 40, display: "grid", placeItems: "center", border: 0, background: "transparent", cursor: "pointer" }}>
            <X size={20} />
          </button>
        </div>

        <form onSubmit={(event) => { event.preventDefault(); submit(); }} style={{ padding: 20 }}>
          <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) minmax(150px,220px)", gap: 10 }}>
            <label style={{ position: "relative", display: "block" }}>
              <Search size={18} aria-hidden="true" style={{ position: "absolute", left: 14, top: "50%", transform: "translateY(-50%)", color: "#666" }} />
              <input
                ref={inputRef}
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search by product, category, or description"
                maxLength={120}
                style={{ width: "100%", height: 48, border: "1px solid #cfcfcf", borderRadius: 6, padding: "0 14px 0 42px", font: "400 14px/1 Inter, system-ui, sans-serif", outlineColor: accent }}
              />
            </label>
            <select
              aria-label="Product category"
              value={category}
              onChange={(event) => setCategory(event.target.value)}
              style={{ width: "100%", height: 48, border: "1px solid #cfcfcf", borderRadius: 6, padding: "0 12px", background: "#fff", font: "500 14px/1 Inter, system-ui, sans-serif", outlineColor: accent }}
            >
              <option value="">All categories</option>
              {categories.map((value) => <option key={value} value={value}>{value}</option>)}
            </select>
          </div>

          <div aria-label="Category shortcuts" style={{ display: "flex", gap: 8, overflowX: "auto", padding: "14px 0 4px" }}>
            <button type="button" onClick={() => setCategory("")} aria-pressed={!category} style={{ flex: "0 0 auto", minHeight: 38, borderRadius: 999, border: "1px solid #cfcfcf", padding: "0 14px", background: !category ? accent : "#fff", color: !category ? "#fff" : "#111", cursor: "pointer" }}>All</button>
            {categories.map((value) => (
              <button key={value} type="button" onClick={() => setCategory(value)} aria-pressed={category === value} style={{ flex: "0 0 auto", minHeight: 38, borderRadius: 999, border: "1px solid #cfcfcf", padding: "0 14px", background: category === value ? accent : "#fff", color: category === value ? "#fff" : "#111", cursor: "pointer" }}>
                {value}
              </button>
            ))}
          </div>
        </form>

        <div aria-live="polite" style={{ borderTop: "1px solid #e5e5e5", padding: "8px 20px 20px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", minHeight: 48 }}>
            <strong style={{ font: "600 13px/1 Inter, system-ui, sans-serif" }}>{suggestions.length ? "Products" : "No matching products"}</strong>
            <button type="button" onClick={submit} style={{ border: 0, background: "transparent", color: accent, fontWeight: 600, cursor: "pointer" }}>View all results</button>
          </div>
          <div style={{ display: "grid", gap: 4 }}>
            {suggestions.map((product) => (
              <button
                key={product.id}
                type="button"
                onClick={() => onProduct(product.id)}
                style={{ display: "grid", gridTemplateColumns: "56px minmax(0,1fr) 24px", alignItems: "center", gap: 12, width: "100%", border: 0, borderRadius: 6, padding: 8, background: "transparent", color: "inherit", textAlign: "left", cursor: "pointer" }}
              >
                <div style={{ width: 56, height: 56, borderRadius: 4, overflow: "hidden", background: "#f0f0f0" }}>
                  {product.image_url ? <img src={product.image_url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : null}
                </div>
                <span style={{ minWidth: 0 }}>
                  <span style={{ display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", font: "600 14px/1.3 Inter, system-ui, sans-serif" }}>{product.name}</span>
                  <span style={{ display: "block", marginTop: 4, color: "#666", font: "400 12px/1.3 Inter, system-ui, sans-serif" }}>{product.category || "Product"}</span>
                </span>
                <ChevronRight size={18} aria-hidden="true" />
              </button>
            ))}
          </div>
        </div>
      </section>
      <style>{`@media(max-width:560px){[role="dialog"] form>div:first-child{grid-template-columns:1fr!important}}`}</style>
    </div>
  );
};
