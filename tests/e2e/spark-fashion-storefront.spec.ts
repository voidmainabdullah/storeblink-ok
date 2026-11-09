import { expect, test, type Page } from "@playwright/test";

const storeId = "44444444-4444-4444-8444-444444444444";
const products = [
  {
    id: "55555555-5555-4555-8555-555555555551",
    handle: "cyan-statement-shirt",
    name: "Cyan Statement Shirt",
    category: "New arrivals",
    description: "A saturated statement shirt cut for relaxed everyday styling.",
    image_url: "/src/themes/spark-fashion/assets/spark-cyan.webp",
    images: [],
    is_published: true,
    price_cents: 14700,
    original_price_cents: null,
    stock: 12,
    badge: "New",
    free_delivery: true,
    sale_tag: null,
    sale_ends_at: null,
    created_at: "2026-08-14T00:00:00.000Z",
    total_count: 3,
  },
  {
    id: "55555555-5555-4555-8555-555555555552",
    handle: "coral-resort-shirt",
    name: "Coral Resort Shirt",
    category: "Everyday style",
    description: "A lightweight coral resort shirt with an expressive abstract print.",
    image_url: "/src/themes/spark-fashion/assets/spark-coral.webp",
    images: [],
    is_published: true,
    price_cents: 12900,
    original_price_cents: null,
    stock: 8,
    badge: null,
    free_delivery: false,
    sale_tag: null,
    sale_ends_at: null,
    created_at: "2026-08-14T00:00:00.000Z",
    total_count: 3,
  },
  {
    id: "55555555-5555-4555-8555-555555555553",
    handle: "violet-campaign-jacket",
    name: "Violet Campaign Jacket",
    category: "Statement color",
    description: "A high-impact campaign jacket designed for confident layering.",
    image_url: "/src/themes/spark-fashion/assets/spark-violet.webp",
    images: [],
    is_published: true,
    price_cents: 14900,
    original_price_cents: null,
    stock: 6,
    badge: "Limited",
    free_delivery: true,
    sale_tag: null,
    sale_ends_at: null,
    created_at: "2026-08-14T00:00:00.000Z",
    total_count: 3,
  },
];

const installFixture = async (page: Page) => {
  await page.goto("/");
  const scene = await page.evaluate(async ({ fixtureProducts }) => {
    const [templateModule, sceneModule] = await Promise.all([
      import("/src/themes/spark-fashion/templates/home.ts"),
      import("/src/editor/engine/storeSceneAdapter.ts"),
    ]);
    return sceneModule.createEngineSceneTheme(
      templateModule.buildSparkFashionTemplateScene(
        {
          business_name: "Spark Mode",
          store_color: "#FF681D",
          store_tagline: "Color-led contemporary fashion",
        },
        fixtureProducts,
      ),
    );
  }, { fixtureProducts: products });

  await page.route("**/rest/v1/rpc/get_public_storefront", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({
      id: storeId,
      business_name: "Spark Mode",
      store_slug: "spark-e2e",
      store_tagline: "Color-led contemporary fashion",
      store_about: "A contemporary fashion edit built around expressive color.",
      store_color: "#FF681D",
      store_banner_url: null,
      store_template: "spark-fashion",
      theme_published: scene,
      theme_revision: 1,
      published_at: "2026-08-14T00:00:00.000Z",
    }),
  }));
  await page.route("**/rest/v1/rpc/get_public_catalog", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify(products),
  }));
  await page.route("**/rest/v1/rpc/get_public_product", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify(products[0]),
  }));
};

const expectHorizontalFit = async (page: Page) => {
  const fit = await page.evaluate(() => ({
    viewport: document.documentElement.clientWidth,
    document: document.documentElement.scrollWidth,
    body: document.body.scrollWidth,
    offenders: Array.from(document.querySelectorAll<HTMLElement>("body *"))
      .map((element) => {
        const rect = element.getBoundingClientRect();
        return {
          nodeId: element.dataset.nodeId ?? null,
          left: Math.round(rect.left * 10) / 10,
          right: Math.round(rect.right * 10) / 10,
          width: Math.round(rect.width * 10) / 10,
        };
      })
      .filter((entry) => entry.right > document.documentElement.clientWidth + 0.5 || entry.left < -0.5)
      .slice(0, 20),
  }));
  expect(fit.document, JSON.stringify(fit.offenders, null, 2)).toBeLessThanOrEqual(fit.viewport);
  expect(fit.body, JSON.stringify(fit.offenders, null, 2)).toBeLessThanOrEqual(fit.viewport);
};

const loadLazyMedia = async (page: Page) => {
  await page.evaluate(async () => {
    const viewport = Math.max(400, window.innerHeight * 0.8);
    for (let y = 0; y < document.documentElement.scrollHeight; y += viewport) {
      window.scrollTo(0, y);
      await new Promise((resolve) => window.setTimeout(resolve, 45));
    }
    window.scrollTo(0, 0);
  });
  await page.waitForTimeout(250);
};

test("Spark Fashion renders and functions on desktop", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await installFixture(page);
  await page.goto("/store/spark-e2e");

  await expect(page.locator("[data-public-store]")).toBeVisible();
  await expect(page.locator('[data-node-id="spark-hero-heading"]')).toBeVisible();
  await expect(page.getByText("Cyan Statement Shirt", { exact: true })).toBeVisible();
  await expect(page.locator('[data-node-id="spark-nav-products"]')).toBeVisible();
  await expectHorizontalFit(page);
  await expect(page.locator('[data-node-id="spark-category-1"]')).toBeVisible();
  await loadLazyMedia(page);
  await page.screenshot({ path: "test-results/spark-fashion-desktop.png", fullPage: true });

  await page.locator('[data-node-id="spark-search"]').click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.keyboard.press("Escape");
  await page.locator('[data-node-id="spark-product-card-55555555-5555-4555-8555-555555555551-cart"]').click();
  await page.locator('[data-node-id="spark-cart"]').click();
  await expect(page.getByLabel("Your cart").getByText("Cyan Statement Shirt", { exact: true })).toBeVisible();
});

test("Spark Fashion mobile menu, catalog navigation and layout work", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await installFixture(page);
  await page.goto("/store/spark-e2e");

  const store = page.locator("[data-public-store]");
  await expect(store).toHaveAttribute("data-theme-menu-open", "false");
  await expect(page.locator('[data-node-id="spark-menu"]')).toBeVisible();
  await expectHorizontalFit(page);

  await page.locator('[data-node-id="spark-menu"]').click();
  await expect(store).toHaveAttribute("data-theme-menu-open", "true");
  const productsLink = page.locator('[data-node-id="spark-mobile-nav-products"]');
  await expect(productsLink).toBeVisible();
  await productsLink.click();
  await expect(page).toHaveURL(/\/store\/spark-e2e\/products$/);
  await expect(page.getByRole("heading", { name: "Spark Mode products" })).toBeVisible();

  await page.goto("/store/spark-e2e");
  await expect(page.locator('[data-node-id="spark-hero-heading"]')).toBeVisible();
  await expect(page.getByText("Cyan Statement Shirt", { exact: true })).toBeVisible();
  await expect(page.locator('[data-node-id="spark-category-1"]')).toBeVisible();
  await loadLazyMedia(page);
  await page.screenshot({ path: "test-results/spark-fashion-mobile.png", fullPage: true });
});
