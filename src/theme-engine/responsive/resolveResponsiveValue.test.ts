import { describe, expect, it } from "vitest";
import { resolveResponsiveValue } from "./resolveResponsiveValue";

describe("resolveResponsiveValue", () => {
  it("inherits mobile values through tablet and base before defaults", () => {
    expect(resolveResponsiveValue(
      { base: 4, tablet: 2 },
      "mobile",
      3,
      1,
    )).toBe(2);
    expect(resolveResponsiveValue(
      { base: 4 },
      "tablet",
      3,
      1,
    )).toBe(4);
    expect(resolveResponsiveValue<number>(undefined, "desktop", 3, 1)).toBe(3);
  });

  it("preserves explicit scalar values", () => {
    expect(resolveResponsiveValue(0, "mobile", 8, 4)).toBe(0);
  });
});
