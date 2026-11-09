import { z } from "zod";

export const CUSTOM_CODE_NODE_TYPE = "custom:code" as const;
export const CUSTOM_CODE_RUNTIME_VERSION = 1;
export const CUSTOM_CODE_SOURCE_LIMIT = 120_000;
export const CUSTOM_CODE_CSS_LIMIT = 80_000;
export const CUSTOM_CODE_OUTPUT_LIMIT = 240_000;
export const CUSTOM_CODE_STOREFRONT_ACTION_EVENT = "storeblink:custom-code-action";

export type CustomCodeLanguage = "tsx" | "jsx";
export type CustomCodeStorefrontActionDetail = {
  nodeId: string;
  action: "add-to-cart" | "open-cart" | "view-product";
  productId?: string;
  quantity?: number;
};

export const DEFAULT_CUSTOM_CODE_SOURCE = `type Feature = {
  title: string;
  description: string;
};

type Product = {
  id: string;
  name: string;
  image_url?: string;
  price_cents?: number;
};

declare const StoreBlink: {
  data: { products?: Product[] };
  render: (element: unknown) => void;
  addToCart: (productId: string, quantity?: number) => void;
};

const features: Feature[] = [
  { title: "Fast delivery", description: "Reliable delivery across Pakistan." },
  { title: "Cash on delivery", description: "Pay when your order arrives." },
];

const featuredProduct = StoreBlink.data.products?.[0];

function StoreSection() {
  return (
    <section className="custom-section">
      <p className="eyebrow">STOREBLINK</p>
      <h2>Build this section with React</h2>
      <div className="feature-grid">
        {features.map((feature) => (
          <article key={feature.title}>
            <strong>{feature.title}</strong>
            <span>{feature.description}</span>
          </article>
        ))}
      </div>
      {featuredProduct ? (
        <article className="product-card">
          {featuredProduct.image_url ? <img src={featuredProduct.image_url} alt="" /> : null}
          <strong>{featuredProduct.name}</strong>
          <button type="button" onClick={() => StoreBlink.addToCart(featuredProduct.id, 1)}>
            Add to cart
          </button>
        </article>
      ) : null}
    </section>
  );
}

StoreBlink.render(<StoreSection />);`;

export const DEFAULT_CUSTOM_CODE_CSS = `* { box-sizing: border-box; }
body { margin: 0; color: #111111; font-family: Inter, Arial, sans-serif; }
.custom-section { min-height: 100%; padding: 32px; background: #ffffff; }
.eyebrow { margin: 0 0 10px; font-size: 11px; font-weight: 700; letter-spacing: 0; }
h2 { margin: 0; max-width: 640px; font-size: 36px; line-height: 1.05; }
.feature-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; margin-top: 28px; }
article { display: grid; gap: 6px; min-height: 112px; padding: 18px; border: 1px solid #dedede; border-radius: 8px; }
article span { color: #626262; font-size: 14px; line-height: 1.5; }
.product-card { grid-template-columns: 88px 1fr auto; align-items: center; margin-top: 12px; }
.product-card img { width: 88px; height: 76px; object-fit: cover; border-radius: 6px; }
.product-card button { min-height: 44px; padding: 0 18px; border: 0; border-radius: 6px; background: #111111; color: #ffffff; font-weight: 700; }
@media (max-width: 560px) {
  .custom-section { padding: 22px; }
  h2 { font-size: 28px; }
  .feature-grid { grid-template-columns: 1fr; }
  .product-card { grid-template-columns: 64px 1fr; }
  .product-card img { width: 64px; height: 64px; }
  .product-card button { grid-column: 1 / -1; width: 100%; }
}`;

export const DEFAULT_CUSTOM_CODE_OUTPUT = `(() => {
  const features = [
    { title: "Fast delivery", description: "Reliable delivery across Pakistan." },
    { title: "Cash on delivery", description: "Pay when your order arrives." }
  ];
  const featuredProduct = StoreBlink.data.products?.[0];
  function StoreSection() {
    return React.createElement("section", { className: "custom-section" },
      React.createElement("p", { className: "eyebrow" }, "STOREBLINK"),
      React.createElement("h2", null, "Build this section with React"),
      React.createElement("div", { className: "feature-grid" }, features.map((feature) =>
        React.createElement("article", { key: feature.title },
          React.createElement("strong", null, feature.title),
          React.createElement("span", null, feature.description)
        )
      )),
      featuredProduct ? React.createElement("article", { className: "product-card" },
        featuredProduct.image_url ? React.createElement("img", { src: featuredProduct.image_url, alt: "" }) : null,
        React.createElement("strong", null, featuredProduct.name),
        React.createElement("button", { type: "button", onClick: () => StoreBlink.addToCart(featuredProduct.id, 1) }, "Add to cart")
      ) : null
    );
  }
  StoreBlink.render(React.createElement(StoreSection));
})();`;

const customCodePropsSchema = z.object({
  language: z.enum(["tsx", "jsx"]).default("tsx"),
  source: z.string().max(CUSTOM_CODE_SOURCE_LIMIT),
  css: z.string().max(CUSTOM_CODE_CSS_LIMIT),
  compiledJs: z.string().max(CUSTOM_CODE_OUTPUT_LIMIT),
  sourceHash: z.string().max(32),
  runtimeVersion: z.literal(CUSTOM_CODE_RUNTIME_VERSION),
  data: z.record(z.unknown()).optional(),
  title: z.string().trim().min(1).max(120).optional(),
});

export type CustomCodeProps = z.infer<typeof customCodePropsSchema>;

export const hashCustomCode = (source: string, css: string): string => {
  let hash = 0x811c9dc5;
  const value = `${source}\u0000${css}`;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
};

export const createDefaultCustomCodeProps = (): CustomCodeProps => ({
  language: "tsx",
  source: DEFAULT_CUSTOM_CODE_SOURCE,
  css: DEFAULT_CUSTOM_CODE_CSS,
  compiledJs: DEFAULT_CUSTOM_CODE_OUTPUT,
  sourceHash: hashCustomCode(DEFAULT_CUSTOM_CODE_SOURCE, DEFAULT_CUSTOM_CODE_CSS),
  runtimeVersion: CUSTOM_CODE_RUNTIME_VERSION,
  data: {},
  title: "Custom React section",
});

export const parseCustomCodeProps = (value: unknown): CustomCodeProps => {
  const parsed = customCodePropsSchema.safeParse(value);
  return parsed.success ? parsed.data : createDefaultCustomCodeProps();
};

export const assertCustomCodeSource = (source: string, css: string): void => {
  if (!source.trim()) throw new Error("React / TypeScript source is required.");
  if (source.length > CUSTOM_CODE_SOURCE_LIMIT) {
    throw new Error(`Source exceeds the ${CUSTOM_CODE_SOURCE_LIMIT.toLocaleString()} character limit.`);
  }
  if (css.length > CUSTOM_CODE_CSS_LIMIT) {
    throw new Error(`CSS exceeds the ${CUSTOM_CODE_CSS_LIMIT.toLocaleString()} character limit.`);
  }
  if (/^\s*(?:import|export)\s/m.test(source) || /\bimport\s*\(/.test(source)) {
    throw new Error("Module imports are not available inside custom sections. Use the provided React and StoreBlink globals.");
  }
};
