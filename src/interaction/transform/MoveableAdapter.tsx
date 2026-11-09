import { memo, useCallback, useLayoutEffect, useMemo, useRef } from "react";
import Moveable, { type MoveableEvents } from "react-moveable";
import { useStore } from "zustand";
import { EDITOR_SYSTEM_KEYS } from "@/engine/kernel/systemKeys";
import { useEditorStores } from "@/engine/kernel/useEditorStores";
import { useEngineContext } from "@/engine/kernel/useEngine";
import type { NodeId, TransformData } from "@/types";
import type { TransformSystem } from "./state";
import type { ResponsiveSystem } from "@/layout/responsive";
import { useEditorMode } from "@/interaction/modes";
import { getDocumentDistance, getResizeTransformPatch } from "./resizeMath";
import {
  canTransformNode,
  shouldPreserveAspectRatio,
} from "./capabilities";
import {
  getTargetNodeId,
  toTransformPatchMap,
} from "./moveableEvents";
import {
  useMoveableCameraSync,
  useMoveableTargetElements,
} from "./useMoveableGeometry";
import "./MoveableAdapter.css";
export type MoveableAdapterProps = {
  container: HTMLElement | null;
};

export const MoveableAdapter = memo(({ container }: MoveableAdapterProps) => {
  const engine = useEngineContext();
  const stores = useEditorStores();
  const activeTransformSystem = engine.resolveSystem<TransformSystem>(
    EDITOR_SYSTEM_KEYS.transform,
  );
  const activeResponsiveSystem = engine.resolveSystem<ResponsiveSystem>(
    EDITOR_SYSTEM_KEYS.responsive,
  );
  const editorMode = useEditorMode();
  const selectedIds = useStore(stores.selection, (state) => state.selectedIds);
  const editingId = useStore(stores.selection, (state) => state.editingId);
  const sceneRevision = useStore(stores.scene, (state) => state.revision);
  const nodes = useStore(stores.scene, (state) => state.nodes);
  const zoom = useStore(stores.viewport, (state) => state.zoom);
  const pan = useStore(stores.viewport, (state) => state.pan);
  const viewportSize = useStore(stores.viewport, (state) => state.viewportSize);
  const activeBreakpoint = useStore(stores.responsive, (state) => state.activeBreakpoint);
  const transformableIds = useMemo(
    () =>
      selectedIds.filter((nodeId) => {
        const node = nodes[nodeId];
        return editorMode === "independent" && canTransformNode(node);
      }),
    [editorMode, nodes, selectedIds],
  );
  const moveableRef = useRef<Moveable | null>(null);
  const resizeStartTransformsRef = useRef<Record<NodeId, TransformData>>({});
  const interactionNodes = useMemo(
    () =>
      Object.fromEntries(
        transformableIds
          .map((nodeId) => nodes[nodeId])
          .filter(Boolean)
          .map((node) => [
            node.id,
            activeResponsiveSystem.hasOverrides(node)
              ? activeResponsiveSystem.resolveNode(node, activeBreakpoint)
              : node,
          ]),
      ),
    [activeBreakpoint, activeResponsiveSystem, nodes, transformableIds],
  );
  const keepRatio = useMemo(
    () =>
      transformableIds.some((nodeId) =>
        shouldPreserveAspectRatio(interactionNodes[nodeId]),
      ),
    [interactionNodes, transformableIds],
  );
  const targets = useMoveableTargetElements(
    container,
    transformableIds,
    sceneRevision,
  );
  useMoveableCameraSync(moveableRef, {
    zoom,
    pan,
    viewportSize,
    sceneRevision,
    targets,
  });
  const beginGesture = useCallback(
    (kind: "move" | "resize" | "rotate" | "scale") => {
      activeTransformSystem.beginTransform(transformableIds, kind);
    },
    [activeTransformSystem, transformableIds],
  );
  const clearResizeSession = useCallback(() => {
    resizeStartTransformsRef.current = {};
  }, []);
  const commitGesture = useCallback(() => {
    activeTransformSystem.commitTransform();
    clearResizeSession();
  }, [activeTransformSystem, clearResizeSession]);
  const cancelGesture = useCallback(() => {
    activeTransformSystem.cancelTransform();
    clearResizeSession();
  }, [activeTransformSystem, clearResizeSession]);
  const updateMove = useCallback(
    (event: Pick<MoveableEvents["drag"], "beforeDist" | "dist">) => {
      activeTransformSystem.updateTransform(getDocumentDistance(event.beforeDist ?? event.dist, zoom));
    },
    [activeTransformSystem, zoom],
  );
  useLayoutEffect(() => {
    const cancelActiveGesture = () => {
      if (stores.transform.getState().activeNodeIds.length) cancelGesture();
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") cancelActiveGesture();
    };
    const handleVisibilityChange = () => {
      if (document.visibilityState === "hidden") cancelActiveGesture();
    };
    window.addEventListener("blur", cancelActiveGesture);
    window.addEventListener("keydown", handleKeyDown);
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      window.removeEventListener("blur", cancelActiveGesture);
      window.removeEventListener("keydown", handleKeyDown);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [cancelGesture, stores.transform]);

  const updateResize = useCallback(
    (event: MoveableEvents["resize"]) => {
      const nodeId = getTargetNodeId(event.target);
      const initial = nodeId ? resizeStartTransformsRef.current[nodeId] : undefined;
      const patch = getResizeTransformPatch(initial, event);
      activeTransformSystem.updateTransform({
        nodes: nodeId ? { [nodeId]: patch } : {},
      });
    },
    [activeTransformSystem],
  );

  const updateRotate = useCallback((event: MoveableEvents["rotate"]) => {
    const nodeId = getTargetNodeId(event.target);
    activeTransformSystem.updateTransform({
      nodes: nodeId
        ? {
            [nodeId]: {
              rotation: event.beforeRotation,
            },
          }
        : {},
    });
  }, [activeTransformSystem]);

  const updateScale = useCallback((event: MoveableEvents["scale"]) => {
    const nodeId = getTargetNodeId(event.target);
    activeTransformSystem.updateTransform({
      nodes: nodeId
        ? {
            [nodeId]: {
              scaleX: event.scale[0],
              scaleY: event.scale[1],
            },
          }
        : {},
    });
  }, [activeTransformSystem]);

  const moveableTarget = useMemo(() => {
    if (!targets.length) return null;
    return targets.length === 1 ? targets[0] : targets;
  }, [targets]);

  if (!container || !transformableIds.length || editingId || !moveableTarget) return null;

  return (
    <Moveable
        ref={moveableRef}
        target={moveableTarget}
        container={container}
        rootContainer={container}
        className="engine-moveable"
        draggable
        resizable
        rotatable
        scalable
        origin={false}
        throttleDrag={0}
        throttleResize={0}
        throttleRotate={0}
        throttleScale={0}
        zoom={1}
        hideDefaultLines
        checkInput
        preventClickEventOnDrag
        linePadding={4}
        controlPadding={8}
        renderDirections={["nw", "n", "ne", "w", "e", "sw", "s", "se"]}
        keepRatio={keepRatio}
        onDragStart={(event) => {
          event.set([0, 0]);
          beginGesture("move");
        }}
        onDrag={updateMove}
        onDragEnd={(event) => {
          if (event.isDrag) commitGesture();
          else cancelGesture();
        }}
        onDragGroupStart={(event) => {
          event.events.forEach((childEvent) => childEvent.set([0, 0]));
          beginGesture("move");
        }}
        onDragGroup={updateMove}
        onDragGroupEnd={(event) => {
          if (event.isDrag) commitGesture();
          else cancelGesture();
        }}
        onResizeStart={(event) => {
          beginGesture("resize");
          const nodeId = getTargetNodeId(event.target);
          const initial = nodeId ? activeTransformSystem.getInitialTransform(nodeId) : undefined;
          resizeStartTransformsRef.current = nodeId && initial ? { [nodeId]: initial } : {};
          if (initial) event.set([initial.width, initial.height]);
          if (event.dragStart) event.dragStart.set([0, 0]);
        }}
        onResize={updateResize}
        onResizeEnd={(event) => {
          if (event.isDrag) commitGesture();
          else cancelGesture();
        }}
        onResizeGroupStart={(event) => {
          beginGesture("resize");
          const starts: Record<NodeId, TransformData> = {};
          event.events.forEach((childEvent) => {
            const nodeId = getTargetNodeId(childEvent.target);
            const initial = nodeId ? activeTransformSystem.getInitialTransform(nodeId) : undefined;
            if (nodeId && initial) starts[nodeId] = initial;
            if (initial) childEvent.set([initial.width, initial.height]);
            if (childEvent.dragStart) childEvent.dragStart.set([0, 0]);
          });
          resizeStartTransformsRef.current = starts;
        }}
        onResizeGroup={(event) => {
          activeTransformSystem.updateTransform(
            toTransformPatchMap(event.events, (childEvent, nodeId) => {
              const resizeEvent = childEvent as MoveableEvents["resize"];
              return getResizeTransformPatch(resizeStartTransformsRef.current[nodeId], resizeEvent);
            }),
          );
        }}
        onResizeGroupEnd={(event) => {
          if (event.isDrag) commitGesture();
          else cancelGesture();
        }}
        onRotateStart={() => beginGesture("rotate")}
        onRotate={updateRotate}
        onRotateEnd={(event) => {
          if (event.isDrag) commitGesture();
          else cancelGesture();
        }}
        onRotateGroupStart={() => beginGesture("rotate")}
        onRotateGroup={(event) => {
          activeTransformSystem.updateTransform(
            toTransformPatchMap(event.events, (childEvent) => ({
              rotation: (childEvent as MoveableEvents["rotate"]).beforeRotation,
            })),
          );
        }}
        onRotateGroupEnd={(event) => {
          if (event.isDrag) commitGesture();
          else cancelGesture();
        }}
        onScaleStart={(event) => {
          const nodeId = getTargetNodeId(event.target);
          const transform = nodeId ? interactionNodes[nodeId]?.transform : null;
          if (transform) event.set([transform.scaleX, transform.scaleY]);
          beginGesture("scale");
        }}
        onScale={updateScale}
        onScaleEnd={(event) => {
          if (event.isDrag) commitGesture();
          else cancelGesture();
        }}
        onScaleGroupStart={(event) => {
          event.events.forEach((childEvent) => {
            const nodeId = getTargetNodeId(childEvent.target);
            const transform = nodeId ? interactionNodes[nodeId]?.transform : null;
            if (transform) childEvent.set([transform.scaleX, transform.scaleY]);
          });
          beginGesture("scale");
        }}
        onScaleGroup={(event) => {
          activeTransformSystem.updateTransform(
            toTransformPatchMap(event.events, (childEvent) => {
              const scaleEvent = childEvent as MoveableEvents["scale"];
              return {
                scaleX: scaleEvent.scale[0],
                scaleY: scaleEvent.scale[1],
              };
            }),
          );
        }}
        onScaleGroupEnd={(event) => {
          if (event.isDrag) commitGesture();
          else cancelGesture();
        }}
    />
  );
});

MoveableAdapter.displayName = "MoveableAdapter";
