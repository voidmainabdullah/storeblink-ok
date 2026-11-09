import {
  designTokenSetSchema,
  tokenAddress,
  tokenLiteral,
  type DesignTokenEntry,
  type DesignTokenSet,
  type DesignTokenTier,
  type DesignTokenType,
} from "@/adaptive-commerce/contracts/designPack";
import type { JsonValue } from "@/adaptive-commerce/contracts/json";
import type { ThemeDesignTokens } from "@/theme-engine/contracts";
import { AdaptiveTokenError } from "./errors";

type MutableTokenSet = Record<DesignTokenTier, Record<string, DesignTokenEntry>>;

const legacyKeyToSegment = (key: string): string => key
  .replace(/([a-z0-9])([A-Z])/g, "$1-$2")
  .toLowerCase();

const sortedEntries = <T>(value: Readonly<Record<string, T>>): Array<[string, T]> =>
  Object.entries(value).sort(([left], [right]) => left.localeCompare(right, "en"));

const add = (
  output: MutableTokenSet,
  tier: DesignTokenTier,
  path: string,
  entry: DesignTokenEntry,
): void => {
  if (output[tier][path]) {
    throw new AdaptiveTokenError(
      "TOKEN_COMPATIBILITY_COLLISION",
      `Legacy theme keys compile to duplicate token ${tier}:${path}.`,
      `${tier}:${path}`,
    );
  }
  output[tier][path] = entry;
};

const addLiteral = (
  output: MutableTokenSet,
  tier: DesignTokenTier,
  path: string,
  type: DesignTokenType,
  value: JsonValue,
): void => add(output, tier, path, tokenLiteral(type, value));

const addReference = (
  output: MutableTokenSet,
  tier: DesignTokenTier,
  path: string,
  targetTier: DesignTokenTier,
  targetPath: string,
): void => add(output, tier, path, { $ref: tokenAddress(targetTier, targetPath) });

const addLegacyScale = (
  output: MutableTokenSet,
  values: Readonly<Record<string, string>>,
  primitivePrefix: string,
  semanticPrefix: string,
  type: DesignTokenType,
): string[] => {
  const semanticPaths: string[] = [];
  sortedEntries(values).forEach(([legacyKey, value]) => {
    const key = legacyKeyToSegment(legacyKey);
    const primitivePath = `${primitivePrefix}.${key}`;
    const semanticPath = `${semanticPrefix}.${key}`;
    addLiteral(output, "primitive", primitivePath, type, value);
    addReference(output, "semantic", semanticPath, "primitive", primitivePath);
    semanticPaths.push(semanticPath);
  });
  return semanticPaths;
};

/**
 * Converts the currently installed ThemeDesignTokens contract into the
 * canonical three-tier DesignTokenSet without changing the legacy runtime.
 */
export const adaptThemeDesignTokens = (legacy: ThemeDesignTokens): DesignTokenSet => {
  const output: MutableTokenSet = { primitive: {}, semantic: {}, component: {} };

  sortedEntries(legacy.colors).forEach(([legacyKey, value]) => {
    const key = legacyKeyToSegment(legacyKey);
    const primitivePath = `color.palette.${key}`;
    addLiteral(output, "primitive", primitivePath, "color", value);
    addReference(output, "semantic", `color.${key}`, "primitive", primitivePath);
  });

  const fontFamilies = {
    body: legacy.typography.bodyFont,
    editorial: legacy.typography.editorialFont,
    heading: legacy.typography.headingFont,
  };
  sortedEntries(fontFamilies).forEach(([key, value]) => {
    const primitivePath = `font.source.${key}`;
    addLiteral(output, "primitive", primitivePath, "fontFamily", value);
    addReference(output, "semantic", `font.${key}`, "primitive", primitivePath);
  });

  const typePaths = addLegacyScale(
    output,
    legacy.typography.scale,
    "type.scale-source",
    "type",
    "dimension",
  );
  const spacingPaths = addLegacyScale(
    output,
    legacy.spacing,
    "space.scale-source",
    "space",
    "dimension",
  );
  addLegacyScale(output, legacy.radii, "radius.scale-source", "radius", "dimension");
  addLegacyScale(output, legacy.containers, "container.width-source", "container", "dimension");

  (["fast", "normal", "slow"] as const).forEach((key) => {
    const primitivePath = `motion.duration-source.${key}`;
    addLiteral(output, "primitive", primitivePath, "duration", legacy.motion[key]);
    addReference(output, "semantic", `motion.${key}`, "primitive", primitivePath);
  });
  addLiteral(output, "primitive", "motion.curve-source.standard", "cubicBezier", legacy.motion.easing);
  addReference(output, "semantic", "motion.easing", "primitive", "motion.curve-source.standard");

  addReference(output, "component", "button.primary.background", "semantic", "color.primary");
  addReference(output, "component", "button.primary.foreground", "semantic", "color.on-primary");
  addReference(output, "component", "button.primary.radius", "semantic", "radius.medium");
  addReference(output, "component", "button.primary.duration", "semantic", "motion.fast");
  addReference(output, "component", "hero.heading.color", "semantic", "color.text");
  addReference(output, "component", "hero.heading.font", "semantic", "font.heading");
  addReference(output, "component", "card.surface.background", "semantic", "color.surface");
  addReference(output, "component", "card.surface.radius", "semantic", "radius.medium");
  addReference(output, "component", "product.price.color", "semantic", "color.text");

  typePaths.forEach((path) => {
    addReference(output, "component", `text.${path.slice("type.".length)}`, "semantic", path);
  });
  spacingPaths.forEach((path) => {
    addReference(output, "component", `layout.${path}`, "semantic", path);
  });

  try {
    return designTokenSetSchema.parse(output);
  } catch (error) {
    throw new AdaptiveTokenError(
      "TOKEN_SCHEMA_INVALID",
      error instanceof Error ? error.message : "Legacy theme tokens cannot be adapted.",
    );
  }
};
