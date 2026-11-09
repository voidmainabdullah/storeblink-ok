import { Link } from "react-router-dom";
import type { JsonValue } from "@/adaptive-commerce/contracts";
import { AdaptiveProductList } from "./AdaptiveProductList";
import type {
  AdaptiveStorefrontCart,
  AdaptiveStorefrontPageContent,
  AdaptiveStorefrontProduct,
  RuntimeComponentReference,
} from "./types";

const text = (value: JsonValue | undefined, fallback: string): string =>
  typeof value === "string" && value.trim() ? value : fallback;

const paragraphs = (value: string) => value
  .split(/\n{2,}/)
  .map((paragraph) => paragraph.trim())
  .filter(Boolean);

const productImageUrls = (product: AdaptiveStorefrontProduct): readonly string[] => {
  const urls = [product.image_url];
  if (Array.isArray(product.images)) {
    product.images.forEach((entry) => {
      if (typeof entry === "string") {
        urls.push(entry);
        return;
      }
      if (!entry || typeof entry !== "object" || Array.isArray(entry)) return;
      const record = entry as Record<string, unknown>;
      const candidate = record.url ?? record.src ?? record.image_url;
      if (typeof candidate === "string") urls.push(candidate);
    });
  }
  return [...new Set(urls.flatMap((value) => typeof value === "string" && value.trim() ? [value.trim()] : []))];
};

export const AdaptiveSection = ({
  reference,
  props,
  products,
  currentProduct,
  page,
  cart,
  locale,
  currency,
  bannerUrl,
  homeHref,
  productsHref,
  searchHref,
  productHref,
}: Readonly<{
  reference: RuntimeComponentReference;
  props: Readonly<Record<string, JsonValue>>;
  products: readonly AdaptiveStorefrontProduct[];
  currentProduct?: AdaptiveStorefrontProduct | null;
  page?: AdaptiveStorefrontPageContent | null;
  cart: AdaptiveStorefrontCart;
  locale: string;
  currency: string;
  bannerUrl?: string | null;
  homeHref: string;
  productsHref: string;
  searchHref: string;
  productHref: (product: AdaptiveStorefrontProduct) => string;
}>) => {
  const id = `sb-${reference.path.replace(/[^a-z0-9]+/gi, "-")}`;
  const component = reference.component.id;

  if (component === "hero") {
    return (
      <section id={id} className={`sb-adaptive-section sb-adaptive-hero sb-adaptive-hero--${reference.component.variantId}`} aria-labelledby={`${id}-title`}>
        <div className="sb-adaptive-hero__copy">
          <p className="sb-adaptive-kicker">New collection</p>
          <h1 id={`${id}-title`}>{text(props.heading, "A storefront built around your brand")}</h1>
          <p>{text(props.description, "Discover products chosen with care.")}</p>
          <Link className="sb-adaptive-button" to={productsHref}>Shop products</Link>
        </div>
        <div className="sb-adaptive-hero__media">
          {bannerUrl ? <img src={bannerUrl} alt="Featured store collection" /> : <span>Designed for everyday discovery</span>}
        </div>
      </section>
    );
  }

  if (component === "product-grid" || component === "collection-grid" || component === "recommendations") {
    const Heading = reference.path.startsWith("collection.") ? "h1" : "h2";
    const visibleProducts = component === "recommendations" && currentProduct
      ? products.filter((product) => product.id !== currentProduct.id).slice(0, 8)
      : products;
    return (
      <section id={id} className="sb-adaptive-section" aria-labelledby={`${id}-title`}>
        <div className="sb-adaptive-section-heading">
          <div>
            <p className="sb-adaptive-kicker">Browse</p>
            <Heading id={`${id}-title`}>{text(props.text ?? props.heading, component === "recommendations" ? "You may also like" : "Featured products")}</Heading>
          </div>
          {component === "product-grid" ? <Link to={productsHref}>View all</Link> : null}
        </div>
        <AdaptiveProductList
          products={visibleProducts}
          locale={locale}
          currency={currency}
          productHref={productHref}
          onAdd={(productId) => cart.add(productId, 1)}
          emptyMessage={text(props["empty-message"], "No products are available.")}
        />
      </section>
    );
  }

  if (component === "product-gallery") {
    if (!currentProduct) throw new Error("The product route has no current product.");
    const images = productImageUrls(currentProduct);
    return (
      <section id={id} className="sb-adaptive-product-gallery" aria-label={text(props.label, "Product media")}>
        {images.length ? images.map((src, index) => (
          <img key={src} src={src} alt={index === 0 ? currentProduct.name : `${currentProduct.name} view ${index + 1}`} />
        )) : (
          <div className="sb-adaptive-media-placeholder">Product image coming soon</div>
        )}
      </section>
    );
  }

  if (component === "product-information") {
    if (!currentProduct) throw new Error("The product route has no current product.");
    const soldOut = currentProduct.stock !== null && currentProduct.stock !== undefined && currentProduct.stock <= 0;
    return (
      <section id={id} className="sb-adaptive-product-information" aria-labelledby={`${id}-title`}>
        {currentProduct.category ? <p className="sb-adaptive-kicker">{currentProduct.category}</p> : null}
        <h1 id={`${id}-title`}>{text(props.text, currentProduct.name)}</h1>
        <p className="sb-adaptive-product-information__price">
          {new Intl.NumberFormat(locale, { style: "currency", currency }).format(currentProduct.price_cents / 100)}
        </p>
        {currentProduct.description ? <p>{currentProduct.description}</p> : null}
        <button
          type="button"
          className="sb-adaptive-button"
          disabled={soldOut}
          onClick={() => cart.add(currentProduct.id, 1)}
        >
          {soldOut ? "Sold out" : "Add to cart"}
        </button>
      </section>
    );
  }

  if (component === "cart") {
    const lines = Object.entries(cart.quantities).flatMap(([productId, quantity]) => {
      const product = products.find((candidate) => candidate.id === productId) ??
        (currentProduct?.id === productId ? currentProduct : undefined);
      return product ? [{ product, quantity }] : [];
    });
    const subtotal = lines.reduce((sum, line) => sum + line.product.price_cents * line.quantity, 0);
    return (
      <section id={id} className="sb-adaptive-section sb-adaptive-cart" aria-labelledby={`${id}-title`}>
        <h1 id={`${id}-title`}>{text(props.heading, "Your cart")}</h1>
        {!lines.length ? (
          <div className="sb-adaptive-empty">
            <p>{text(props["empty-message"], "Your cart is empty.")}</p>
            <Link className="sb-adaptive-button" to={productsHref}>Continue shopping</Link>
          </div>
        ) : (
          <>
            <div className="sb-adaptive-cart__lines">
              {lines.map(({ product, quantity }) => (
                <article key={product.id} className="sb-adaptive-cart__line">
                  <div><h2>{product.name}</h2><p>{quantity} item{quantity === 1 ? "" : "s"}</p></div>
                  <div className="sb-adaptive-cart__actions">
                    <button type="button" onClick={() => cart.decrement?.(product.id)} aria-label={`Decrease ${product.name}`} disabled={!cart.decrement}>−</button>
                    <span>{quantity}</span>
                    <button type="button" onClick={() => cart.increment?.(product.id)} aria-label={`Increase ${product.name}`} disabled={!cart.increment}>+</button>
                    <button type="button" onClick={() => cart.remove?.(product.id)} disabled={!cart.remove}>Remove</button>
                  </div>
                </article>
              ))}
            </div>
            <div className="sb-adaptive-cart__summary">
              <span>Subtotal</span>
              <strong>{new Intl.NumberFormat(locale, { style: "currency", currency }).format(subtotal / 100)}</strong>
            </div>
            <button type="button" className="sb-adaptive-button" onClick={cart.checkout}>Secure checkout</button>
          </>
        )}
      </section>
    );
  }

  if (component === "search-results") {
    return (
      <section id={id} className="sb-adaptive-section" aria-labelledby={`${id}-title`}>
        <h1 id={`${id}-title`}>{text(props.heading, "Search")}</h1>
        <form className="sb-adaptive-search" action={searchHref} role="search">
          <label htmlFor={`${id}-query`}>{text(props["input-label"], "Search products")}</label>
          <div><input id={`${id}-query`} name="q" defaultValue={text(props.text, "")} /><button className="sb-adaptive-button" type="submit">Search</button></div>
        </form>
        <AdaptiveProductList products={products} locale={locale} currency={currency} productHref={productHref} onAdd={(productId) => cart.add(productId, 1)} emptyMessage={text(props["empty-message"], "No results found.")} />
      </section>
    );
  }

  if (component === "rich-text" || component === "blog-article") {
    const title = text(props.label ?? props.heading, page?.title ?? (component === "blog-article" ? "Article" : "Page"));
    const body = typeof props.text === "string" ? props.text : page?.body ?? "";
    return (
      <article id={id} className="sb-adaptive-section sb-adaptive-article" aria-labelledby={`${id}-title`}>
        <p className="sb-adaptive-kicker">{component === "blog-article" ? "Journal" : "About"}</p>
        <h1 id={`${id}-title`}>{title}</h1>
        <div className="sb-adaptive-article__body">
          {paragraphs(body).map((paragraph, index) => <p key={`${index}-${paragraph.slice(0, 12)}`}>{paragraph}</p>)}
        </div>
      </article>
    );
  }

  if (component === "not-found") {
    return (
      <section id={id} className="sb-adaptive-section sb-adaptive-not-found" aria-labelledby={`${id}-title`}>
        <p className="sb-adaptive-kicker">404</p>
        <h1 id={`${id}-title`}>{text(props.heading, "Page not found")}</h1>
        <p>{text(props.message, "The page you requested is unavailable.")}</p>
        <Link className="sb-adaptive-button" to={homeHref}>Back to store</Link>
      </section>
    );
  }

  throw new Error(`No certified renderer is registered for ${component}.`);
};
