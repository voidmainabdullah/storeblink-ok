import { z } from "zod";
import {
  exactVersionSchema,
  integrityHashSchema,
  packageIdSchema,
  tokenPathSchema,
} from "./identifiers";
import { jsonValueSchema, type JsonValue } from "./json";

export const DESIGN_TOKEN_TIERS = ["primitive", "semantic", "component"] as const;
export const designTokenTierSchema = z.enum(DESIGN_TOKEN_TIERS);
export type DesignTokenTier = z.infer<typeof designTokenTierSchema>;

export const DESIGN_TOKEN_TYPES = [
  "color",
  "dimension",
  "duration",
  "fontFamily",
  "fontWeight",
  "number",
  "cubicBezier",
  "string",
  "boolean",
] as const;

export const designTokenTypeSchema = z.enum(DESIGN_TOKEN_TYPES);
export type DesignTokenType = z.infer<typeof designTokenTypeSchema>;

export const designTokenAddressSchema = z.string().superRefine((value, context) => {
  const separator = value.indexOf(":");
  if (separator < 1) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "Token address requires a tier prefix." });
    return;
  }
  const tier = value.slice(0, separator);
  const path = value.slice(separator + 1);
  if (!designTokenTierSchema.safeParse(tier).success || !tokenPathSchema.safeParse(path).success) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "Token address is invalid." });
  }
}).brand<"DesignTokenAddress">();

export type DesignTokenAddress = z.infer<typeof designTokenAddressSchema>;

export const designTokenLiteralSchema = z.object({
  $type: designTokenTypeSchema,
  $value: jsonValueSchema,
  description: z.string().min(1).optional(),
}).strict();

export const designTokenReferenceSchema = z.object({
  $ref: designTokenAddressSchema,
  description: z.string().min(1).optional(),
}).strict();

export const designTokenEntrySchema = z.union([
  designTokenLiteralSchema,
  designTokenReferenceSchema,
]);

export type DesignTokenLiteral = z.infer<typeof designTokenLiteralSchema>;
export type DesignTokenReference = z.infer<typeof designTokenReferenceSchema>;
export type DesignTokenEntry = z.infer<typeof designTokenEntrySchema>;
export type DesignTokenTierValues = Record<string, DesignTokenEntry>;

const tokenTierValuesSchema: z.ZodType<DesignTokenTierValues> = z.record(
  tokenPathSchema,
  designTokenEntrySchema,
);

export const designTokenSetSchema = z.object({
  primitive: tokenTierValuesSchema,
  semantic: tokenTierValuesSchema,
  component: tokenTierValuesSchema,
}).strict();

export type DesignTokenSet = z.infer<typeof designTokenSetSchema>;

export const designTokenOverrideSchema = z.object({
  address: designTokenAddressSchema.refine(
    (value) => !value.startsWith("primitive:"),
    "Merchant overrides may target semantic or component tokens only.",
  ),
  value: designTokenLiteralSchema,
}).strict();

export type DesignTokenOverride = z.infer<typeof designTokenOverrideSchema>;

export const merchantDesignTokenOverridesSchema = z.object({
  presetId: packageIdSchema.nullable(),
  overrides: z.array(designTokenOverrideSchema),
}).strict().superRefine((value, context) => {
  const seen = new Set<string>();
  value.overrides.forEach((override, index) => {
    if (seen.has(override.address)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["overrides", index, "address"],
        message: `Duplicate merchant token override ${override.address}.`,
      });
    }
    seen.add(override.address);
  });
});

export type MerchantDesignTokenOverrides = z.infer<typeof merchantDesignTokenOverridesSchema>;

export const designPackPresetSchema = z.object({
  id: packageIdSchema,
  name: z.string().min(1),
  overrides: z.array(designTokenOverrideSchema),
}).strict().superRefine((value, context) => {
  const addresses = new Set<string>();
  value.overrides.forEach((override, index) => {
    if (addresses.has(override.address)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["overrides", index, "address"],
        message: `Duplicate preset token override ${override.address}.`,
      });
    }
    addresses.add(override.address);
  });
});

export const designPackSchema = z.object({
  kind: z.literal("design-pack"),
  id: packageIdSchema,
  version: exactVersionSchema,
  integrity: integrityHashSchema,
  schemaVersion: z.number().int().positive(),
  tokenSchemaVersion: z.literal("2025.10"),
  name: z.string().min(1),
  description: z.string().min(1),
  tokens: designTokenSetSchema,
  presets: z.array(designPackPresetSchema),
}).strict().superRefine((value, context) => {
  const presetIds = new Set<string>();
  value.presets.forEach((preset, index) => {
    if (presetIds.has(preset.id)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["presets", index, "id"],
        message: `Duplicate DesignPack preset ${preset.id}.`,
      });
    }
    presetIds.add(preset.id);
  });
});

export type DesignPack = z.infer<typeof designPackSchema>;
export type DesignPackPreset = z.infer<typeof designPackPresetSchema>;

export const tokenAddress = (tier: DesignTokenTier, path: string): DesignTokenAddress =>
  designTokenAddressSchema.parse(`${tier}:${path}`);

export const tokenLiteral = (
  type: DesignTokenType,
  value: JsonValue,
): DesignTokenLiteral => designTokenLiteralSchema.parse({ $type: type, $value: value });
