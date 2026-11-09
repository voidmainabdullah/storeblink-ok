import type { BuiltInElementType, ElementType, SceneNode } from "@/types";
import type {
  ElementResponsiveRule,
  ResponsiveRuleRegistryAPI,
} from "./types";

const baseRule = (
  type: ElementResponsiveRule["type"],
  patch: Partial<ElementResponsiveRule> = {},
): ElementResponsiveRule => ({
  type,
  safeMinWidth: 1,
  safeMinHeight: 1,
  wrappingPolicy: "none",
  stackingPolicy: "preserve",
  preserveAspectRatio: false,
  breakpointBehavior: "inherit",
  containerBehavior: "fixed",
  ...patch,
});

const builtInRules: Record<BuiltInElementType, ElementResponsiveRule> = {
  text: baseRule("text", {
    safeMinWidth: 24,
    safeMinHeight: 12,
    wrappingPolicy: "text",
    stackingPolicy: "stack-on-narrow",
    minimumFontSize: 12,
    maximumFontSize: 160,
    breakpointBehavior: "reflow",
    containerBehavior: "content",
  }),
  image: baseRule("image", {
    safeMinWidth: 24,
    safeMinHeight: 24,
    stackingPolicy: "stack-on-narrow",
    preserveAspectRatio: true,
    breakpointBehavior: "reflow",
    containerBehavior: "fluid",
  }),
  button: baseRule("button", {
    safeMinWidth: 44,
    safeMinHeight: 44,
    wrappingPolicy: "text",
    stackingPolicy: "wrap-on-narrow",
    minimumFontSize: 12,
    minimumTouchTarget: 44,
    breakpointBehavior: "reflow",
    containerBehavior: "content",
  }),
  container: baseRule("container", {
    safeMinWidth: 1,
    safeMinHeight: 1,
    wrappingPolicy: "children",
    stackingPolicy: "stack-on-narrow",
    breakpointBehavior: "reflow",
    containerBehavior: "fluid",
  }),
  section: baseRule("section", {
    safeMinWidth: 1,
    safeMinHeight: 1,
    wrappingPolicy: "children",
    stackingPolicy: "stack-on-narrow",
    breakpointBehavior: "reflow",
    containerBehavior: "fluid",
  }),
  shape: baseRule("shape", {
    safeMinWidth: 8,
    safeMinHeight: 8,
    preserveAspectRatio: false,
    breakpointBehavior: "reflow",
    containerBehavior: "fluid",
  }),
  svg: baseRule("svg", {
    safeMinWidth: 16,
    safeMinHeight: 16,
    preserveAspectRatio: true,
    breakpointBehavior: "reflow",
    containerBehavior: "fluid",
  }),
  video: baseRule("video", {
    safeMinWidth: 120,
    safeMinHeight: 68,
    preserveAspectRatio: true,
    stackingPolicy: "stack-on-narrow",
    breakpointBehavior: "reflow",
    containerBehavior: "fluid",
  }),
};

const customFallback = baseRule("custom:*", {
  wrappingPolicy: "children",
  stackingPolicy: "stack-on-narrow",
  breakpointBehavior: "reflow",
  containerBehavior: "fluid",
});

const validateRule = (rule: ElementResponsiveRule): void => {
  const numeric = [
    rule.safeMinWidth,
    rule.safeMinHeight,
    rule.safeMaxWidth,
    rule.safeMaxHeight,
    rule.minimumFontSize,
    rule.maximumFontSize,
    rule.minimumTouchTarget,
  ].filter((value): value is number => value !== undefined);
  if (numeric.some((value) => !Number.isFinite(value) || value < 0)) {
    throw new Error(`Responsive rule ${rule.type} contains an invalid size.`);
  }
  if (rule.safeMaxWidth !== undefined && rule.safeMaxWidth < rule.safeMinWidth) {
    throw new Error(`Responsive rule ${rule.type} maximum width is below its minimum.`);
  }
  if (rule.safeMaxHeight !== undefined && rule.safeMaxHeight < rule.safeMinHeight) {
    throw new Error(`Responsive rule ${rule.type} maximum height is below its minimum.`);
  }
};

export class ResponsiveRuleRegistry implements ResponsiveRuleRegistryAPI {
  private readonly rules = new Map<ElementResponsiveRule["type"], ElementResponsiveRule>();

  register(rule: ElementResponsiveRule): () => void {
    validateRule(rule);
    const frozen = Object.freeze({ ...rule });
    this.rules.set(rule.type, frozen);
    return () => {
      if (this.rules.get(rule.type) === frozen) this.rules.delete(rule.type);
    };
  }

  resolve(node: SceneNode): ElementResponsiveRule {
    const rule =
      this.rules.get(node.type) ??
      (node.type.startsWith("custom:") ? this.rules.get("custom:*") : undefined) ??
      builtInRules[node.type as BuiltInElementType] ??
      customFallback;
    const intent = node.layout.responsiveIntent;
    return {
      ...rule,
      preserveAspectRatio: intent?.preserveAspectRatio ?? rule.preserveAspectRatio,
      minimumFontSize: intent?.minimumReadableSize ?? rule.minimumFontSize,
      stackingPolicy:
        intent?.narrowBehavior === "stack"
          ? "stack-on-narrow"
          : intent?.narrowBehavior === "wrap"
            ? "wrap-on-narrow"
            : rule.stackingPolicy,
    };
  }

  list(): readonly ElementResponsiveRule[] {
    return [...Object.values(builtInRules), customFallback, ...this.rules.values()];
  }
}

export const createResponsiveRuleRegistry = () => new ResponsiveRuleRegistry();
export const responsiveRuleRegistry = createResponsiveRuleRegistry();
