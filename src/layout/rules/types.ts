import type { ElementType, SceneNode } from "@/types";

export type WrappingPolicy = "none" | "text" | "children";
export type StackingPolicy = "preserve" | "stack-on-narrow" | "wrap-on-narrow";
export type BreakpointBehavior = "inherit" | "reflow" | "collapse" | "hide-optional";
export type ContainerBehavior = "fixed" | "fluid" | "content";

export type ElementResponsiveRule = {
  type: ElementType | "custom:*";
  safeMinWidth: number;
  safeMinHeight: number;
  safeMaxWidth?: number;
  safeMaxHeight?: number;
  wrappingPolicy: WrappingPolicy;
  stackingPolicy: StackingPolicy;
  preserveAspectRatio: boolean;
  minimumFontSize?: number;
  maximumFontSize?: number;
  minimumTouchTarget?: number;
  breakpointBehavior: BreakpointBehavior;
  containerBehavior: ContainerBehavior;
};

export interface ResponsiveRuleRegistryAPI {
  register(rule: ElementResponsiveRule): () => void;
  resolve(node: SceneNode): ElementResponsiveRule;
  list(): readonly ElementResponsiveRule[];
}
