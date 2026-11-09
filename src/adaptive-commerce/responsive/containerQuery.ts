import { ResponsivePrimitiveError } from "./fluid";
import type { ContainerQueryPolicy } from "./types";

const policyName = /^[a-z][a-z0-9-]{0,63}$/;

type NormalizedRule = Readonly<{ min: number; max: number; variant: string }>;

const normalizeRules = (policy: ContainerQueryPolicy): NormalizedRule[] => {
  if (!policyName.test(policy.name) || !policyName.test(policy.fallbackVariant)) {
    throw new ResponsivePrimitiveError("Container query names and variants must use lowercase kebab-case.");
  }
  const variants = new Set<string>();
  const rules = policy.rules.map((rule) => {
    if (!policyName.test(rule.variant) || variants.has(rule.variant)) {
      throw new ResponsivePrimitiveError("Container query variants must be unique lowercase kebab-case names.");
    }
    variants.add(rule.variant);
    const min = rule.minInlineSize ?? 0;
    const max = rule.maxInlineSize ?? Number.POSITIVE_INFINITY;
    if (!Number.isFinite(min) || min < 0 || max <= min || Number.isNaN(max)) {
      throw new ResponsivePrimitiveError(`Container query variant ${rule.variant} has invalid bounds.`);
    }
    return { min, max, variant: rule.variant };
  }).sort((left, right) => left.min - right.min || left.max - right.max ||
    left.variant.localeCompare(right.variant, "en"));
  rules.forEach((rule, index) => {
    if (index > 0 && rule.min < rules[index - 1].max) {
      throw new ResponsivePrimitiveError("Container query rules must not overlap.");
    }
  });
  return rules;
};

export const resolveContainerQueryVariant = (
  policy: ContainerQueryPolicy,
  containerInlineSize: number,
): string => {
  const rules = normalizeRules(policy);
  if (!Number.isFinite(containerInlineSize) || containerInlineSize <= 0) {
    throw new ResponsivePrimitiveError("Container query size must be positive and finite.");
  }
  return rules.find((rule) =>
    containerInlineSize >= rule.min && containerInlineSize < rule.max,
  )?.variant ?? policy.fallbackVariant;
};
