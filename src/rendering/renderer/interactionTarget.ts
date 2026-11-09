import type { CSSProperties } from "react";
import type { SceneNode } from "@/types";

export const DEFAULT_INTERACTION_TARGET_SIZE = 44;

const finitePositiveNumber = (value: unknown): number | null => {
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric > 0 ? numeric : null;
};

export const isActionableNode = (node: SceneNode): boolean =>
  Boolean(
    node.extensions?.action ||
    node.extensions?.navigationTarget ||
    node.extensions?.productId,
  );

export const getInteractionTargetSize = (node: SceneNode): number | null => {
  if (!isActionableNode(node)) return null;
  return (
    finitePositiveNumber(node.extensions?.minimumInteractionTarget) ??
    finitePositiveNumber(node.props.minimumInteractionTarget) ??
    DEFAULT_INTERACTION_TARGET_SIZE
  );
};

export const getInteractionTargetStyle = (node: SceneNode): CSSProperties | null => {
  const size = getInteractionTargetSize(node);
  if (!size) return null;
  return {
    position: "absolute",
    left: "50%",
    top: "50%",
    width: `max(100%, ${size}px)`,
    height: `max(100%, ${size}px)`,
    transform: "translate(-50%, -50%)",
    background: "transparent",
    pointerEvents: "auto",
  };
};
