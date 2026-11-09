import { expect, test } from "@playwright/test";

test("generic storefront layout fits certified widths without root scaling", async ({ page }) => {
  await page.route("**/__phase4-layout-probe", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "text/html",
      body: "<!doctype html><html><head><meta charset=\"utf-8\"><style>html,body{margin:0;overflow-x:hidden}*{box-sizing:border-box}</style></head><body></body></html>",
    });
  });
  await page.goto("/__phase4-layout-probe");

  for (const width of [320, 390, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    const result = await page.evaluate(async () => {
      const sceneGraph = await (new Function(
        "return import('/src/engine/scene-graph/index.ts')",
      )() as Promise<typeof import("../../src/engine/scene-graph")>);
      const layoutModule = await (new Function(
        "return import('/src/layout/index.ts')",
      )() as Promise<typeof import("../../src/layout")>);
      const create = (
        input: Parameters<typeof sceneGraph.createSceneNode>[0],
        parentId: string | null,
      ) => sceneGraph.createSceneNode(input, parentId);
      const root = create({
        id: "probe-root",
        type: "container",
        name: "Store",
        transform: { width: 1200, height: 900 },
        layout: {
          mode: "vertical",
          sizing: { width: { mode: "fill" }, height: { mode: "hug" } },
          autoLayout: { gap: 0, alignment: "stretch" },
          responsiveIntent: { width: "fill", height: "hug", narrowBehavior: "stack" },
        },
      }, null);
      const header = create({
        id: "probe-header",
        type: "section",
        name: "Header",
        transform: { width: 1200, height: 72 },
        layout: {
          mode: "horizontal",
          sizing: { width: { mode: "fill" }, height: { mode: "hug", min: 72 } },
          autoLayout: { padding: 14, gap: 10, alignment: "center", wrap: true },
          responsiveIntent: { width: "fill", height: "hug", narrowBehavior: "wrap", overflow: "wrap" },
        },
      }, root.id);
      const headerItems = ["StoreBlink", "Home", "Products", "About", "Contact", "Cart"].map((label, index) =>
        create({
          id: `probe-nav-${index}`,
          type: index === 0 ? "text" : "button",
          name: label,
          props: index === 0 ? { text: label, fontSize: 20 } : { label, fontSize: 14 },
          transform: { width: index === 0 ? 130 : 84, height: index === 0 ? 28 : 44 },
          layout: {
            mode: "absolute",
            sizing: { width: { mode: "hug", min: index === 0 ? 100 : 44 }, height: { mode: "hug", min: index === 0 ? 24 : 44 } },
            autoLayout: { order: index },
            responsiveIntent: { width: "hug", height: "hug", minimumReadableSize: 12 },
          },
        }, header.id),
      );
      const grid = create({
        id: "probe-grid",
        type: "section",
        name: "Products",
        transform: { width: 1200, height: 700 },
        layout: {
          mode: "grid",
          sizing: { width: { mode: "fill" }, height: { mode: "hug" } },
          autoLayout: { padding: 16, gap: 16, columns: "auto", minColumnWidth: 220 },
          responsiveIntent: { width: "fill", height: "hug", narrowBehavior: "stack", overflow: "wrap" },
        },
      }, root.id);
      const cards = Array.from({ length: 6 }, (_, index) => create({
        id: `probe-card-${index}`,
        type: "container",
        name: `Product ${index + 1}`,
        transform: { width: 260, height: 220 },
        layout: {
          mode: "absolute",
          sizing: { width: { mode: "fill" }, height: { mode: "fixed", value: 220 } },
          autoLayout: { order: index },
          responsiveIntent: { width: "fill", height: "fixed" },
        },
        style: { fills: [{ type: "solid", color: "#f2f2f2" }], cornerRadius: 8 },
      }, grid.id));
      root.childIds = [header.id, grid.id];
      header.childIds = headerItems.map((node) => node.id);
      grid.childIds = cards.map((node) => node.id);
      const scene = {
        rootNodeId: root.id,
        nodes: Object.fromEntries([root, header, ...headerItems, grid, ...cards].map((node) => [node.id, node])),
      };
      const engine = new layoutModule.LayoutEngine(
        new layoutModule.ResponsiveSystem(),
        new layoutModule.IntrinsicMeasurementSystem(),
        new layoutModule.ResponsiveRuleRegistry(),
      );
      const resolved = engine.resolveSceneForViewport(scene, document.documentElement.clientWidth);
      document.body.replaceChildren();
      const render = (nodeId: string, parent: HTMLElement) => {
        const node = resolved.scene.nodes[nodeId];
        const element = document.createElement(node.type === "button" ? "button" : "div");
        element.dataset.nodeId = node.id;
        element.textContent = String(node.props.text ?? node.props.label ?? "");
        Object.assign(element.style, {
          position: node.id === resolved.scene.rootNodeId ? "relative" : "absolute",
          left: node.id === resolved.scene.rootNodeId ? "0px" : `${node.transform.x}px`,
          top: node.id === resolved.scene.rootNodeId ? "0px" : `${node.transform.y}px`,
          width: `${node.transform.width}px`,
          height: `${node.transform.height}px`,
          fontSize: node.props.fontSize ? `${node.props.fontSize}px` : undefined,
          background: node.style.fills[0]?.type === "solid" ? node.style.fills[0].color : undefined,
          border: node.type === "button" ? "1px solid #222" : "0",
        });
        parent.appendChild(element);
        node.childIds.forEach((childId) => render(childId, element));
      };
      render(resolved.scene.rootNodeId as string, document.body);
      const rootElement = document.querySelector<HTMLElement>('[data-node-id="probe-root"]') as HTMLElement;
      const buttons = [...document.querySelectorAll<HTMLElement>("button[data-node-id]")];
      const cardsElements = [...document.querySelectorAll<HTMLElement>('[data-node-id^="probe-card-"]')];
      return {
        rootWidth: rootElement.getBoundingClientRect().width,
        rootTransform: rootElement.style.transform,
        scrollWidth: document.documentElement.scrollWidth,
        viewportWidth: document.documentElement.clientWidth,
        minimumButtonWidth: Math.min(...buttons.map((button) => button.getBoundingClientRect().width)),
        minimumButtonHeight: Math.min(...buttons.map((button) => button.getBoundingClientRect().height)),
        firstCardY: cardsElements[0].getBoundingClientRect().y,
        secondCardY: cardsElements[1].getBoundingClientRect().y,
      };
    });

    expect(result.rootWidth).toBeLessThanOrEqual(result.viewportWidth + 0.5);
    expect(result.rootWidth).toBeGreaterThanOrEqual(Math.min(width, 1200) - 0.5);
    expect(result.rootTransform).toBe("");
    expect(result.scrollWidth).toBeLessThanOrEqual(result.viewportWidth);
    expect(result.minimumButtonWidth).toBeGreaterThanOrEqual(44);
    expect(result.minimumButtonHeight).toBeGreaterThanOrEqual(44);
    if (width === 320 || width === 390) {
      expect(result.secondCardY).toBeGreaterThan(result.firstCardY);
    }
  }
});
