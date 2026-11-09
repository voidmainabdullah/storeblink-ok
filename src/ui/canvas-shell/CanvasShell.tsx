import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { useStore } from "zustand";
import { EDITOR_SYSTEM_KEYS } from "@/engine/kernel/systemKeys";
import { useEditorStores } from "@/engine/kernel/useEditorStores";
import { useEngineContext } from "@/engine/kernel/useEngine";
import type { SceneGraphAPI } from "@/engine/scene-graph";
import { DynamicSourceProvider, type DynamicSourceData } from "@/document/dynamic-sources";
import {
  createSelectionInputOrchestrator,
  SelectoAdapter,
  type SelectionSystem,
} from "@/interaction/selection";
import { isTypingTarget } from "@/interaction/keyboard";
import type { ToolSystem } from "@/interaction/tools";
import { MoveableAdapter } from "@/interaction/transform";
import { createCanvasGridStyle } from "@/rendering/canvas";
import type { HitTestingSystem } from "@/rendering/hit-testing";
import { OverlayRenderer } from "@/rendering/overlay";
import { ensureBuiltInRenderers } from "@/rendering/registry";
import { RenderNode } from "@/rendering/renderer";
import type { ViewportSystem } from "@/rendering/viewport";
import type { NodeId } from "@/types";
import { ThemeRuntimeProvider } from "@/theme-engine/runtime";
import type { ThemeBrandingSettings } from "@/theme-engine/branding";

ensureBuiltInRenderers();

const getClosestCanvasNodeId = (target: EventTarget | null): NodeId | null => {
  if (!(target instanceof Element)) return null;
  return target.closest("[data-node-id]")?.getAttribute("data-node-id") ?? null;
};

const isOverlayGestureTarget = (target: EventTarget | null): boolean => {
  if (!(target instanceof Element)) return false;
  return Boolean(
    target.closest(
      ".engine-moveable, .moveable-control-box, .moveable-control, .moveable-line, .moveable-rotation, .selecto-selection",
    ),
  );
};

const pointerClient = (event: Pick<ReactPointerEvent<HTMLDivElement>, "clientX" | "clientY">) => ({
  x: Number.isFinite(event.clientX) ? event.clientX : 0,
  y: Number.isFinite(event.clientY) ? event.clientY : 0,
});

export type CanvasShellProps = {
  className?: string;
  style?: CSSProperties;
  rootNodeId?: NodeId;
  showGrid?: boolean;
  dynamicSourceData?: DynamicSourceData;
  branding?: ThemeBrandingSettings | null;
};

export const CanvasShell = ({ className, style, rootNodeId, showGrid, dynamicSourceData = {}, branding = null }: CanvasShellProps) => {
  const engineContext = useEngineContext();
  const stores = useEditorStores();
  const shellRef = useRef<HTMLDivElement>(null);
  const pointerInputActiveRef = useRef(false);
  const panSessionRef = useRef<{ pointerId: number; clientX: number; clientY: number } | null>(null);
  const zoomFrameRef = useRef<number | null>(null);
  const pendingZoomRef = useRef<{ level: number; origin: { x: number; y: number } } | null>(null);
  const [shellElement, setShellElement] = useState<HTMLDivElement | null>(null);
  const [isPanning, setIsPanning] = useState(false);
  const canvasSize = useStore(stores.canvas, (state) => state.size);
  const canvasBackground = useStore(stores.canvas, (state) => state.background);
  const gridVisible = useStore(stores.canvas, (state) => state.gridVisible);
  const rulerVisible = useStore(stores.canvas, (state) => state.rulerVisible);
  const guides = useStore(stores.canvas, (state) => state.guides);
  const zoom = useStore(stores.viewport, (state) => state.zoom);
  const pan = useStore(stores.viewport, (state) => state.pan);
  const sceneRootNodeId = useStore(stores.scene, (state) => state.rootNodeId);
  const selectedIds = useStore(stores.selection, (state) => state.selectedIds);
  const activeBreakpoint = useStore(stores.responsive, (state) => state.activeBreakpoint);
  const activeTool = useStore(stores.tool, (state) => state.activeTool);
  const handToolActive = activeTool === "hand";
  const tools = engineContext.resolveSystem<ToolSystem>(EDITOR_SYSTEM_KEYS.tools);
  const viewport = engineContext.resolveSystem<ViewportSystem>(EDITOR_SYSTEM_KEYS.viewport);
  const hitTesting = engineContext.resolveSystem<HitTestingSystem>(EDITOR_SYSTEM_KEYS.hitTesting);
  const selection = engineContext.resolveSystem<SelectionSystem>(EDITOR_SYSTEM_KEYS.selection);
  const resolvedSceneGraph = engineContext.resolveSystem<SceneGraphAPI>(
    EDITOR_SYSTEM_KEYS.resolvedSceneGraph,
  );

  const bindShellRef = useCallback((node: HTMLDivElement | null) => {
    shellRef.current = node;
    setShellElement(node);
  }, []);

  const activeRootNodeId = rootNodeId ?? sceneRootNodeId;
  const activeThemeId = useStore(stores.scene, (state) => {
    const root = activeRootNodeId ? state.nodes[activeRootNodeId] : undefined;
    const themeId = root?.extensions?.themeId ?? root?.extensions?.template;
    return typeof themeId === "string" ? themeId : null;
  });

  const gridStyle = useMemo(
    () => ((showGrid ?? gridVisible) ? createCanvasGridStyle({ pan, zoom }) : undefined),
    [gridVisible, pan, showGrid, zoom],
  );

  const selectionInput = useMemo(
    () =>
      createSelectionInputOrchestrator({
        selection,
        hitTesting,
        viewport,
        getCanvasRect: () => {
          const rect = shellRef.current?.getBoundingClientRect();
          return rect ? { x: rect.left, y: rect.top } : null;
        },
      }),
    [hitTesting, selection, viewport],
  );

  useLayoutEffect(() => {
    hitTesting.rebuildIndex();
  }, [activeBreakpoint, hitTesting]);

  useLayoutEffect(() => {
    const element = shellRef.current;
    if (!element) return;

    const resize = () => {
      if (element.clientWidth <= 0 || element.clientHeight <= 0) return;
      viewport.setViewportSize({
        width: element.clientWidth,
        height: element.clientHeight,
      });
    };

    resize();

    if (typeof ResizeObserver === "undefined") return;

    const observer = new ResizeObserver(resize);
    observer.observe(element);
    return () => observer.disconnect();
  }, [viewport]);

  useEffect(() => {
    if (!shellElement) return;
    const handleWheel = (event: WheelEvent) => {
      if (!event.ctrlKey && !event.metaKey) return;
      event.preventDefault();
      const rect = shellElement.getBoundingClientRect();
      const origin = {
        x: event.clientX - rect.left,
        y: event.clientY - rect.top,
      };
      const delta =
        event.deltaMode === WheelEvent.DOM_DELTA_LINE
          ? event.deltaY * 16
          : event.deltaMode === WheelEvent.DOM_DELTA_PAGE
            ? event.deltaY * Math.max(1, rect.height)
            : event.deltaY;
      const currentZoom = pendingZoomRef.current?.level ?? stores.viewport.getState().zoom;
      pendingZoomRef.current = {
        level: currentZoom * Math.exp(-delta * 0.002),
        origin,
      };
      if (zoomFrameRef.current !== null) return;
      zoomFrameRef.current = window.requestAnimationFrame(() => {
        zoomFrameRef.current = null;
        const pending = pendingZoomRef.current;
        pendingZoomRef.current = null;
        if (pending) viewport.zoomTo(pending.level, pending.origin);
      });
    };
    shellElement.addEventListener("wheel", handleWheel, { passive: false });
    return () => {
      shellElement.removeEventListener("wheel", handleWheel);
      if (zoomFrameRef.current !== null) window.cancelAnimationFrame(zoomFrameRef.current);
      zoomFrameRef.current = null;
      pendingZoomRef.current = null;
    };
  }, [shellElement, stores.viewport, viewport]);

  useEffect(() => {
    if (!handToolActive) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") tools.activate("select");
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [handToolActive, tools]);

  const isPageBackgroundTarget = (target: EventTarget | null): boolean => {
    const nodeId = getClosestCanvasNodeId(target);
    return !nodeId || nodeId === activeRootNodeId;
  };

  const beginPan = (event: ReactPointerEvent<HTMLDivElement>): boolean => {
    if (!handToolActive || isOverlayGestureTarget(event.target)) return false;
    event.preventDefault();
    event.stopPropagation();
    const point = pointerClient(event);
    panSessionRef.current = { pointerId: event.pointerId, clientX: point.x, clientY: point.y };
    setIsPanning(true);
    event.currentTarget.setPointerCapture?.(event.pointerId);
    return true;
  };

  const updatePan = (event: ReactPointerEvent<HTMLDivElement>): boolean => {
    const session = panSessionRef.current;
    if (!session || session.pointerId !== event.pointerId) return false;
    event.preventDefault();
    const point = pointerClient(event);
    viewport.panBy({ x: point.x - session.clientX, y: point.y - session.clientY });
    panSessionRef.current = { ...session, clientX: point.x, clientY: point.y };
    return true;
  };

  const endPan = (event: ReactPointerEvent<HTMLDivElement>) => {
    const session = panSessionRef.current;
    if (!session || session.pointerId !== event.pointerId) return;
    panSessionRef.current = null;
    setIsPanning(false);
    event.currentTarget.releasePointerCapture?.(event.pointerId);
  };

  const handleSelectionPointerDown = (event: { target: EventTarget | null; clientX: number; clientY: number }) => {
    if (handToolActive || isOverlayGestureTarget(event.target)) return;
    const nodeId = getClosestCanvasNodeId(event.target);
    if (nodeId && selectedIds.includes(nodeId)) return;
    selectionInput.pointerDown(event);
  };

  const handleSelectionPointerMove = (event: { target: EventTarget | null; clientX: number; clientY: number }) => {
    if (handToolActive || isOverlayGestureTarget(event.target)) return;
    selectionInput.pointerMove(event);
  };

  return (
    <div
      ref={bindShellRef}
      className={className}
      data-editor-canvas-shell
      data-testid="canvas-shell"
      tabIndex={0}
      onPointerDown={(event) => {
        if (!isTypingTarget(event.target)) event.currentTarget.focus({ preventScroll: true });
        pointerInputActiveRef.current = true;
        if (beginPan(event)) return;
        handleSelectionPointerDown(event);
      }}
      onPointerMove={(event) => {
        pointerInputActiveRef.current = true;
        if (updatePan(event)) return;
        handleSelectionPointerMove(event);
      }}
      onPointerUp={endPan}
      onPointerCancel={endPan}
      onPointerLeave={() => {
        panSessionRef.current = null;
        setIsPanning(false);
        selectionInput.pointerLeave();
      }}
      onDoubleClick={(event) => {
        if (isOverlayGestureTarget(event.target) || !isPageBackgroundTarget(event.target)) return;
        event.preventDefault();
        tools.activate(handToolActive ? "select" : "hand");
      }}
      onMouseDown={(event) => {
        if (pointerInputActiveRef.current) return;
        handleSelectionPointerDown(event);
      }}
      onMouseMove={(event) => {
        if (pointerInputActiveRef.current) return;
        handleSelectionPointerMove(event);
      }}
      onMouseLeave={() => {
        selectionInput.pointerLeave();
      }}
      style={{
        position: "relative",
        width: "100%",
        height: "100%",
        minHeight: 0,
        overflow: "hidden",
        cursor: handToolActive ? (isPanning ? "grabbing" : "grab") : undefined,
        touchAction: handToolActive ? "none" : undefined,
        outline: "none",
        background: canvasBackground,
        ...gridStyle,
        ...style,
      }}
    >
      {rulerVisible ? (
        <>
          <div
            data-editor-canvas-ruler="x"
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              right: 0,
              height: 24,
              background: "rgba(255, 255, 255, 0.88)",
              borderBottom: "1px solid rgba(15, 23, 42, 0.12)",
              zIndex: 2,
              pointerEvents: "none",
            }}
          />
          <div
            data-editor-canvas-ruler="y"
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              bottom: 0,
              width: 24,
              background: "rgba(255, 255, 255, 0.88)",
              borderRight: "1px solid rgba(15, 23, 42, 0.12)",
              zIndex: 2,
              pointerEvents: "none",
            }}
          />
        </>
      ) : null}

      <div
        data-editor-canvas-surface
        style={{
          position: "absolute",
          left: 0,
          top: 0,
          width: canvasSize.width,
          height: canvasSize.height,
          background: canvasBackground,
          transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
          transformOrigin: "0 0",
          boxShadow: "0 24px 72px rgba(15, 23, 42, 0.18)",
        }}
      >
        {guides.map((guide) => (
          <div
            key={guide.id}
            data-editor-canvas-guide={guide.axis}
            style={{
              position: "absolute",
              left: guide.axis === "x" ? guide.position : 0,
              top: guide.axis === "y" ? guide.position : 0,
              width: guide.axis === "x" ? 1 : "100%",
              height: guide.axis === "y" ? 1 : "100%",
              background: "#38bdf8",
              pointerEvents: "none",
              zIndex: 100000,
            }}
          />
        ))}
        {activeRootNodeId ? (
          <ThemeRuntimeProvider themeId={activeThemeId} mode="editor" branding={branding}>
            <DynamicSourceProvider data={dynamicSourceData}>
              <RenderNode nodeId={activeRootNodeId} />
            </DynamicSourceProvider>
          </ThemeRuntimeProvider>
        ) : null}
      </div>
      <OverlayRenderer sceneGraph={resolvedSceneGraph} />
      <MoveableAdapter container={shellElement} />
      <SelectoAdapter
        container={shellElement}
        rootNodeId={activeRootNodeId ?? undefined}
        selection={selection}
        hitTesting={hitTesting}
        viewport={viewport}
      />
    </div>
  );
};

CanvasShell.displayName = "CanvasShell";
