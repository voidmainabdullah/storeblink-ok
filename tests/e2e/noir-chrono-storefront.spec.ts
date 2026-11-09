import { expect, test, type Page } from "@playwright/test";

const storeId = "11111111-1111-4111-8111-111111111111";
const productId = "22222222-2222-4222-8222-222222222222";

const product = {
  id: productId,
  handle: "automatic-rose",
  name: "Automatic Rose",
  category: "Classic",
  description: "A polished automatic watch with a rose-metal case.",
  image_url: "/src/themes/noir-chrono/assets/noir-watch-light.webp",
  images: [],
  is_published: true,
  price_cents: 25500,
  original_price_cents: 29900,
  stock: 12,
  badge: "New",
  free_delivery: true,
  sale_tag: null,
  sale_ends_at: null,
  created_at: "2026-08-12T00:00:00.000Z",
  total_count: 1,
};

const installStorefrontFixture = async (
  page: Page,
  options: { includeCustomCode?: boolean } = {},
) => {
  await page.goto("/");

  const scene = await page.evaluate(async ({ fixtureProduct, includeCustomCode }) => {
    const [templateModule, sceneModule, graphModule, customCodeModule] = await Promise.all([
      import("/src/themes/noir-chrono/templates/home.ts"),
      import("/src/editor/engine/storeSceneAdapter.ts"),
      import("/src/engine/scene-graph/index.ts"),
      import("/src/extension/custom-code/index.ts"),
    ]);
    const sceneTree = templateModule.buildNoirChronoScene(
      {
        business_name: "Noir Chrono",
        store_color: "#F5AAA5",
        store_tagline: "Modern watch style",
      },
      [fixtureProduct],
    );
    if (includeCustomCode) {
      const source = `type Product = { id: string; name: string };
declare const StoreBlink: {
  data: { products?: Product[] };
  render: (element: unknown) => void;
  addToCart: (productId: string, quantity?: number) => void;
};
const product = StoreBlink.data.products?.[0];
function CommerceBlock() {
  return <main className="commerce-block">
    <h2>Custom React commerce block</h2>
    {product ? <button type="button" onClick={() => StoreBlink.addToCart(product.id)}>Add custom product</button> : null}
  </main>;
}
StoreBlink.render(<CommerceBlock />);`;
      const customProps = await customCodeModule.compileCustomCode(
        source,
        `.commerce-block{display:grid;gap:16px;padding:24px;background:#fff;color:#111;font-family:Arial,sans-serif}.commerce-block h2{margin:0;font-size:28px}.commerce-block button{min-height:44px;border:0;border-radius:6px;background:#111;color:#fff;font-weight:700}`,
      );
      const customNode = graphModule.createSceneNode({
        id: "noir-custom-commerce",
        type: "custom:code",
        name: "Custom React commerce block",
        props: { ...customProps, title: "Custom React commerce block" },
        transform: {
          x: 48,
          y: 120,
          width: 640,
          height: 260,
          zIndex: 300,
        },
        layout: {
          mode: "absolute",
          responsive: {
            desktop: { transform: { x: 48, y: 120, width: 640, height: 260, rotation: 0, scaleX: 1, scaleY: 1, skewX: 0, skewY: 0, transformOrigin: [0.5, 0.5], zIndex: 300 } },
            tablet: { transform: { x: 24, y: 120, width: 720, height: 260, rotation: 0, scaleX: 1, scaleY: 1, skewX: 0, skewY: 0, transformOrigin: [0.5, 0.5], zIndex: 300 } },
            mobile: { transform: { x: 24, y: 120, width: 342, height: 260, rotation: 0, scaleX: 1, scaleY: 1, skewX: 0, skewY: 0, transformOrigin: [0.5, 0.5], zIndex: 300 } },
          },
        },
      }, "noir-products");
      sceneTree.nodes[customNode.id] = customNode;
      sceneTree.nodes["noir-products"].childIds.push(customNode.id);
    }
    return sceneModule.createEngineSceneTheme(sceneTree);
  }, { fixtureProduct: product, includeCustomCode: options.includeCustomCode ?? false });

  await page.route("**/rest/v1/rpc/get_public_storefront", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        id: storeId,
        business_name: "Noir Chrono",
        store_slug: "noir-e2e",
        store_tagline: "Modern watch style",
        store_about: "Independent luxury watch design.",
        store_color: "#F5AAA5",
        store_banner_url: null,
        store_template: "noir-chrono",
        theme_published: scene,
        theme_revision: 7,
        published_at: "2026-08-12T00:00:00.000Z",
      }),
    }),
  );
  await page.route("**/rest/v1/rpc/get_public_catalog", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify([product]),
    }),
  );
  await page.route("**/rest/v1/rpc/get_public_product", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(product),
    }),
  );
  await page.route("**/rest/v1/rpc/place_storefront_cod_order", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        order_id: "33333333-3333-4333-8333-333333333333",
        order_number: "SB-E2E0000001",
        total_cents: product.price_cents,
        status: "pending",
        payment_method: "cash_on_delivery",
      }),
    }),
  );
};

test("compiled TypeScript React sections render catalog data and can add to cart", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await installStorefrontFixture(page, { includeCustomCode: true });
  await page.goto("/store/noir-e2e");

  const customFrame = page.frameLocator('iframe[title="Custom React commerce block"]');
  await expect(
    customFrame.getByRole("heading", { name: "Custom React commerce block" }),
  ).toBeVisible();
  await customFrame.getByRole("button", { name: "Add custom product" }).click();
  await page.locator('[data-node-id="noir-cart"]').click();
  await expect(
    page.getByLabel("Your cart").getByText("Automatic Rose", { exact: true }),
  ).toBeVisible();
});

test("Noir Chrono mobile navigation, catalog action, and COD checkout work end to end", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await installStorefrontFixture(page);
  await page.goto("/store/noir-e2e");

  const store = page.locator("[data-public-store]");
  await expect(store).toBeVisible();
  await expect(page.locator('[data-node-id="noir-menu-trigger"]')).toBeVisible();
  await expect(store).toHaveAttribute("data-theme-menu-open", "false");

  const horizontalFit = await page.evaluate(() => ({
    viewport: document.documentElement.clientWidth,
    document: document.documentElement.scrollWidth,
    body: document.body.scrollWidth,
    offenders: Array.from(document.querySelectorAll<HTMLElement>("body *"))
      .map((element) => {
        const rect = element.getBoundingClientRect();
        return {
          tag: element.tagName,
          nodeId: element.dataset.nodeId ?? null,
          className: element.className,
          left: Math.round(rect.left * 10) / 10,
          right: Math.round(rect.right * 10) / 10,
          width: Math.round(rect.width * 10) / 10,
        };
      })
      .filter((entry) => entry.right > document.documentElement.clientWidth + 0.5 || entry.left < -0.5)
      .slice(0, 20),
  }));
  expect(horizontalFit.document, JSON.stringify(horizontalFit.offenders, null, 2)).toBeLessThanOrEqual(horizontalFit.viewport);
  expect(horizontalFit.body, JSON.stringify(horizontalFit.offenders, null, 2)).toBeLessThanOrEqual(horizontalFit.viewport);

  await page.locator('[data-node-id="noir-menu-trigger"]').click();
  await expect(store).toHaveAttribute("data-theme-menu-open", "true");
  const mobileProducts = page.locator('[data-node-id="noir-mobile-nav-products"]');
  await expect(mobileProducts).toBeVisible();

  await mobileProducts.click();
  await expect(page).toHaveURL(/\/store\/noir-e2e\/products$/);
  await expect(
    page.getByRole("heading", { name: "Noir Chrono products" }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Open navigation" })).toBeVisible();

  await page.goto("/store/noir-e2e");
  await page.locator('[data-node-id="noir-product-card-1-add"]').click();
  await page.locator('[data-node-id="noir-cart"]').click();
  await expect(page.getByRole("heading", { name: "Your cart" })).toBeVisible();
  await expect(
    page.getByLabel("Your cart").getByText("Automatic Rose", { exact: true }),
  ).toBeVisible();
  await expect(page.getByText("Payment method: Cash on delivery")).toBeVisible();
  await expect(page.getByRole("button", { name: "Place cash-on-delivery order" })).toBeEnabled();

  await page.getByLabel("Full name").fill("Ayesha Khan");
  await page.getByLabel("Phone").fill("+92 300 1234567");
  await page.getByLabel("Address", { exact: true }).fill("12 Main Boulevard");
  await page.getByLabel("City").fill("Lahore");
  await page.getByLabel("Country").fill("Pakistan");
  await page.getByRole("button", { name: "Place cash-on-delivery order" }).click();

  await expect(page.getByRole("heading", { name: "Order confirmed" })).toBeVisible();
  await expect(page.getByText("SB-E2E0000001")).toBeVisible();
});
