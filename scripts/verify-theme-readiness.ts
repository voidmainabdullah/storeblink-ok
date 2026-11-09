import { JSDOM } from "jsdom";
import type { ResponsiveBreakpoint } from "../src/stores/responsive.store";

const dom = new JSDOM("<!doctype html><html><body></body></html>");
Object.assign(globalThis, {
  DOMParser: dom.window.DOMParser,
  XMLSerializer: dom.window.XMLSerializer,
  Node: dom.window.Node,
  Element: dom.window.Element,
  HTMLElement: dom.window.HTMLElement,
});

const [
  { responsiveDiagnosticsSystem },
  {
    getEngineSceneTemplates,
    loadEngineTemplateScene,
    preloadEngineTemplatePackages,
  },
] = await Promise.all([
  import("../src/layout/diagnostics"),
  import("../src/editor/engine/engineTemplates"),
]);

const product = {
  id: "readiness-product",
  name: "StoreBlink product",
  description: "A published product used by the theme readiness contract.",
  category: "Featured",
  image_url: "https://images.example.com/product.webp",
  price_cents: 25500,
  stock: 10,
};

await preloadEngineTemplatePackages();
const themes = getEngineSceneTemplates();

const breakpoints: Array<[ResponsiveBreakpoint, number]> = [
  ["desktop", 1440],
  ["tablet", 768],
  ["mobile", 390],
];

const blockingCodes = new Set([
  "horizontal-overflow",
  "clipped-content",
  "invisible-critical-control",
  "header-collision",
  "invalid-touch-target",
  "fixed-height-content-loss",
]);

let failureCount = 0;
for (const theme of themes) {
  const themeId = theme.id;
  const scene = await loadEngineTemplateScene(
    themeId,
    { business_name: "StoreBlink" },
    [product],
  );
  for (const [breakpoint, viewportWidth] of breakpoints) {
    const report = responsiveDiagnosticsSystem.analyze(scene, {
      breakpoint,
      viewportWidth,
    });
    const blocking = report.issues.filter((entry) => blockingCodes.has(entry.code));
    failureCount += blocking.length;
    const counts = Object.fromEntries(
      [...new Set(blocking.map((entry) => entry.code))]
        .sort()
        .map((code) => [code, blocking.filter((entry) => entry.code === code).length]),
    );
    console.log(JSON.stringify({
      themeId,
      breakpoint,
      viewportWidth,
      nodeCount: Object.keys(report.resolvedScene.nodes).length,
      blockingCount: blocking.length,
      counts,
      samples: blocking.slice(0, 24).map((entry) => ({
        code: entry.code,
        nodeId: entry.nodeId,
        parentId: entry.parentId,
        message: entry.message,
        frame: report.resolvedScene.nodes[entry.nodeId]?.transform,
        action: report.resolvedScene.nodes[entry.nodeId]?.extensions?.action,
        navigationTarget: report.resolvedScene.nodes[entry.nodeId]?.extensions?.navigationTarget,
      })),
    }));
  }
}

if (failureCount > 0) {
  console.error(`Theme readiness failed with ${failureCount} blocking diagnostics.`);
  process.exitCode = 1;
} else {
  console.log("Theme readiness passed for every certified viewport.");
}
