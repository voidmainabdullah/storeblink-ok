import {
  useCallback,
  useLayoutEffect,
  useRef,
  useState,
  type RefObject,
} from "react";
import type Moveable from "react-moveable";
import type { NodeId, Point, Size } from "@/types";
import {
  escapeSelectorValue,
  type MoveableTarget,
} from "./moveableEvents";

export const useMoveableTargetElements = (
  container: HTMLElement | null,
  nodeIds: NodeId[],
  sceneRevision: number,
) => {
  const [targets, setTargets] = useState<MoveableTarget[]>([]);

  useLayoutEffect(() => {
    if (!container || !nodeIds.length) {
      setTargets([]);
      return;
    }
    setTargets(
      nodeIds
        .map((nodeId) =>
          container.querySelector(
            `[data-node-id="${escapeSelectorValue(nodeId)}"]`,
          ),
        )
        .filter(
          (target): target is MoveableTarget =>
            target instanceof HTMLElement || target instanceof SVGElement,
        ),
    );
  }, [container, nodeIds, sceneRevision]);

  return targets;
};

export const useMoveableCameraSync = (
  moveableRef: RefObject<Moveable | null>,
  camera: {
    zoom: number;
    pan: Point;
    viewportSize: Size;
    sceneRevision: number;
    targets: MoveableTarget[];
  },
) => {
  const updateRectFrameRef = useRef<number | null>(null);
  const scheduleUpdateRect = useCallback(() => {
    if (typeof window === "undefined" || updateRectFrameRef.current !== null) {
      return;
    }
    updateRectFrameRef.current = window.requestAnimationFrame(() => {
      updateRectFrameRef.current = null;
      moveableRef.current?.updateRect();
    });
  }, [moveableRef]);

  useLayoutEffect(() => {
    scheduleUpdateRect();
  }, [
    camera.pan.x,
    camera.pan.y,
    camera.sceneRevision,
    camera.targets,
    camera.viewportSize.height,
    camera.viewportSize.width,
    camera.zoom,
    scheduleUpdateRect,
  ]);

  useLayoutEffect(
    () => () => {
      if (updateRectFrameRef.current !== null && typeof window !== "undefined") {
        window.cancelAnimationFrame(updateRectFrameRef.current);
      }
    },
    [],
  );
};
