import { describe, expect, it } from "vitest";
import { createSceneNode } from "@/engine/scene-graph";
import { LayoutEngine } from "@/layout/engine";
import { IntrinsicMeasurementSystem } from "@/layout/measurement";
import { ResponsiveSystem } from "@/layout/responsive";
import { ResponsiveRuleRegistry } from "@/layout/rules";
import type { SceneNode, SceneTree } from "@/types";
import { ResponsiveDiagnosticsSystem } from "./ResponsiveDiagnosticsSystem";

const createSystem = () => {
  const responsive = new ResponsiveSystem();
  const measurement = new IntrinsicMeasurementSystem({
    textMeasurement: ({ text, fontSize }) => text.length * fontSize * 0.5,
  });
  const rules = new ResponsiveRuleRegistry();
  const layout = new LayoutEngine(responsive, measurement, rules);
  return new ResponsiveDiagnosticsSystem(responsive, layout, measurement, rules);
};

const makeScene = (root: SceneNode, children: SceneNode[]): SceneTree => {
  root.childIds = children.map((child) => child.id);
  return {
    rootNodeId: root.id,
    nodes: Object.fromEntries([root, ...children].map((node) => [node.id, node])),
  };
};

describe("ResponsiveDiagnosticsSystem", () => {
  it("detects overflow, unreadable text, content loss, and touch targets", () => {
    const root = createSceneNode({
      id: "root",
      type: "section",
      name: "Page",
      transform: { width: 300, height: 200 },
      layout: { mode: "absolute", responsiveIntent: { width: "fill" } },
    }, null);
    const text = createSceneNode({
      id: "text",
      type: "text",
      name: "Caption",
      props: { text: "This text wraps", fontSize: 8, lineHeight: 1.2 },
      transform: { x: 250, y: 10, width: 100, height: 4 },
    }, root.id);
    const button = createSceneNode({
      id: "button",
      type: "button",
      name: "Buy",
      props: { label: "Buy" },
      transform: { x: 10, y: 80, width: 30, height: 30 },
    }, root.id);

    const report = createSystem().analyze(makeScene(root, [text, button]), {
      breakpoint: "desktop",
      viewportWidth: 300,
    });
    const codes = report.issues.map((candidate) => candidate.code);

    expect(codes).toContain("horizontal-overflow");
    expect(codes).toContain("unreadable-typography");
    expect(codes).toContain("fixed-height-content-loss");
    expect(codes).toContain("invalid-touch-target");
    expect(report.issues.find((candidate) => candidate.code === "horizontal-overflow")?.actions[0].kind).toBe("auto-fix");
  });

  it("applies an advisory fix immutably through breakpoint data", () => {
    const root = createSceneNode({
      id: "root",
      type: "section",
      name: "Page",
      transform: { width: 300, height: 200 },
      layout: { mode: "absolute", responsiveIntent: { width: "fill" } },
    }, null);
    const child = createSceneNode({
      id: "child",
      type: "shape",
      name: "Shape",
      transform: { x: 260, y: 10, width: 80, height: 40 },
    }, root.id);
    const source = makeScene(root, [child]);
    const system = createSystem();
    const diagnostic = system.analyze(source, { breakpoint: "desktop", viewportWidth: 300 }).issues
      .find((candidate) => candidate.code === "horizontal-overflow");
    if (!diagnostic) throw new Error("Expected overflow diagnostic.");

    const fixed = system.applyFix(source, diagnostic);

    expect(fixed.nodes.child.transform).toMatchObject({ x: 220, width: 80 });
    expect(source.nodes.child.transform.x).toBe(260);
  });

  it("reports hidden critical controls without treating the advisory as a blocker", () => {
    const root = createSceneNode({ id: "root", type: "section", name: "Page" }, null);
    const cart = createSceneNode({
      id: "cart",
      type: "button",
      name: "Cart",
      meta: { hidden: true },
      extensions: { action: "open-cart" },
    }, root.id);
    const report = createSystem().analyze(makeScene(root, [cart]), {
      breakpoint: "mobile",
      viewportWidth: 390,
    });

    expect(report.issues).toContainEqual(expect.objectContaining({
      code: "invisible-critical-control",
      severity: "advisory",
    }));
  });

  it("accepts renderer-backed hit targets and intentional responsive controls", () => {
    const root = createSceneNode({ id: "root", type: "section", name: "Page" }, null);
    const compactAction = createSceneNode({
      id: "compact-action",
      type: "button",
      name: "Compact action",
      transform: { width: 24, height: 24 },
      extensions: { action: "open-search" },
    }, root.id);
    const desktopMenu = createSceneNode({
      id: "desktop-menu",
      type: "button",
      name: "Mobile menu",
      meta: { hidden: true },
      extensions: { action: "toggle-mobile-menu" },
    }, root.id);
    const report = createSystem().analyze(makeScene(root, [compactAction, desktopMenu]), {
      breakpoint: "desktop",
      viewportWidth: 1200,
    });

    expect(report.issues).not.toContainEqual(expect.objectContaining({
      code: "invalid-touch-target",
      nodeId: compactAction.id,
    }));
    expect(report.issues).not.toContainEqual(expect.objectContaining({
      code: "invisible-critical-control",
      nodeId: desktopMenu.id,
    }));
  });
});
