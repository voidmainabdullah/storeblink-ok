import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_LAYOUT, DEFAULT_STYLE, DEFAULT_TRANSFORM, type SceneNode, type SceneTree } from "@/types";
import { CanvasShell } from "./CanvasShell";
import { rendererRegistry } from "@/rendering/registry";
import type { ElementRendererProps } from "@/rendering/registry";
import {
  createEditorKernel,
  EDITOR_SYSTEM_KEYS,
  EngineProvider,
} from "@/engine/kernel";
import type { SceneGraphAPI } from "@/engine/scene-graph";
import type { TransformSystem } from "@/interaction/transform";
import type { ToolSystem } from "@/interaction/tools";
import type { ViewportSystem } from "@/rendering/viewport";
import type { HitTestingSystem } from "@/rendering/hit-testing";
import type { EditorRuntimeStores } from "@/stores/editorRuntimeStores";
import type { EditorModeSystemAPI } from "@/interaction/modes";

const { moveableUpdateRect } = vi.hoisted(() => ({
  moveableUpdateRect: vi.fn(),
}));

vi.mock("react-moveable", async () => {
  const React = await vi.importActual<typeof import("react")>("react");
  return {
    default: React.forwardRef(({ hideDefaultLines }: { hideDefaultLines?: boolean }, ref) => {
      React.useImperativeHandle(ref, () => ({ updateRect: moveableUpdateRect }));
      return (
        <div
          data-testid="moveable-adapter"
          data-hide-default-lines={hideDefaultLines ? "true" : "false"}
        />
      );
    }),
  };
});

vi.mock("react-selecto", () => ({
  default: () => <div data-testid="selecto-adapter" />,
}));

const createNode = (overrides: Partial<SceneNode>): SceneNode => ({
  id: "node",
  type: "shape",
  name: "Node",
  parentId: null,
  childIds: [],
  props: {},
  style: { ...DEFAULT_STYLE, fills: [{ type: "solid", color: "#dbeafe" }] },
  layout: DEFAULT_LAYOUT,
  transform: DEFAULT_TRANSFORM,
  meta: { locked: false, hidden: false, createdAt: 1, updatedAt: 1 },
  ...overrides,
});

let kernel: ReturnType<typeof createEditorKernel>;
let stores: EditorRuntimeStores;
let commandGraph: SceneGraphAPI;
let transform: TransformSystem;
let tools: ToolSystem;
let viewport: ViewportSystem;
let hitTesting: HitTestingSystem;

const loadScene = () => {
  const root = createNode({
    id: "root",
    type: "section",
    name: "Root",
    childIds: ["shape", "sibling"],
    transform: { ...DEFAULT_TRANSFORM, width: 400, height: 300, transformOrigin: [0, 0] },
  });
  const shape = createNode({
    id: "shape",
    name: "Shape",
    parentId: "root",
    transform: { ...DEFAULT_TRANSFORM, x: 40, y: 40, width: 80, height: 60, transformOrigin: [0, 0] },
  });
  const sibling = createNode({
    id: "sibling",
    name: "Sibling",
    parentId: "root",
    transform: { ...DEFAULT_TRANSFORM, x: 200, y: 40, width: 80, height: 60, transformOrigin: [0, 0] },
  });
  const tree: SceneTree = { rootNodeId: "root", nodes: { root, shape, sibling } };
  commandGraph.deserializeTree(tree);
};

const resetStores = () => {
  stores.selection.setState({ selectedIds: [], hoveredId: null, activeId: null, editingId: null });
  stores.transform.getState().clearTransformFromTransformSystem();
  stores.tool.setState({ activeTool: "select" });
  stores.viewport.setState({ zoom: 1, pan: { x: 0, y: 0 }, viewportSize: { width: 800, height: 600 } });
  stores.canvas.setState({ size: { width: 800, height: 600 }, background: "#ffffff" });
};

const renderCanvas = () =>
  render(
    <EngineProvider kernel={kernel}>
      <CanvasShell />
    </EngineProvider>,
  );

const firePointer = (
  element: Element,
  type: "pointerdown" | "pointermove" | "pointerup",
  init: { clientX: number; clientY: number; pointerId?: number },
) => {
  const event = new Event(type, { bubbles: true, cancelable: true });
  Object.defineProperties(event, {
    clientX: { value: init.clientX },
    clientY: { value: init.clientY },
    pointerId: { value: init.pointerId ?? 1 },
  });
  fireEvent(element, event);
};

describe("CanvasShell selection integration", () => {
  beforeEach(() => {
    moveableUpdateRect.mockClear();
    kernel = createEditorKernel();
    stores = kernel.resolve<EditorRuntimeStores>(EDITOR_SYSTEM_KEYS.stores);
    commandGraph = kernel.resolve<SceneGraphAPI>(EDITOR_SYSTEM_KEYS.commandSceneGraph);
    transform = kernel.resolve<TransformSystem>(EDITOR_SYSTEM_KEYS.transform);
    tools = kernel.resolve<ToolSystem>(EDITOR_SYSTEM_KEYS.tools);
    viewport = kernel.resolve<ViewportSystem>(EDITOR_SYSTEM_KEYS.viewport);
    hitTesting = kernel.resolve<HitTestingSystem>(EDITOR_SYSTEM_KEYS.hitTesting);
    kernel
      .resolve<EditorModeSystemAPI>(EDITOR_SYSTEM_KEYS.editorMode)
      .setMode("independent");
    resetStores();
    loadScene();
  });

  it("selects through real hit testing, clears on empty click, and tracks hover separately", () => {
    renderCanvas();
    const shell = screen.getByTestId("canvas-shell");
    vi.spyOn(shell, "getBoundingClientRect").mockReturnValue({
      x: 0,
      y: 0,
      left: 0,
      top: 0,
      right: 800,
      bottom: 600,
      width: 800,
      height: 600,
      toJSON: () => ({}),
    });

    expect(viewport.screenToDocument({ x: 60, y: 60 })).toEqual({ x: 60, y: 60 });
    expect(hitTesting.hitTest({ x: 60, y: 60 })).toBe("shape");

    fireEvent.mouseMove(shell, { clientX: 60, clientY: 60 });
    expect(stores.selection.getState().hoveredId).toBe("shape");
    expect(stores.selection.getState().selectedIds).toEqual([]);

    fireEvent.mouseDown(shell, { clientX: 60, clientY: 60 });
    expect(stores.selection.getState().selectedIds).toEqual(["shape"]);
    expect(screen.getByTestId("selection-overlay").style.pointerEvents).toBe("none");
    expect(screen.getByTestId("selection-overlay")).toHaveAttribute(
      "data-editor-selection-outline-owner",
      "overlay",
    );
    expect(screen.getByTestId("moveable-adapter")).toHaveAttribute(
      "data-hide-default-lines",
      "true",
    );
    expect(document.querySelector('[data-editor-overlay-node-id="shape"]')).not.toBeNull();
    expect(document.querySelectorAll('[data-editor-overlay-kind="selected"]')).toHaveLength(1);

    fireEvent.mouseDown(shell, { clientX: 700, clientY: 500 });
    expect(stores.selection.getState().selectedIds).toEqual([]);
  });

  it("does not re-render node renderer components when selection and hover change", () => {
    let renderCount = 0;
    const CountingShapeRenderer = ({ node }: ElementRendererProps) => {
      renderCount += 1;
      return <div data-testid={`node-${node.id}`} style={{ position: "absolute", left: node.transform.x, top: node.transform.y, width: node.transform.width, height: node.transform.height }} />;
    };
    const unregister = rendererRegistry.register("shape", CountingShapeRenderer);

    renderCanvas();
    const initialRenderCount = renderCount;
    const shell = screen.getByTestId("canvas-shell");
    vi.spyOn(shell, "getBoundingClientRect").mockReturnValue({
      x: 0,
      y: 0,
      left: 0,
      top: 0,
      right: 800,
      bottom: 600,
      width: 800,
      height: 600,
      toJSON: () => ({}),
    });

    fireEvent.mouseMove(shell, { clientX: 60, clientY: 60 });
    fireEvent.mouseDown(shell, { clientX: 60, clientY: 60 });

    expect(renderCount).toBe(initialRenderCount);
    unregister();
  });

  it("leaves pointer-down on selected nodes for transform handling", () => {
    renderCanvas();
    const shell = screen.getByTestId("canvas-shell");
    vi.spyOn(shell, "getBoundingClientRect").mockReturnValue({
      x: 0,
      y: 0,
      left: 0,
      top: 0,
      right: 800,
      bottom: 600,
      width: 800,
      height: 600,
      toJSON: () => ({}),
    });

    act(() => {
      stores.selection.getState().setSelectedFromSelectionSystem(["shape"]);
    });

    const selectedNode = document.querySelector('[data-node-id="shape"]');
    expect(selectedNode).not.toBeNull();
    fireEvent.pointerDown(selectedNode as Element, { clientX: 60, clientY: 60, pointerId: 1 });

    expect(stores.selection.getState().selectedIds).toEqual(["shape"]);
  });

  it("double-clicks the page background into hand-tool panning without mutating scene nodes", () => {
    renderCanvas();
    const shell = screen.getByTestId("canvas-shell");
    vi.spyOn(shell, "getBoundingClientRect").mockReturnValue({
      x: 0,
      y: 0,
      left: 0,
      top: 0,
      right: 800,
      bottom: 600,
      width: 800,
      height: 600,
      toJSON: () => ({}),
    });
    const root = document.querySelector('[data-node-id="root"]');
    expect(root).not.toBeNull();
    const startRevision = stores.scene.getState().revision;

    fireEvent.doubleClick(root as Element, { clientX: 20, clientY: 20 });
    firePointer(root as Element, "pointerdown", { clientX: 100, clientY: 100 });
    firePointer(root as Element, "pointermove", { clientX: 140, clientY: 125 });
    firePointer(root as Element, "pointerup", { clientX: 140, clientY: 125 });

    expect(stores.viewport.getState().pan).toEqual({ x: 40, y: 25 });
    expect(stores.scene.getState().revision).toBe(startRevision);
    expect(stores.scene.getState().nodes.shape.transform).toMatchObject({ x: 40, y: 40 });
  });

  it("routes explicit hand-tool gestures to viewport pan instead of selection", () => {
    renderCanvas();
    const shell = screen.getByTestId("canvas-shell");
    vi.spyOn(shell, "getBoundingClientRect").mockReturnValue({
      x: 0,
      y: 0,
      left: 0,
      top: 0,
      right: 800,
      bottom: 600,
      width: 800,
      height: 600,
      toJSON: () => ({}),
    });
    const shape = document.querySelector('[data-node-id="shape"]');
    expect(shape).not.toBeNull();

    act(() => tools.activate("hand"));
    firePointer(shape as Element, "pointerdown", { clientX: 60, clientY: 60 });
    firePointer(shape as Element, "pointermove", { clientX: 105, clientY: 88 });
    firePointer(shape as Element, "pointerup", { clientX: 105, clientY: 88 });

    expect(stores.viewport.getState().pan).toEqual({ x: 45, y: 28 });
    expect(stores.selection.getState().selectedIds).toEqual([]);
  });

  it("zooms the canvas toward the cursor only for Ctrl or Cmd wheel gestures", async () => {
    renderCanvas();
    const shell = screen.getByTestId("canvas-shell");
    vi.spyOn(shell, "getBoundingClientRect").mockReturnValue({
      x: 0,
      y: 0,
      left: 0,
      top: 0,
      right: 800,
      bottom: 600,
      width: 800,
      height: 600,
      toJSON: () => ({}),
    });

    const normalWheel = new WheelEvent("wheel", { bubbles: true, cancelable: true, deltaY: -120, clientX: 200, clientY: 150 });
    shell.dispatchEvent(normalWheel);
    expect(normalWheel.defaultPrevented).toBe(false);
    expect(stores.viewport.getState().zoom).toBe(1);

    const canvasWheel = new WheelEvent("wheel", {
      bubbles: true,
      cancelable: true,
      ctrlKey: true,
      deltaY: -120,
      clientX: 200,
      clientY: 150,
    });
    await act(async () => {
      shell.dispatchEvent(canvasWheel);
      await new Promise((resolve) => window.requestAnimationFrame(resolve));
    });
    const { zoom, pan } = stores.viewport.getState();

    expect(canvasWheel.defaultPrevented).toBe(true);
    expect(zoom).toBeGreaterThan(1);
    expect((200 - pan.x) / zoom).toBeCloseTo(200, 5);
    expect((150 - pan.y) / zoom).toBeCloseTo(150, 5);
  });

  it("remeasures transform controls and keeps the overlay attached after camera changes", async () => {
    renderCanvas();
    act(() => {
      stores.selection.getState().setSelectedFromSelectionSystem(["shape"]);
    });
    await waitFor(() => expect(screen.getByTestId("moveable-adapter")).toBeInTheDocument());
    await act(async () => {
      await new Promise((resolve) => window.requestAnimationFrame(resolve));
    });
    moveableUpdateRect.mockClear();

    await act(async () => {
      viewport.zoomTo(2, { x: 0, y: 0 });
      viewport.panTo({ x: 25, y: 15 });
    });

    await waitFor(() => expect(moveableUpdateRect).toHaveBeenCalledTimes(1));
    expect(document.querySelector('[data-editor-overlay-node-id="shape"]')).not.toBeNull();
    expect(document.querySelector('[data-editor-overlay-kind="selected"]')?.getAttribute("points"))
      .toBe("105.00,95.00 265.00,95.00 265.00,215.00 105.00,215.00");
  });

  it("re-renders only the active node renderer during transform preview", async () => {
    const renderCounts: Record<string, number> = {};
    const CountingShapeRenderer = ({ node }: ElementRendererProps) => {
      renderCounts[node.id] = (renderCounts[node.id] ?? 0) + 1;
      return <div data-testid={`node-${node.id}`} style={{ position: "absolute", left: node.transform.x, top: node.transform.y, width: node.transform.width, height: node.transform.height }} />;
    };
    const unregister = rendererRegistry.register("shape", CountingShapeRenderer);

    renderCanvas();
    const initialShapeCount = renderCounts.shape;
    const initialSiblingCount = renderCounts.sibling;
    transform.configure({
      gridSize: 1000,
      snapThreshold: 0,
    });

    act(() => {
      transform.beginTransform(["shape"], "move");
      transform.updateTransform({ x: 24, y: 0 });
      transform.flushPreview();
    });

    await waitFor(() => expect(renderCounts.shape).toBeGreaterThan(initialShapeCount));
    expect(renderCounts.sibling).toBe(initialSiblingCount);
    unregister();
  });
});
