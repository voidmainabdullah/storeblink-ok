import { describe, expect, it } from "vitest";
import {
  parseRumSample,
  redactRumContext,
  RumSampleValidationError,
  validateAndRedactRumSample,
} from "./index";

const validSample = {
  storeId: "store-1",
  cohort: "v3-canary" as const,
  artifact: "v3" as const,
  publicationId: "publication-17",
  metric: "LCP" as const,
  value: 2_150,
  observedAt: "2026-08-21T10:00:00+00:00",
};

describe("RUM validation and redaction", () => {
  it("normalizes a valid sample and retains required rollout tags", () => {
    expect(parseRumSample(validSample)).toEqual({
      schemaVersion: 1,
      ...validSample,
      observedAt: "2026-08-21T10:00:00.000Z",
      context: {},
    });
  });

  it("redacts sensitive keys and values, strips route queries, and omits nested data", () => {
    const context = redactRumContext({
      route: "/products/watch?email=person@example.com#details",
      email: "person@example.com",
      note: "Contact person@example.com with token=abc123",
      nested: { cookie: "secret" },
      viewportWidth: 390,
    });
    expect(context).toEqual({
      email: "[redacted]",
      nested: "[omitted]",
      note: "Contact [redacted-email] with token=[redacted]",
      route: "/products/watch",
      viewportWidth: 390,
    });
  });

  it.each([
    [{ ...validSample, value: -1 }, /greater than or equal to 0/],
    [{ ...validSample, value: 120_001 }, /120000 milliseconds/],
    [{ ...validSample, metric: "CLS", value: 11 }, /CLS must be/],
    [{ ...validSample, metric: "render-error", value: 0.5 }, /0 for success or 1 for failure/],
    [{ ...validSample, artifact: "legacy" }, /same runtime/],
    [{ ...validSample, storeId: "person@example.com" }, /opaque identifier/],
    [{ ...validSample, observedAt: "yesterday" }, /Invalid datetime/],
  ])("rejects an invalid sample %#", (input, expected) => {
    const result = validateAndRedactRumSample(input);
    expect(result.ok).toBe(false);
    if ("issues" in result) expect(result.issues.join(" ")).toMatch(expected as RegExp);
  });

  it("throws a typed error when strict parsing fails", () => {
    expect(() => parseRumSample({ ...validSample, metric: "TTFB" })).toThrow(RumSampleValidationError);
  });
});
