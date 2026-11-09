import { beforeEach, describe, expect, it } from "vitest";
import { createSceneNode } from "@/engine/scene-graph";
import { useResponsiveStore } from "@/stores/responsive.store";
import type { SceneTree } from "@/types";
import { ResponsiveSystem } from "./ResponsiveSystem";

const createScene = (): SceneTree => {
  const root = createSceneNode({
    id: "root",
    type: "section",
    name: "Root",
    transform: { x: 0, y: 0, width: 1200, height: 1800 },
    extensions: { responsiveBaseWidth: 1200 },
  }, null);
  const child = createSceneNode(
    {
      id: "child",
      type: "text",
      name: "Child",
      transform: { x: 120, y: 240, width: 360, height: 90 },
      props: { text: "Responsive", fontSize: 30 },
    },
    root.id,
  );
  root.childIds = [child.id];
  return { rootNodeId: root.id, nodes: { [root.id]: root, [child.id]: child } };
};

describe("ResponsiveSystem", () => {
  const responsive = new ResponsiveSystem();

  beforeEach(() => {
    useResponsiveStore.setState({ activeBreakpoint: "desktop" });
  });

  it("creates deterministic independent breakpoint overrides", () => {
    const scene = responsive.ensureSceneOverrides(createScene());
    const child = scene.nodes.child;
    const desktop = responsive.resolveNode(child, "desktop");
    const mobile = responsive.resolveNode(child, "mobile");

    expect(desktop.transform).toMatchObject({ x: 120, width: 360 });
    expect(mobile.transform.x).toBeCloseTo(39);
    expect(mobile.transform.width).toBeCloseTo(117);
    expect(mobile.props.fontSize).toBeCloseTo(9.75);
  });

  it("updates one breakpoint without changing the others", () => {
    const scene = responsive.ensureSceneOverrides(createScene());
    const child = scene.nodes.child;
    const nextLayout = responsive.updateLayout(child, "tablet", {
      transform: { ...responsive.resolveNode(child, "tablet").transform, x: 44, width: 300 },
    });
    const updated = { ...child, layout: nextLayout };

    expect(responsive.resolveNode(updated, "tablet").transform).toMatchObject({ x: 44, width: 300 });
    expect(responsive.resolveNode(updated, "desktop").transform).toMatchObject({ x: 120, width: 360 });
    expect(responsive.resolveNode(updated, "mobile").transform.x).toBeCloseTo(39);
  });

  it("shares the current mode only when explicitly requested", () => {
    const scene = responsive.ensureSceneOverrides(createScene());
    const child = scene.nodes.child;
    const tabletLayout = responsive.updateLayout(child, "tablet", {
      transform: { ...responsive.resolveNode(child, "tablet").transform, x: 72 },
    });
    const tabletNode = { ...child, layout: tabletLayout };
    const sharedNode = { ...tabletNode, layout: responsive.shareCurrentLayout(tabletNode, "tablet") };

    expect(responsive.resolveNode(sharedNode, "desktop").transform.x).toBe(72);
    expect(responsive.resolveNode(sharedNode, "mobile").transform.x).toBe(72);
    expect(responsive.hasManualTransform(sharedNode, "desktop")).toBe(true);
    expect(responsive.hasManualTransform(sharedNode, "tablet")).toBe(true);
    expect(responsive.hasManualTransform(sharedNode, "mobile")).toBe(true);
  });

  it("inherits individual mobile values from tablet and resets one value without losing others", () => {
    const node = createScene().nodes.child;
    node.layout = responsive.updateLayout(node, "tablet", { props: { fontSize: 24 } });
    node.layout = responsive.updateLayout(node, "mobile", {
      props: { textAlign: "center", fontWeight: 700 },
    });

    expect(responsive.resolveNode(node, "mobile").props).toMatchObject({
      fontSize: 24,
      textAlign: "center",
      fontWeight: 700,
    });
    expect(responsive.getValueSource(node, "mobile", "props", "fontSize")).toBe("tablet");
    expect(responsive.getValueSource(node, "mobile", "props", "textAlign")).toBe("mobile");

    node.layout = responsive.resetValueOverride(node, "mobile", "props", "textAlign");
    expect(responsive.resolveNode(node, "mobile").props.textAlign).toBeUndefined();
    expect(responsive.resolveNode(node, "mobile").props.fontWeight).toBe(700);
  });

  it("fits structured geometry to a 320px viewport without scaling touch height or body text", () => {
    const node = createSceneNode({
      id: "mobile-heading",
      type: "text",
      name: "Heading",
      transform: { x: 24, y: 40, width: 342, height: 146 },
      props: { text: "Heading", fontSize: 38 },
    }, null);
    node.layout = responsive.updateLayout(node, "mobile", {
      transform: { ...node.transform },
      props: { fontSize: 38 },
    });
    const resolved = responsive.resolveNodeForWidth(node, 320, "mobile");

    expect(resolved.transform.x).toBeCloseTo(19.69, 1);
    expect(resolved.transform.width).toBeCloseTo(280.62, 1);
    expect(resolved.transform.y).toBe(40);
    expect(resolved.transform.height).toBe(146);
    expect(resolved.props.fontSize).toBeGreaterThanOrEqual(31.1);
  });

  it("fills intermediate mobile and tablet widths without inflating typography", () => {
    const scene = responsive.ensureSceneOverrides(createScene());
    const root = scene.nodes.root;
    const child = scene.nodes.child;

    const mobileRoot = responsive.resolveNodeForWidth(root, 430, "mobile");
    const mobileChild = responsive.resolveNodeForWidth(child, 430, "mobile");
    const tabletRoot = responsive.resolveNodeForWidth(root, 820, "tablet");
    const wideDesktopRoot = responsive.resolveNodeForWidth(root, 1440, "desktop");

    expect(mobileRoot.transform.width).toBeCloseTo(430);
    expect(mobileChild.transform.x).toBeCloseTo(43);
    expect(mobileChild.props.fontSize).toBeCloseTo(9.75);
    expect(tabletRoot.transform.width).toBeCloseTo(820);
    expect(wideDesktopRoot.transform.width).toBe(1200);
  });

  it("uses scene-owned canonical widths without changing global defaults", () => {
    const source = createScene();
    source.nodes.root.extensions = {
      ...source.nodes.root.extensions,
      responsiveWidths: { desktop: 1440, tablet: 820, mobile: 430 },
    };
    source.nodes.root.transform.width = 1440;
    const scene = responsive.ensureSceneOverrides(source);

    expect(responsive.getSceneWidths(scene)).toEqual({
      desktop: 1440,
      tablet: 820,
      mobile: 430,
    });
    expect(
      responsive.resolveNodeForWidth(
        scene.nodes.root,
        1440,
        "desktop",
        responsive.getSceneWidth(scene, "desktop"),
      ).transform.width,
    ).toBe(1440);
    expect(
      responsive.resolveNode(scene.nodes.child, "mobile").transform.x,
    ).toBeCloseTo(35.83, 1);
    expect(responsive.getSceneWidth(createScene(), "desktop")).toBe(1200);
  });
});
