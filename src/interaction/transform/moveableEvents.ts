import type { MoveableEvents } from "react-moveable";
import type { NodeId, TransformData } from "@/types";
import type { TransformMapDelta } from "./state";

export type MoveableTarget = HTMLElement | SVGElement;

export const escapeSelectorValue = (value: string): string =>
  value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');

export const getTargetNodeId = (
  target: EventTarget | null | undefined,
): NodeId | null => {
  if (!(target instanceof Element)) return null;
  return target.getAttribute("data-node-id");
};

export const toTransformPatchMap = (
  events: Array<
    MoveableEvents["resize"] |
    MoveableEvents["rotate"] |
    MoveableEvents["scale"]
  >,
  buildPatch: (
    event:
      MoveableEvents["resize"] |
      MoveableEvents["rotate"] |
      MoveableEvents["scale"],
    nodeId: NodeId,
  ) => Partial<TransformData>,
): TransformMapDelta => ({
  nodes: Object.fromEntries(
    events
      .map((event) => {
        const nodeId = getTargetNodeId(event.target);
        return nodeId ? [nodeId, buildPatch(event, nodeId)] : null;
      })
      .filter(
        (entry): entry is [NodeId, Partial<TransformData>] => Boolean(entry),
      ),
  ),
});
