import { describe, expect, it } from "vitest";
import { createSceneNode } from "@/engine/scene-graph";
import { IntrinsicMeasurementSystem } from "@/layout/measurement";
import { ResponsiveSystem } from "@/layout/responsive";
import { ResponsiveRuleRegistry } from "@/layout/rules";
import type { SceneNode, SceneTree } from "@/types";
import { LayoutEngine } from "./LayoutEngine";

const sceneWith = (root: SceneNode, children: SceneNode[]): SceneTree => {
  root.childIds = children.map((child) => child.id);
  return {
    rootNodeId: root.id,
    nodes: Object.fromEntries([root, ...children].map((node) => [node.id, node])),
  };
};

const system = () => new LayoutEngine(
  new ResponsiveSystem(),
  new IntrinsicMeasurementSystem({
    textMeasurement: ({ text, fontSize }) => text.length * fontSize * 0.5,
  }),
  new ResponsiveRuleRegistry(),
);

describe("LayoutEngine", () => {
  it("flows vertical children, fills the cross axis, and hugs content", () => {
    const root = createSceneNode({
      id: "root",
      type: "section",
      name: "Stack",
      transform: { width: 300, height: 400 },
      layout: {
        mode: "vertical",
        sizing: { height: { mode: "hug" } },
        autoLayout: { padding: 20, gap: 10, alignment: "stretch" },
      },
    }, null);
    const title = createSceneNode({
      id: "title",
      type: "text",
      name: "Title",
      props: { text: "Hello", fontSize: 20, lineHeight: 1.2 },
      transform: { width: 80, height: 20 },
      layout: { mode: "absolute", sizing: { width: { mode: "fill" }, height: { mode: "hug" } } },
    }, root.id);
    const action = createSceneNode({
      id: "action",
      type: "button",
      name: "Action",
      props: { label: "Buy" },
      transform: { width: 100, height: 44 },
      layout: { mode: "absolute", sizing: { width: { mode: "fill" }, height: { mode: "fixed", value: 44 } } },
    }, root.id);

    const result = system().compute(sceneWith(root, [title, action]), {
      breakpoint: "desktop",
      viewportWidth: 300,
    });

    expect(result.scene.nodes.title.transform).toMatchObject({ x: 20, y: 20, width: 260, height: 24 });
    expect(result.scene.nodes.action.transform).toMatchObject({ x: 20, y: 54, width: 260, height: 44 });
    expect(result.scene.nodes.root.transform.height).toBe(118);
  });

  it("collapses an automatic grid as available width narrows", () => {
    const root = createSceneNode({
      id: "grid",
      type: "section",
      name: "Products",
      transform: { width: 700, height: 500 },
      layout: {
        mode: "grid",
        autoLayout: { padding: 20, gap: 20, columns: "auto", minColumnWidth: 200 },
        responsiveIntent: { width: "fill", height: "hug", narrowBehavior: "stack" },
      },
    }, null);
    const cards = [0, 1, 2].map((index) => createSceneNode({
      id: `card-${index}`,
      type: "container",
      name: `Card ${index}`,
      transform: { width: 200, height: 100 },
    }, root.id));
    const source = sceneWith(root, cards);

    const wide = system().compute(source, { breakpoint: "desktop", viewportWidth: 700, forceViewportWidth: true });
    const narrow = system().compute(source, { breakpoint: "mobile", viewportWidth: 390, forceViewportWidth: true });

    expect(wide.scene.nodes["card-1"].transform.y).toBe(20);
    expect(wide.scene.nodes["card-1"].transform.x).toBeGreaterThan(200);
    expect(narrow.scene.nodes["card-1"].transform).toMatchObject({ x: 20, y: 140, width: 350 });
  });

  it("keeps a right constraint pinned when the parent width changes", () => {
    const root = createSceneNode({
      id: "root",
      type: "section",
      name: "Page",
      transform: { width: 1200, height: 400 },
      layout: { mode: "absolute", responsiveIntent: { width: "fill" } },
    }, null);
    const child = createSceneNode({
      id: "cart",
      type: "button",
      name: "Cart",
      transform: { x: 1000, y: 20, width: 100, height: 44 },
      layout: { mode: "absolute", constraints: { horizontal: "right", right: 100, vertical: "top" } },
    }, root.id);

    const result = system().compute(sceneWith(root, [child]), {
      breakpoint: "desktop",
      viewportWidth: 600,
      forceViewportWidth: true,
    });

    expect(result.scene.nodes.cart.transform.x).toBe(400);
    expect(result.scene.nodes.cart.transform.width).toBe(100);
  });

  it("fits unmanaged legacy children horizontally without storefront CSS scaling", () => {
    const root = createSceneNode({
      id: "root",
      type: "container",
      name: "Page",
      transform: { width: 390, height: 300 },
      layout: {
        mode: "vertical",
        sizing: { width: { mode: "fill" }, height: { mode: "hug" } },
      },
      extensions: { structuredPage: true, responsiveWidths: { mobile: 390 } },
    }, null);
    const section = createSceneNode({
      id: "section",
      type: "section",
      name: "Legacy section",
      transform: { width: 390, height: 300 },
      layout: { mode: "absolute", sizing: { width: { mode: "fill" }, height: { mode: "fixed" } } },
    }, root.id);
    const child = createSceneNode({
      id: "legacy-child",
      type: "text",
      name: "Legacy title",
      props: { text: "Title", fontSize: 32 },
      transform: { x: 24, y: 20, width: 342, height: 50 },
    }, section.id);
    root.childIds = [section.id];
    section.childIds = [child.id];
    const scene = {
      rootNodeId: root.id,
      nodes: { root, section, [child.id]: child },
    };

    const result = system().resolveSceneForViewport(scene, 320);
    const resolvedChild = result.scene.nodes[child.id];

    expect(result.scene.nodes.section.transform.width).toBe(320);
    expect(resolvedChild.transform.x + resolvedChild.transform.width).toBeLessThanOrEqual(320);
    expect(resolvedChild.props.fontSize).toBeGreaterThanOrEqual(12);
  });
});
