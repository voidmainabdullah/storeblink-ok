import { expect, test } from "@playwright/test";
import type { StorefrontResourceType } from "../../src/adaptive-commerce/contracts";
import { ADAPTIVE_QA_FIXTURES } from "../../src/adaptive-commerce/qa";

const ROUTES: readonly StorefrontResourceType[] = [
  "home",
  "product",
  "collection",
  "page",
  "blog",
  "cart",
  "search",
  "404",
];

const BOUNDARY_WIDTHS = [320, 390, 768, 1_024, 1_440, 2_560] as const;

const expectHealthyProbe = (result: {
  error: string | null;
  h1Count: number;
  sectionCount: number;
  documentScrollWidth: number;
  viewportWidth: number;
  minimumTouchWidth: number;
  minimumTouchHeight: number;
  direction: string;
  collisionCount: number;
  clippedMediaCount: number;
  textOverflowCount: number;
  requiredCommerceControl: boolean;
}, label: string, direction: "ltr" | "rtl") => {
  expect(result.error, label).toBeNull();
  expect(result.h1Count, label).toBe(1);
  expect(result.sectionCount, label).toBeGreaterThan(0);
  expect(result.documentScrollWidth, label).toBeLessThanOrEqual(result.viewportWidth + 1);
  expect(result.minimumTouchWidth, label).toBeGreaterThanOrEqual(44);
  expect(result.minimumTouchHeight, label).toBeGreaterThanOrEqual(44);
  expect(result.direction, label).toBe(direction);
  expect(result.collisionCount, label).toBe(0);
  expect(result.clippedMediaCount, label).toBe(0);
  expect(result.textOverflowCount, label).toBe(0);
  expect(result.requiredCommerceControl, label).toBe(true);
};

test.setTimeout(180_000);

test("adaptive artifacts remain usable across routes, widths, long content, and RTL", async ({ page }) => {
  await page.route("**/__adaptive-runtime-probe", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "text/html",
      body: `<!doctype html><html><head><meta charset="utf-8"><style>html,body{margin:0;min-width:0}</style>
        <script type="module">
          import RefreshRuntime from "/@react-refresh";
          RefreshRuntime.injectIntoGlobalHook(window);
          window.$RefreshReg$ = () => {};
          window.$RefreshSig$ = () => (type) => type;
          window.__vite_plugin_react_preamble_installed__ = true;
        </script></head><body></body></html>`,
    });
  });
  await page.goto("/__adaptive-runtime-probe");

  for (const width of BOUNDARY_WIDTHS) {
    await page.setViewportSize({ width, height: 1_000 });
    for (const resourceType of ROUTES) {
      const result = await page.evaluate(async ({ routeType, direction }) => {
        const probe = await (new Function(
          "return import('/tests/fixtures/adaptive-runtime-probe.tsx')",
        )() as Promise<typeof import("../fixtures/adaptive-runtime-probe")>);
        return probe.mountAdaptiveRuntimeProbe({ resourceType: routeType, direction });
      }, {
        routeType: resourceType,
        direction: width === 390 ? "rtl" as const : "ltr" as const,
      });

      expectHealthyProbe(
        result,
        `${resourceType} at ${width}px`,
        width === 390 ? "rtl" : "ltr",
      );
    }
  }
});

test("every certified route survives the pairwise adversarial content matrix", async ({ page }) => {
  await page.route("**/__adaptive-runtime-probe", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "text/html",
      body: `<!doctype html><html><head><meta charset="utf-8"><style>html,body{margin:0;min-width:0}</style>
        <script type="module">
          import RefreshRuntime from "/@react-refresh";
          RefreshRuntime.injectIntoGlobalHook(window);
          window.$RefreshReg$ = () => {};
          window.$RefreshSig$ = () => (type) => type;
          window.__vite_plugin_react_preamble_installed__ = true;
        </script></head><body></body></html>`,
    });
  });
  await page.goto("/__adaptive-runtime-probe");

  for (const [fixtureIndex, fixture] of ADAPTIVE_QA_FIXTURES.entries()) {
    for (const [routeIndex, resourceType] of ROUTES.entries()) {
      const width = BOUNDARY_WIDTHS[(fixtureIndex + routeIndex) % BOUNDARY_WIDTHS.length];
      await page.setViewportSize({ width, height: 1_000 });
      const result = await page.evaluate(async ({ routeType, fixtureValue }) => {
        const probe = await (new Function(
          "return import('/tests/fixtures/adaptive-runtime-probe.tsx')",
        )() as Promise<typeof import("../fixtures/adaptive-runtime-probe")>);
        return probe.mountAdaptiveRuntimeProbe({
          resourceType: routeType,
          fixture: fixtureValue,
        });
      }, { routeType: resourceType, fixtureValue: fixture });
      expectHealthyProbe(
        result,
        `${resourceType} with ${fixture.id} at ${width}px`,
        fixture.direction,
      );
    }
  }
});
