import { act, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { rendererRegistry, type ElementRendererProps } from "@/rendering/registry";
import { useSceneStore } from "@/stores/scene.store";
import { useViewportStore } from "@/stores/viewport.store";
import { DEFAULT_LAYOUT, DEFAULT_STYLE, DEFAULT_TRANSFORM, type SceneNode, type SceneTree } from "@/types";
import { RenderNode } from "./RenderNode";
import { SceneRenderProvider } from "./SceneRenderProvider";
import { DynamicSourceProvider } from "@/document/dynamic-sources";

const root: SceneNode = {
  id: "public-root",
  type: "section",
  name: "Public root",
  parentId: null,
  childIds: [],
  props: {},
  style: { ...DEFAULT_STYLE },
  layout: DEFAULT_LAYOUT,
  transform: { ...DEFAULT_TRANSFORM, x: 5000, y: 5000, width: 1200, height: 1600 },
  meta: { locked: false, hidden: false, createdAt: 1, updatedAt: 1 },
};

const scene: SceneTree = {
  rootNodeId: root.id,
  nodes: { [root.id]: root },
};

describe("SceneRenderProvider", () => {
  afterEach(() => {
    act(() => {
      useSceneStore.getState().clearSceneFromEngine();
    });
  });

  it("renders a readonly scene without loading it into the editor scene or viewport", () => {
    const unregister = rendererRegistry.register("section", ({ node }: ElementRendererProps) => (
      <div data-testid="public-scene-node">{node.name}</div>
    ));
    useViewportStore.setState({ zoom: 1, pan: { x: 0, y: 0 }, viewportSize: { width: 320, height: 240 } });
    const viewportBefore = useViewportStore.getState().getViewportSnapshot();

    render(
      <SceneRenderProvider scene={scene}>
        <RenderNode nodeId={root.id} />
      </SceneRenderProvider>,
    );

    expect(screen.getByTestId("public-scene-node")).toHaveTextContent("Public root");
    expect(useSceneStore.getState().rootNodeId).toBeNull();
    expect(useViewportStore.getState().getViewportSnapshot()).toEqual(viewportBefore);
    unregister();
  });

  it("still respects Scene Graph visibility while viewport culling is disabled", () => {
    const unregister = rendererRegistry.register("section", ({ node }: ElementRendererProps) => (
      <div data-testid="hidden-public-node">{node.name}</div>
    ));
    const hiddenScene: SceneTree = {
      rootNodeId: root.id,
      nodes: {
        [root.id]: { ...root, meta: { ...root.meta, hidden: true } },
      },
    };

    render(
      <SceneRenderProvider scene={hiddenScene}>
        <RenderNode nodeId={root.id} />
      </SceneRenderProvider>,
    );

    expect(screen.queryByTestId("hidden-public-node")).toBeNull();
    unregister();
  });

  it("supports public runtime visibility without mutating persisted node metadata", () => {
    const unregister = rendererRegistry.register("section", ({ node }: ElementRendererProps) => (
      <div data-testid="runtime-visible-node">{node.name}</div>
    ));
    const hiddenScene: SceneTree = {
      rootNodeId: root.id,
      nodes: { [root.id]: { ...root, meta: { ...root.meta, hidden: true } } },
    };

    render(
      <SceneRenderProvider scene={hiddenScene} visibilityOverrides={{ [root.id]: true }}>
        <RenderNode nodeId={root.id} />
      </SceneRenderProvider>,
    );

    expect(screen.getByTestId("runtime-visible-node")).toHaveTextContent("Public root");
    expect(hiddenScene.nodes[root.id].meta.hidden).toBe(true);
    unregister();
  });

  it("resolves live product bindings through the shared RenderNode path", () => {
    const dynamicRoot: SceneNode = {
      ...root,
      id: "dynamic-root",
      type: "text",
      props: { text: "Product" },
      extensions: {
        dynamicBinding: { source: "product", field: "name", target: "text", productId: "p1" },
      },
    };
    const dynamicScene: SceneTree = {
      rootNodeId: dynamicRoot.id,
      nodes: { [dynamicRoot.id]: dynamicRoot },
    };
    const unregister = rendererRegistry.register("text", ({ node }: ElementRendererProps) => (
      <div data-testid="dynamic-product-name">{String(node.props.text)}</div>
    ));

    render(
      <DynamicSourceProvider data={{ products: [{ id: "p1", name: "Live product" }] }}>
        <SceneRenderProvider scene={dynamicScene}>
          <RenderNode nodeId={dynamicRoot.id} />
        </SceneRenderProvider>
      </DynamicSourceProvider>,
    );

    expect(screen.getByTestId("dynamic-product-name")).toHaveTextContent("Live product");
    unregister();
  });

  it("uses real viewport width geometry for structured public rendering", () => {
    const fluidRoot: SceneNode = {
      ...root,
      id: "fluid-root",
      transform: { ...root.transform, x: 24, y: 0, width: 342, height: 200 },
      props: { fontSize: 38 },
      extensions: { structuredPage: true },
    };
    const fluidScene: SceneTree = {
      rootNodeId: fluidRoot.id,
      nodes: { [fluidRoot.id]: fluidRoot },
    };
    const unregister = rendererRegistry.register("section", ({ node }: ElementRendererProps) => (
      <div
        data-testid="fluid-public-node"
        data-x={node.transform.x}
        data-width={node.transform.width}
        data-height={node.transform.height}
      />
    ));

    render(
      <SceneRenderProvider scene={fluidScene} breakpoint="mobile" viewportWidth={320}>
        <RenderNode nodeId={fluidRoot.id} />
      </SceneRenderProvider>,
    );

    const rendered = screen.getByTestId("fluid-public-node");
    expect(Number(rendered.getAttribute("data-x"))).toBeCloseTo(19.69, 1);
    expect(Number(rendered.getAttribute("data-width"))).toBeCloseTo(280.62, 1);
    expect(Number(rendered.getAttribute("data-height"))).toBe(200);
    unregister();
  });

  it("does not resolve breakpoint geometry twice for a precomputed storefront scene", () => {
    const resolvedRoot: SceneNode = {
      ...root,
      id: "resolved-root",
      transform: { ...root.transform, x: 19.69, width: 280.62, height: 200 },
      extensions: { structuredPage: true },
    };
    const resolvedScene: SceneTree = {
      rootNodeId: resolvedRoot.id,
      nodes: { [resolvedRoot.id]: resolvedRoot },
    };
    const unregister = rendererRegistry.register("section", ({ node }: ElementRendererProps) => (
      <div data-testid="resolved-public-node" data-x={node.transform.x} data-width={node.transform.width} />
    ));

    render(
      <SceneRenderProvider
        scene={resolvedScene}
        breakpoint="mobile"
        viewportWidth={320}
        layoutResolved
      >
        <RenderNode nodeId={resolvedRoot.id} />
      </SceneRenderProvider>,
    );

    const rendered = screen.getByTestId("resolved-public-node");
    expect(Number(rendered.getAttribute("data-x"))).toBeCloseTo(19.69, 2);
    expect(Number(rendered.getAttribute("data-width"))).toBeCloseTo(280.62, 2);
    unregister();
  });

  it("does not rerender Scene nodes when only the viewport camera changes", () => {
    const renderSpy = vi.fn();
    const unregister = rendererRegistry.register("section", ({ node }: ElementRendererProps) => {
      renderSpy(node.id);
      return <div data-testid="camera-stable-node">{node.name}</div>;
    });
    useSceneStore.getState().replaceSceneFromEngine({
      rootNodeId: root.id,
      nodes: { [root.id]: { ...root, transform: { ...root.transform, x: 0, y: 0 } } },
    });

    render(<RenderNode nodeId={root.id} />);
    expect(renderSpy).toHaveBeenCalledTimes(1);

    act(() => {
      useViewportStore.setState({
        pan: { x: 240, y: 160 },
        zoom: 1.25,
        viewportSize: { width: 900, height: 700 },
      });
    });

    expect(screen.getByTestId("camera-stable-node")).toBeInTheDocument();
    expect(renderSpy).toHaveBeenCalledTimes(1);
    unregister();
  });
});
