import { z } from "zod";
import { assertOpaqueRolloutId } from "./cohort";
import {
  RUM_METRICS,
  type RumSample,
  type RumValidationResult,
  type SafeRumContext,
  type SafeRumContextValue,
} from "./types";

const MAX_CONTEXT_ENTRIES = 24;
const MAX_CONTEXT_STRING_LENGTH = 256;
const contextKey = /^[A-Za-z][A-Za-z0-9_.-]{0,63}$/;
const sensitiveKey = /(?:authorization|cookie|email|phone|password|secret|token|customer|user(?:id)?|address|message|stack)/i;
const email = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi;
const bearer = /\bBearer\s+[A-Za-z0-9._~+/=-]+/gi;
const secretAssignment = /\b(token|secret|password|authorization)=([^\s&#]+)/gi;

const rumInputSchema = z.object({
  storeId: z.string().trim().min(1).max(128),
  cohort: z.enum(["legacy-control", "v3-canary"]),
  artifact: z.enum(["legacy", "v3"]),
  publicationId: z.string().trim().min(1).max(128),
  metric: z.enum(RUM_METRICS),
  value: z.number().finite().nonnegative(),
  observedAt: z.string().datetime({ offset: true }),
  context: z.record(z.unknown()).optional(),
}).strict().superRefine((sample, refinement) => {
  if (
    (sample.cohort === "v3-canary" && sample.artifact !== "v3") ||
    (sample.cohort === "legacy-control" && sample.artifact !== "legacy")
  ) {
    refinement.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["artifact"],
      message: "Artifact and cohort tags must describe the same runtime.",
    });
  }
  if ((sample.metric === "LCP" || sample.metric === "INP") && sample.value > 120_000) {
    refinement.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["value"],
      message: `${sample.metric} must be between 0 and 120000 milliseconds.`,
    });
  }
  if (sample.metric === "CLS" && sample.value > 10) {
    refinement.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["value"],
      message: "CLS must be between 0 and 10.",
    });
  }
  if (sample.metric === "render-error" && sample.value !== 0 && sample.value !== 1) {
    refinement.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["value"],
      message: "Render error observations must use 0 for success or 1 for failure.",
    });
  }
});

const redactText = (value: string): string =>
  value
    .replace(email, "[redacted-email]")
    .replace(bearer, "Bearer [redacted]")
    .replace(secretAssignment, "$1=[redacted]")
    .slice(0, MAX_CONTEXT_STRING_LENGTH);

const safeRoute = (value: string): string => {
  const withoutFragment = value.split("#", 1)[0];
  const withoutQuery = withoutFragment.split("?", 1)[0];
  return withoutQuery.startsWith("/") && !withoutQuery.startsWith("//")
    ? redactText(withoutQuery)
    : "[redacted-route]";
};

const safeContextValue = (key: string, value: unknown): SafeRumContextValue => {
  if (sensitiveKey.test(key)) return "[redacted]";
  if (value === null) return null;
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return Number.isFinite(value) ? value : "[invalid-number]";
  if (typeof value === "string") {
    return key.toLowerCase() === "route" ? safeRoute(value) : redactText(value);
  }
  return "[omitted]";
};

export const redactRumContext = (value: unknown): SafeRumContext => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return Object.freeze({});
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([key]) => contextKey.test(key))
    .sort(([left], [right]) => left.localeCompare(right))
    .slice(0, MAX_CONTEXT_ENTRIES)
    .map(([key, entry]) => [key, safeContextValue(key, entry)] as const);
  return Object.freeze(Object.fromEntries(entries));
};

export const validateAndRedactRumSample = (value: unknown): RumValidationResult => {
  const parsed = rumInputSchema.safeParse(value);
  if (!parsed.success) {
    return {
      ok: false,
      issues: parsed.error.issues.map((issue) => {
        const path = issue.path.length ? `${issue.path.join(".")}: ` : "";
        return `${path}${issue.message}`;
      }),
    };
  }
  try {
    const storeId = assertOpaqueRolloutId(parsed.data.storeId, "Store id");
    const publicationId = assertOpaqueRolloutId(parsed.data.publicationId, "Publication id");
    return {
      ok: true,
      sample: Object.freeze({
        schemaVersion: 1,
        storeId,
        cohort: parsed.data.cohort,
        artifact: parsed.data.artifact,
        publicationId,
        metric: parsed.data.metric,
        value: parsed.data.value,
        observedAt: new Date(parsed.data.observedAt).toISOString(),
        context: redactRumContext(parsed.data.context),
      }),
    };
  } catch (error) {
    return {
      ok: false,
      issues: [error instanceof Error ? error.message : "RUM sample identifiers are invalid."],
    };
  }
};

export class RumSampleValidationError extends Error {
  readonly issues: readonly string[];

  constructor(issues: readonly string[]) {
    super(issues[0] ?? "RUM sample is invalid.");
    this.name = "RumSampleValidationError";
    this.issues = [...issues];
  }
}

export const parseRumSample = (value: unknown): RumSample => {
  const result = validateAndRedactRumSample(value);
  if ("issues" in result) throw new RumSampleValidationError(result.issues);
  return result.sample;
};
