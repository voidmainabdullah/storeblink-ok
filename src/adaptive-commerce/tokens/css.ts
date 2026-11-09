import {
  designTokenAddressSchema,
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
import { tokenPathSchema } from "@/adaptive-commerce/contracts/identifiers";
import { AdaptiveTokenError } from "./errors";
import { resolveDesignTokens } from "./resolver";
import { tokenValueToCss } from "./value";

export const ADAPTIVE_CASCADE_LAYERS = [
  "reset",
  "platform",
  "theme",
  "components",
  "merchant",
  "utilities",
] as const;

const layerForTier: Record<DesignTokenTier, "platform" | "theme" | "components"> = {
  primitive: "platform",
  semantic: "theme",
  component: "components",
};

const addressParts = (address: string): { tier: DesignTokenTier; path: string } => {
  const [tier, path] = address.split(":", 2);
  return { tier: tier as DesignTokenTier, path };
};

export const tokenCssVariable = (addressOrPath: string): string => {
  const parsed = addressOrPath.includes(":")
    ? designTokenAddressSchema.safeParse(addressOrPath)
    : tokenPathSchema.safeParse(addressOrPath);
  if (!parsed.success) {
    throw new AdaptiveTokenError(
      "TOKEN_SCHEMA_INVALID",
      `Cannot emit an invalid design token path: ${addressOrPath}.`,
      addressOrPath,
    );
  }
  const path = addressOrPath.includes(":") ? addressParts(addressOrPath).path : addressOrPath;
  return `--sb-${path.replace(/\./g, "-")}`;
};

const isReference = (entry: DesignTokenEntry): entry is DesignTokenReference =>
  typeof (entry as DesignTokenReference).$ref === "string";

const declarationValue = (entry: DesignTokenEntry): string => {
  if (isReference(entry)) return `var(${tokenCssVariable(entry.$ref)})`;
  const literal = entry as DesignTokenLiteral;
  return tokenValueToCss(literal.$type, literal.$value);
};

const block = (layer: string, declarations: readonly string[]): string => {
  if (!declarations.length) return `@layer ${layer} {}`;
  return `@layer ${layer} {\n  :root {\n${declarations.map((entry) => `    ${entry}`).join("\n")}\n  }\n}`;
};

export const emitAdaptiveTokenCss = (
  input: DesignTokenSet,
  merchantInput: MerchantDesignTokenOverrides = { presetId: null, overrides: [] },
): string => {
  resolveDesignTokens(input, merchantInput);
  const tokens = designTokenSetSchema.parse(input);
  const merchant = merchantDesignTokenOverridesSchema.parse(merchantInput);
  const names = new Map<string, string>();
  (["primitive", "semantic", "component"] as const).forEach((tier) => {
    Object.keys(tokens[tier]).forEach((path) => {
      const variable = tokenCssVariable(path);
      const previous = names.get(variable);
      if (previous && previous !== `${tier}:${path}`) {
        throw new AdaptiveTokenError(
          "TOKEN_CSS_NAME_COLLISION",
          `${previous} and ${tier}:${path} compile to ${variable}.`,
          `${tier}:${path}`,
        );
      }
      names.set(variable, `${tier}:${path}`);
    });
  });
  const declarations: Record<(typeof ADAPTIVE_CASCADE_LAYERS)[number], string[]> = {
    reset: [],
    platform: [],
    theme: [],
    components: [],
    merchant: [],
    utilities: [],
  };
  (["primitive", "semantic", "component"] as const).forEach((tier) => {
    Object.entries(tokens[tier])
      .sort(([left], [right]) => left.localeCompare(right, "en"))
      .forEach(([path, entry]) => {
        declarations[layerForTier[tier]].push(`${tokenCssVariable(path)}: ${declarationValue(entry)};`);
      });
  });
  [...merchant.overrides]
    .sort((left, right) => left.address.localeCompare(right.address, "en"))
    .forEach((override) => {
      declarations.merchant.push(
        `${tokenCssVariable(override.address as DesignTokenAddress)}: ${declarationValue(override.value)};`,
      );
    });
  return [
    `@layer ${ADAPTIVE_CASCADE_LAYERS.join(", ")};`,
    ...ADAPTIVE_CASCADE_LAYERS.map((layer) => block(layer, declarations[layer])),
  ].join("\n\n");
};
