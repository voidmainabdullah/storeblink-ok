import { Link } from "react-router-dom";
import type { AdaptiveStorefrontProduct } from "./types";

const price = (cents: number, locale: string, currency: string): string =>
  new Intl.NumberFormat(locale, { style: "currency", currency }).format(cents / 100);

export const AdaptiveProductList = ({
  products,
  locale,
  currency,
  productHref,
  onAdd,
  emptyMessage,
}: Readonly<{
  products: readonly AdaptiveStorefrontProduct[];
  locale: string;
  currency: string;
  productHref: (product: AdaptiveStorefrontProduct) => string;
  onAdd: (productId: string) => void;
  emptyMessage: string;
}>) => {
  if (!products.length) return <p className="sb-adaptive-empty">{emptyMessage}</p>;
  return (
    <div className="sb-adaptive-product-grid" role="list">
      {products.map((product) => (
        <article className="sb-adaptive-product-card" role="listitem" key={product.id}>
          <Link className="sb-adaptive-product-media" to={productHref(product)}>
            {product.image_url ? (
              <img src={product.image_url} alt={product.name} loading="lazy" />
            ) : (
              <span aria-label="Product image unavailable">Image coming soon</span>
            )}
          </Link>
          <div className="sb-adaptive-product-copy">
            {product.category ? <p className="sb-adaptive-kicker">{product.category}</p> : null}
            <h3><Link to={productHref(product)}>{product.name}</Link></h3>
            <p className="sb-adaptive-price">{price(product.price_cents, locale, currency)}</p>
            <button
              type="button"
              className="sb-adaptive-button sb-adaptive-button--secondary"
              disabled={product.stock !== null && product.stock !== undefined && product.stock <= 0}
              onClick={() => onAdd(product.id)}
            >
              {product.stock !== null && product.stock !== undefined && product.stock <= 0
                ? "Sold out"
                : "Add to cart"}
            </button>
          </div>
        </article>
      ))}
    </div>
  );
};
