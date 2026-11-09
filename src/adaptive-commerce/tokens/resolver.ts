import {
  designTokenSetSchema,
  merchantDesignTokenOverridesSchema,
  type DesignTokenAddress,
  type DesignTokenEntry,
  type DesignTokenLiteral,
  type DesignTokenReference,
  type DesignTokenSet,
  type DesignTokenTier,
  type MerchantDesignTokenOverrides,
} from "@/adaptive-commerce/contracts/designPack";
import { cloneAndFreeze } from "@/adaptive-commerce/compiler/immutable";
import { AdaptiveTokenError } from "./errors";
import type { ResolvedDesignToken, ResolvedDesignTokenSet, ResolvedTokenSource } from "./types";
import { assertTokenLiteralValue } from "./value";

type TokenDefinition = {
  address: DesignTokenAddress;
  path: string;
  declaredTier: DesignTokenTier;
  source: ResolvedTokenSource;
  entry: DesignTokenEntry;
};

const tiers = ["primitive", "semantic", "component"] as const;
const rank: Record<DesignTokenTier, number> = { primitive: 0, semantic: 1, component: 2 };

const isReference = (entry: DesignTokenEntry): entry is DesignTokenReference =>
  typeof (entry as DesignTokenReference).$ref === "string";

const schemaError = (error: unknown): AdaptiveTokenError => new AdaptiveTokenError(
  "TOKEN_SCHEMA_INVALID",
  error instanceof Error ? error.message : "Design token input is invalid.",
);

const definitionsFor = (tokens: DesignTokenSet): Map<string, TokenDefinition> => {
  const definitions = new Map<string, TokenDefinition>();
  tiers.forEach((tier) => {
    Object.entries(tokens[tier]).forEach(([path, entry]) => {
      const address = `${tier}:${path}` as DesignTokenAddress;
      definitions.set(address, { address, path, declaredTier: tier, source: tier, entry });
    });
  });
  return definitions;
};

const resolveDefinitions = (
  definitions: ReadonlyMap<string, TokenDefinition>,
): Map<string, ResolvedDesignToken> => {
  const resolved = new Map<string, ResolvedDesignToken>();
  const visiting: string[] = [];

  const resolve = (address: string): ResolvedDesignToken => {
    const cached = resolved.get(address);
    if (cached) return cached;
    const cycleAt = visiting.indexOf(address);
    if (cycleAt >= 0) {
      const cycle = [...visiting.slice(cycleAt), address].join(" -> ");
      throw new AdaptiveTokenError(
        "TOKEN_REFERENCE_CYCLE",
        `Design token reference cycle: ${cycle}.`,
        address,
      );
    }
    const definition = definitions.get(address);
    if (!definition) {
      throw new AdaptiveTokenError(
        "TOKEN_REFERENCE_MISSING",
        `Design token reference ${address} does not exist.`,
        address,
      );
    }
    visiting.push(address);
    try {
      let token: ResolvedDesignToken;
      if (isReference(definition.entry)) {
        const target = definitions.get(definition.entry.$ref);
        if (!target) {
          throw new AdaptiveTokenError(
            "TOKEN_REFERENCE_MISSING",
            `${definition.address} references missing token ${definition.entry.$ref}.`,
            definition.address,
          );
        }
        if (rank[target.declaredTier] > rank[definition.declaredTier]) {
          throw new AdaptiveTokenError(
            "TOKEN_REFERENCE_DIRECTION",
            `${definition.address} cannot reference higher tier ${target.address}.`,
            definition.address,
          );
        }
        const targetToken = resolve(target.address);
        const inheritedMerchantOverride = targetToken.overridden;
        token = {
          address: definition.address,
          path: definition.path,
          type: targetToken.type,
          value: structuredClone(targetToken.value),
          declaredTier: definition.declaredTier,
          source: inheritedMerchantOverride ? "merchant" : definition.source,
          overridden: definition.source === "merchant" || inheritedMerchantOverride,
        };
      } else {
        const literal = definition.entry as DesignTokenLiteral;
        assertTokenLiteralValue(literal, definition.address);
        token = {
          address: definition.address,
          path: definition.path,
          type: literal.$type,
          value: structuredClone(literal.$value),
          declaredTier: definition.declaredTier,
          source: definition.source,
          overridden: definition.source === "merchant",
        };
      }
      resolved.set(address, token);
      return token;
    } finally {
      visiting.pop();
    }
  };

  [...definitions.keys()].sort((left, right) => left.localeCompare(right, "en")).forEach(resolve);
  return resolved;
};

export const resolveDesignTokens = (
  input: DesignTokenSet,
  merchantInput: MerchantDesignTokenOverrides = { presetId: null, overrides: [] },
): ResolvedDesignTokenSet => {
  let tokens: DesignTokenSet;
  let merchant: MerchantDesignTokenOverrides;
  try {
    tokens = designTokenSetSchema.parse(input);
    merchant = merchantDesignTokenOverridesSchema.parse(merchantInput);
  } catch (error) {
    throw schemaError(error);
  }
  const definitions = definitionsFor(tokens);
  const base = resolveDefinitions(definitions);
  merchant.overrides.forEach((override) => {
    const target = definitions.get(override.address);
    if (!target) {
      throw new AdaptiveTokenError(
        "TOKEN_REFERENCE_MISSING",
        `Merchant override target ${override.address} does not exist.`,
        override.address,
      );
    }
    assertTokenLiteralValue(override.value, override.address);
    const expected = base.get(override.address)?.type;
    if (expected !== override.value.$type) {
      throw new AdaptiveTokenError(
        "TOKEN_TYPE_MISMATCH",
        `Merchant override ${override.address} is ${override.value.$type}; expected ${String(expected)}.`,
        override.address,
      );
    }
    definitions.set(override.address, {
      ...target,
      source: "merchant",
      entry: override.value,
    });
  });
  const final = resolveDefinitions(definitions);
  const order = [...final.keys()].sort((left, right) => left.localeCompare(right, "en")) as DesignTokenAddress[];
  const output = Object.fromEntries(order.map((address) => [address, final.get(address)]));
  return cloneAndFreeze({ tokens: output, order }) as ResolvedDesignTokenSet;
};
