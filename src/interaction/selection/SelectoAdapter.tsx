import { memo, useState } from "react";
import Selecto from "react-selecto";
import type { SelectoEvents } from "selecto";
import type { HitTestingAPI } from "@/rendering/hit-testing";
import type { ViewportAPI } from "@/rendering/viewport";
import type { NodeId } from "@/types";
import { selectByScreenRect } from "./selecto-region";
import type { SelectionAPI } from "./state";

export type SelectoAdapterProps = {
  container: HTMLElement | null;
  rootNodeId?: NodeId;
  selection: SelectionAPI;
  hitTesting: HitTestingAPI;
  viewport: Pick<ViewportAPI, "screenToDocument">;
};

type MarqueeRect = {
  left: number;
  top: number;
  width: number;
  height: number;
};

const isMarqueeBlockedTarget = (target: EventTarget | null, rootNodeId?: NodeId): boolean => {
  if (!(target instanceof Element)) return false;
  const nodeElement = target.closest("[data-node-id]");
  if (nodeElement && nodeElement.getAttribute("data-node-id") !== rootNodeId) return true;
  return Boolean(
    target.closest(
      ".engine-moveable, .moveable-control-box, .moveable-control, .moveable-line, .moveable-rotation, .selecto-selection",
    ),
  );
};

const toCanvasMarqueeRect = (rect: SelectoEvents["drag"]["rect"], container: HTMLElement): MarqueeRect | null => {
  const containerRect = container.getBoundingClientRect();
  const left = Math.min(rect.left, rect.left + rect.width) - containerRect.left;
  const top = Math.min(rect.top, rect.top + rect.height) - containerRect.top;
  const width = Math.abs(rect.width);
  const height = Math.abs(rect.height);
  return width >= 2 && height >= 2 ? { left, top, width, height } : null;
};

export const SelectoAdapter = memo(({
  container,
  rootNodeId,
  selection,
  hitTesting,
  viewport,
}: SelectoAdapterProps) => {
  const [marqueeRect, setMarqueeRect] = useState<MarqueeRect | null>(null);

  if (!container) return null;

  const handleDrag = (event: SelectoEvents["drag"]) => {
    setMarqueeRect(toCanvasMarqueeRect(event.rect, container));
  };

  const handleDragEnd = (event: SelectoEvents["dragEnd"]) => {
    setMarqueeRect(null);
    if (event.isClick || event.rect.width < 2 || event.rect.height < 2) return;
    const canvasRect = container.getBoundingClientRect();
    selectByScreenRect(
      event.rect,
      { x: canvasRect.left, y: canvasRect.top },
      hitTesting,
      viewport,
      selection,
    );
  };

  return (
    <>
      <Selecto
        dragContainer={container}
        container={container}
        rootContainer={container}
        boundContainer={container}
        selectableTargets={[]}
        selectByClick={false}
        selectFromInside={false}
        preventDefault={false}
        preventClickEventOnDrag
        preventClickEventOnDragStart
        hitRate={0}
        dragCondition={(event) => !isMarqueeBlockedTarget(event.inputEvent?.target ?? null, rootNodeId)}
        onDrag={handleDrag}
        onDragEnd={handleDragEnd}
      />
      {marqueeRect ? (
        <div
          data-editor-marquee-selection
          style={{
            position: "absolute",
            left: marqueeRect.left,
            top: marqueeRect.top,
            width: marqueeRect.width,
            height: marqueeRect.height,
            border: "1px solid #0178ff",
            background: "rgba(13, 153, 255, 0.12)",
            boxSizing: "border-box",
            zIndex: 35,
            pointerEvents: "none",
          }}
        />
      ) : null}
      <style>{`
        .selecto-selection {
          border: 1px solid #0178ff !important;
          background: rgba(13, 153, 255, 0.12) !important;
          box-shadow: none !important;
          z-index: 35 !important;
          pointer-events: none !important;
        }
      `}</style>
    </>
  );
});

SelectoAdapter.displayName = "SelectoAdapter";
