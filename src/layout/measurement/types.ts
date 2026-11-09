import type { ElementType, SceneNode, SceneTree, Size } from "@/types";

export type IntrinsicMeasureContext = {
  scene?: SceneTree;
  availableWidth?: number;
  availableHeight?: number;
};

export type IntrinsicMeasurementProvider = (
  node: SceneNode,
  context: IntrinsicMeasureContext,
) => Size;

export type TextMeasurementRequest = {
  text: string;
  fontFamily: string;
  fontSize: number;
  fontWeight: string | number;
  letterSpacing: number;
};

export type TextMeasurementProvider = (request: TextMeasurementRequest) => number;

export interface IntrinsicMeasurementSystemAPI {
  register(type: ElementType | "custom:*", provider: IntrinsicMeasurementProvider): () => void;
  measure(node: SceneNode, context?: IntrinsicMeasureContext): Size;
  invalidate(nodeId?: string): void;
}
