import type {
  DesignTokenAddress,
  DesignTokenTier,
  DesignTokenType,
  JsonValue,
} from "@/adaptive-commerce/contracts";

export type ResolvedTokenSource = DesignTokenTier | "merchant";

export type ResolvedDesignToken = Readonly<{
  address: DesignTokenAddress;
  path: string;
  type: DesignTokenType;
  value: JsonValue;
  declaredTier: DesignTokenTier;
  source: ResolvedTokenSource;
  overridden: boolean;
}>;

export type ResolvedDesignTokenSet = Readonly<{
  tokens: Readonly<Record<string, ResolvedDesignToken>>;
  order: readonly DesignTokenAddress[];
}>;
