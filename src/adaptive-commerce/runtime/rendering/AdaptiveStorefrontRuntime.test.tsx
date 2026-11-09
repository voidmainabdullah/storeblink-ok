import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import type { RuntimeArtifact, StorefrontResourceType } from "@/adaptive-commerce/contracts";
import { storefrontCompiler } from "@/adaptive-commerce/compiler";
import { createBuiltInAdaptiveCommerceCatalog } from "@/adaptive-commerce/fixtures";
import { AdaptiveRuntimeErrorBoundary } from "./AdaptiveRuntimeErrorBoundary";
import { AdaptiveStorefrontRuntime } from "./AdaptiveStorefrontRuntime";

const compileFixture = (): RuntimeArtifact => {
  const catalog = createBuiltInAdaptiveCommerceCatalog();
  return storefrontCompiler.compile({
    registry: catalog.registry,
    storeDefinition: catalog.storeDefinition,
    createdAt: "2026-08-21T00:00:00.000Z",
  }).artifact;
};

const product = {
  id: "product-1",
  handle: "linen-shirt",
  name: "Linen shirt",
  description: "Breathable natural linen.",
  category: "Clothing",
  image_url: "https://cdn.example.test/linen-shirt.jpg",
  images: [],
  price_cents: 8900,
  original_price_cents: null,
  stock: 8,
};

const renderRoute = (
  artifact: RuntimeArtifact,
  resourceType: StorefrontResourceType,
  onAdd = vi.fn(),
  onCheckout = vi.fn(),
  quantities: Readonly<Record<string, number>> = {},
) => render(
  <MemoryRouter>
    <AdaptiveRuntimeErrorBoundary>
      <AdaptiveStorefrontRuntime
        artifact={artifact}
        resourceType={resourceType}
        storeName="North & Pine"
        products={[product]}
        currentProduct={resourceType === "product" ? product : null}
        page={{ title: "Our story", body: "Independent by design." }}
        cart={{
          quantities,
          count: Object.values(quantities).reduce((total, quantity) => total + quantity, 0),
          add: onAdd,
          checkout: onCheckout,
        }}
        navigation={[{ id: "home", label: "Home", href: "/" }]}
        homeHref="/"
        productsHref="/products"
        cartHref="/cart"
        searchHref="/search"
        productHref={(candidate) => `/products/${candidate.handle || candidate.id}`}
      />
    </AdaptiveRuntimeErrorBoundary>
  </MemoryRouter>,
);

describe("AdaptiveStorefrontRuntime", () => {
  it("renders a certified Home artifact and keeps commerce actions live", () => {
    const add = vi.fn();
    renderRoute(compileFixture(), "home", add);
    expect(screen.getByRole("banner")).toHaveTextContent("North & Pine");
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Thoughtful goods for everyday life");
    fireEvent.click(screen.getByRole("button", { name: "Add to cart" }));
    expect(add).toHaveBeenCalledWith("product-1", 1);
  });

  it("hydrates the Product blueprint through compiled prop-only bindings", () => {
    renderRoute(compileFixture(), "product");
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Linen shirt");
    expect(screen.getByText("$89.00")).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "Linen shirt" })).toBeInTheDocument();
  });

  it("renders the compiled 404 route instead of a generic route fallback", () => {
    renderRoute(compileFixture(), "404");
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Page not found");
    expect(screen.getByRole("link", { name: "Back to store" })).toHaveAttribute("href", "/");
  });

  it("keeps the compiled Cart checkout action connected", () => {
    const checkout = vi.fn();
    renderRoute(compileFixture(), "cart", vi.fn(), checkout, { "product-1": 2 });
    fireEvent.click(screen.getByRole("button", { name: "Secure checkout" }));
    expect(checkout).toHaveBeenCalledOnce();
  });

  it.each([
    ["collection", "Collection"],
    ["page", "Our story"],
    ["blog", "Our story"],
    ["search", "Search"],
  ] as const)("renders the compiled %s route without a generic fallback", (resourceType, heading) => {
    renderRoute(compileFixture(), resourceType);
    expect(screen.getByRole("heading", { level: 1, name: heading })).toBeVisible();
  });

  it("fails closed when an artifact references an unregistered renderer", () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const artifact = structuredClone(compileFixture()) as RuntimeArtifact;
    const document = artifact.routes.home.document as Record<string, unknown>;
    const sections = document.sections as Array<Record<string, unknown>>;
    sections[0] = {
      ...sections[0],
      component: { id: "unknown-component", version: "1.0.0", variantId: "default" },
    };
    renderRoute(artifact, "home");
    expect(screen.getByRole("alert")).toHaveTextContent("Store temporarily unavailable");
    consoleError.mockRestore();
  });
});
