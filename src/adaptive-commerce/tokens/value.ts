import type { DesignTokenLiteral, DesignTokenType, JsonValue } from "@/adaptive-commerce/contracts";
import { AdaptiveTokenError } from "./errors";

const safeCssText = (value: string): boolean =>
  value.trim().length > 0 && value.length <= 512 && !/[;{}<>]/.test(value);

const cssColor = /^(?:#[0-9a-f]{3,8}|(?:rgb|hsl|hwb|lab|lch|oklab|oklch|color)\([^;{}]+\)|transparent|currentColor)$/i;
const cssDimension = /^(?:-?(?:\d+\.?\d*|\.\d+)(?:px|rem|em|%|vw|vh|vi|vb|cqi|cqb)|0|(?:clamp|min|max|calc)\([^;{}]+\))$/i;
const cssDuration = /^(?:\d+\.?\d*|\.\d+)(?:ms|s)$/i;
const cssBezier = /^cubic-bezier\(\s*-?\d*\.?\d+\s*,\s*-?\d*\.?\d+\s*,\s*-?\d*\.?\d+\s*,\s*-?\d*\.?\d+\s*\)$/i;

const record = (value: JsonValue): Record<string, JsonValue> | null =>
  value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, JsonValue>
    : null;

const finiteNumber = (value: JsonValue): value is number =>
  typeof value === "number" && Number.isFinite(value);

const dimensionObject = (value: JsonValue): boolean => {
  const entry = record(value);
  return Boolean(
    entry &&
    Object.keys(entry).every((key) => key === "value" || key === "unit") &&
    finiteNumber(entry.value) &&
    typeof entry.unit === "string" &&
    ["px", "rem", "em", "%", "vw", "vh", "vi", "vb", "cqi", "cqb"].includes(entry.unit),
  );
};

const durationObject = (value: JsonValue): boolean => {
  const entry = record(value);
  return Boolean(
    entry &&
    Object.keys(entry).every((key) => key === "value" || key === "unit") &&
    finiteNumber(entry.value) &&
    (entry.unit === "ms" || entry.unit === "s"),
  );
};

const validForType = (type: DesignTokenType, value: JsonValue): boolean => {
  if (type === "color") return typeof value === "string" && cssColor.test(value.trim());
  if (type === "dimension") {
    return dimensionObject(value) || (typeof value === "string" && cssDimension.test(value.trim()));
  }
  if (type === "duration") {
    return durationObject(value) || (typeof value === "string" && cssDuration.test(value.trim()));
  }
  if (type === "fontFamily") {
    return (typeof value === "string" && safeCssText(value)) ||
      (Array.isArray(value) && value.length > 0 && value.every((entry) => typeof entry === "string" && safeCssText(entry)));
  }
  if (type === "fontWeight") return finiteNumber(value) && value >= 1 && value <= 1_000;
  if (type === "number") return finiteNumber(value);
  if (type === "cubicBezier") {
    return (typeof value === "string" && cssBezier.test(value.trim())) ||
      (Array.isArray(value) && value.length === 4 && value.every(finiteNumber));
  }
  if (type === "string") return typeof value === "string" && safeCssText(value);
  return typeof value === "boolean";
};

export const assertTokenLiteralValue = (
  literal: DesignTokenLiteral,
  address: string,
): void => {
  if (!validForType(literal.$type, literal.$value)) {
    throw new AdaptiveTokenError(
      "TOKEN_VALUE_INVALID",
      `${address} does not contain a valid ${literal.$type} value.`,
      address,
    );
  }
};

const numberText = (value: number): string => {
  const normalized = Object.is(value, -0) ? 0 : value;
  return Number.isInteger(normalized) ? String(normalized) : String(normalized);
};

export const tokenValueToCss = (type: DesignTokenType, value: JsonValue): string => {
  if (type === "dimension" || type === "duration") {
    const entry = record(value);
    if (entry) return `${numberText(entry.value as number)}${entry.unit as string}`;
  }
  if (type === "fontFamily" && Array.isArray(value)) return value.join(", ");
  if (type === "cubicBezier" && Array.isArray(value)) return `cubic-bezier(${value.join(", ")})`;
  if (typeof value === "number") return numberText(value);
  if (typeof value === "boolean") return value ? "1" : "0";
  return String(value).trim();
};
